import {
  adjustStockSchema,
  createRecipeSchema,
  createStockItemSchema,
  createSupplierSchema,
  stockCountSchema,
} from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";
import { isStockEnabled } from "./settings.js";

interface DepletionLine {
  itemId: string;
  quantity: number;
  referenceId: string;
  orderId: string;
}

async function applyDeltas(
  db: Db,
  tenantId: string,
  venueId: string,
  deltas: Map<string, number>,
  actorUserId: string | null,
  reason: string,
): Promise<void> {
  for (const [stockItemId, delta] of deltas) {
    if (!delta) continue;
    const stock = await db
      .selectFrom("stock_items")
      .select("quantity")
      .where("id", "=", stockItemId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    if (!stock) continue;

    await db
      .insertInto("stock_movements")
      .values({
        id: newId(),
        tenant_id: tenantId,
        venue_id: venueId,
        stock_item_id: stockItemId,
        type: "adjustment",
        quantity_delta: delta,
        reason,
        reference_id: null,
        order_id: null,
        actor_user_id: actorUserId,
        created_at: new Date().toISOString(),
      })
      .execute();

    await db
      .updateTable("stock_items")
      .set({ quantity: stock.quantity + delta, updated_at: new Date().toISOString() })
      .where("id", "=", stockItemId)
      .where("tenant_id", "=", tenantId)
      .execute();
  }
}

export async function depleteStockForOrder(
  db: Db,
  tenantId: string,
  venueId: string,
  lines: DepletionLine[],
  actorUserId: string | null,
): Promise<void> {
  if (!(await isStockEnabled(db, tenantId, venueId))) return;
  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  if (!itemIds.length) return;

  const recipes = await db
    .selectFrom("recipes")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("menu_item_id", "in", itemIds)
    .execute();

  for (const line of lines) {
    for (const recipe of recipes.filter(
      (entry) => entry.menu_item_id === line.itemId,
    )) {
      const existing = await db
        .selectFrom("stock_movements")
        .select("id")
        .where("tenant_id", "=", tenantId)
        .where("reference_id", "=", line.referenceId)
        .where("stock_item_id", "=", recipe.stock_item_id)
        .where("type", "=", "sale")
        .executeTakeFirst();
      if (existing) continue;

      const delta = -recipe.quantity * line.quantity;
      await db
        .insertInto("stock_movements")
        .values({
          id: newId(),
          tenant_id: tenantId,
          venue_id: venueId,
          stock_item_id: recipe.stock_item_id,
          type: "sale",
          quantity_delta: delta,
          reason: null,
          reference_id: line.referenceId,
          order_id: line.orderId,
          actor_user_id: actorUserId,
          created_at: new Date().toISOString(),
        })
        .execute();

      const stock = await db
        .selectFrom("stock_items")
        .select("quantity")
        .where("id", "=", recipe.stock_item_id)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (stock) {
        await db
          .updateTable("stock_items")
          .set({
            quantity: stock.quantity + delta,
            updated_at: new Date().toISOString(),
          })
          .where("id", "=", recipe.stock_item_id)
          .where("tenant_id", "=", tenantId)
          .execute();
      }
    }
  }
}

export async function reverseStockForOrder(
  db: Db,
  tenantId: string,
  orderId: string,
  actorUserId: string | null,
): Promise<void> {
  const sales = await db
    .selectFrom("stock_movements")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("order_id", "=", orderId)
    .where("type", "=", "sale")
    .execute();

  for (const sale of sales) {
    if (!sale.reference_id) continue;
    const existing = await db
      .selectFrom("stock_movements")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("reference_id", "=", sale.reference_id)
      .where("stock_item_id", "=", sale.stock_item_id)
      .where("type", "=", "void")
      .executeTakeFirst();
    if (existing) continue;

    await db
      .insertInto("stock_movements")
      .values({
        id: newId(),
        tenant_id: tenantId,
        venue_id: sale.venue_id,
        stock_item_id: sale.stock_item_id,
        type: "void",
        quantity_delta: -sale.quantity_delta,
        reason: "Order voided",
        reference_id: sale.reference_id,
        order_id: orderId,
        actor_user_id: actorUserId,
        created_at: new Date().toISOString(),
      })
      .execute();

    const stock = await db
      .selectFrom("stock_items")
      .select("quantity")
      .where("id", "=", sale.stock_item_id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    if (stock) {
      await db
        .updateTable("stock_items")
        .set({
          quantity: stock.quantity - sale.quantity_delta,
          updated_at: new Date().toISOString(),
        })
        .where("id", "=", sale.stock_item_id)
        .where("tenant_id", "=", tenantId)
        .execute();
    }
  }
}

export function registerStockRoutes(app: Hono<AppEnv>, db: Db) {
  app.get(
    "/api/stock",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const items = await db
      .selectFrom("stock_items")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .orderBy("name")
      .execute();
    return context.json(
      items.map((item) => ({
        ...item,
        is_low: item.quantity <= item.par_level,
      })),
    );
  });

  app.get(
    "/api/stock/alerts",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const items = await db
      .selectFrom("stock_items")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .where("par_level", ">", 0)
      .orderBy("name")
      .execute();
    return context.json(
      items
        .filter((item) => item.quantity <= item.par_level)
        .map((item) => ({
          ...item,
          shortfall: item.par_level - item.quantity,
        })),
    );
  });

  app.post(
    "/api/stock",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createStockItemSchema.safeParse({
        ...(body as Record<string, unknown> | null),
        venue_id: (body as { venue_id?: string } | null)?.venue_id,
      });
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const venue = await resolveVenue(
        db,
        auth.tenantId,
        (body as { venue_id?: string } | null)?.venue_id,
      );
      if (!venue) return context.json({ error: "venue_not_found" }, 404);
      const now = new Date().toISOString();
      const item = {
        id: newId(),
        tenant_id: auth.tenantId,
        venue_id: venue.id,
        ...parsed.data,
        created_at: now,
        updated_at: now,
      };
      await db.insertInto("stock_items").values(item).execute();
      return context.json(item, 201);
    },
  );

  app.post(
    "/api/stock/:id/adjust",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = adjustStockSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const item = await db
        .selectFrom("stock_items")
        .selectAll()
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!item) return context.json({ error: "stock_item_not_found" }, 404);

      await db.transaction().execute(async (trx) => {
        await applyDeltas(
          trx,
          auth.tenantId,
          item.venue_id,
          new Map([[item.id, parsed.data.quantity_delta]]),
          auth.userId,
          parsed.data.reason,
        );
      });

      return context.json({ ...item, quantity: item.quantity + parsed.data.quantity_delta });
    },
  );

  app.post(
    "/api/stock/:id/count",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = stockCountSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const item = await db
        .selectFrom("stock_items")
        .selectAll()
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!item) return context.json({ error: "stock_item_not_found" }, 404);

      const delta = parsed.data.counted_quantity - item.quantity;
      await db.transaction().execute(async (trx) => {
        await applyDeltas(
          trx,
          auth.tenantId,
          item.venue_id,
          new Map([[item.id, delta]]),
          auth.userId,
          parsed.data.reason,
        );
      });

      return context.json({ ...item, quantity: parsed.data.counted_quantity });
    },
  );

  app.get(
    "/api/stock/movements",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);
    const stockItemId = context.req.query("stock_item_id");
    let query = db
      .selectFrom("stock_movements")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id);
    if (stockItemId) query = query.where("stock_item_id", "=", stockItemId);
    const movements = await query
      .orderBy("created_at", "desc")
      .execute();
    return context.json(movements);
  });

  app.post(
    "/api/recipes",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createRecipeSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const [menuItem, stockItem] = await Promise.all([
        db
          .selectFrom("menu_items")
          .select("id")
          .where("id", "=", parsed.data.menu_item_id)
          .where("tenant_id", "=", auth.tenantId)
          .executeTakeFirst(),
        db
          .selectFrom("stock_items")
          .select("id")
          .where("id", "=", parsed.data.stock_item_id)
          .where("tenant_id", "=", auth.tenantId)
          .executeTakeFirst(),
      ]);
      if (!menuItem || !stockItem) {
        return context.json({ error: "invalid_reference" }, 400);
      }

      const recipe = {
        id: newId(),
        tenant_id: auth.tenantId,
        ...parsed.data,
        created_at: new Date().toISOString(),
      };
      await db
        .insertInto("recipes")
        .values(recipe)
        .onConflict((conflict) =>
          conflict.columns(["tenant_id", "menu_item_id", "stock_item_id"]).doUpdateSet({
            quantity: parsed.data.quantity,
          }),
        )
        .execute();
      return context.json(recipe, 201);
    },
  );

  app.get(
    "/api/recipes",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const recipes = await db
      .selectFrom("recipes")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .execute();
    return context.json(recipes);
  });

  app.get(
    "/api/suppliers",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);
    const suppliers = await db
      .selectFrom("suppliers")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .orderBy("name")
      .execute();
    return context.json(suppliers);
  });

  app.post(
    "/api/suppliers",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createSupplierSchema.safeParse({
        ...(body as Record<string, unknown> | null),
        venue_id: (body as { venue_id?: string } | null)?.venue_id,
      });
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const venue = await resolveVenue(
        db,
        auth.tenantId,
        (body as { venue_id?: string } | null)?.venue_id,
      );
      if (!venue) return context.json({ error: "venue_not_found" }, 404);
      const supplier = {
        id: newId(),
        tenant_id: auth.tenantId,
        venue_id: venue.id,
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        created_at: new Date().toISOString(),
      };
      await db.insertInto("suppliers").values(supplier).execute();
      return context.json(supplier, 201);
    },
  );
}
