import {
  addOrderItemsSchema,
  createOrderSchema,
  orderStatusSchema,
  type CreateOrderItem,
} from "@hpos/contracts";
import type { Db } from "@hpos/db";
import {
  assertTransition,
  lineTotalMinor,
  newId,
  orderTotals,
  type OrderState,
} from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

async function loadOrder(db: Db, tenantId: string, orderId: string) {
  const order = await db
    .selectFrom("orders")
    .selectAll()
    .where("id", "=", orderId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!order) return null;

  const items = await db
    .selectFrom("order_items")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("order_id", "=", orderId)
    .orderBy("created_at")
    .execute();

  const itemIds = items.map((item) => item.id);
  const modifiers = itemIds.length
    ? await db
        .selectFrom("order_item_modifiers")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("order_item_id", "in", itemIds)
        .execute()
    : [];

  return {
    ...order,
    items: items.map((item) => ({
      id: item.id,
      item_id: item.item_id,
      name: item.name_snapshot,
      unit_price_minor: item.unit_price_minor,
      quantity: item.quantity,
      tax_rate: item.tax_rate,
      line_total_minor: item.line_total_minor,
      notes: item.notes,
      status: item.status,
      modifiers: modifiers
        .filter((modifier) => modifier.order_item_id === item.id)
        .map((modifier) => ({
          id: modifier.id,
          modifier_id: modifier.modifier_id,
          name: modifier.name_snapshot,
          price_delta_minor: modifier.price_delta_minor,
        })),
    })),
  };
}

interface PricedLine {
  item: {
    id: string;
    name: string;
    price_minor: number;
    tax_rate: number;
  };
  quantity: number;
  notes: string | null;
  unitPriceMinor: number;
  lineTotalMinor: number;
  modifiers: Array<{
    id: string;
    name: string;
    price_delta_minor: number;
  }>;
}

type PricedLines = { lines: PricedLine[] } | { error: string };

async function priceOrderLines(
  db: Db,
  tenantId: string,
  venueId: string,
  requestedItems: CreateOrderItem[],
): Promise<PricedLines> {
  const itemIds = [...new Set(requestedItems.map((item) => item.item_id))];
  const modifierIds = [
    ...new Set(requestedItems.flatMap((item) => item.modifier_ids ?? [])),
  ];

  const [menuItems, modifiers, groups, links, prices] = await Promise.all([
    db
      .selectFrom("menu_items")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "in", itemIds)
      .execute(),
    modifierIds.length
      ? db
          .selectFrom("modifiers")
          .selectAll()
          .where("tenant_id", "=", tenantId)
          .where("id", "in", modifierIds)
          .execute()
      : Promise.resolve([]),
    db
      .selectFrom("modifier_groups")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .execute(),
    db
      .selectFrom("menu_item_modifier_groups")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("item_id", "in", itemIds)
      .execute(),
    db
      .selectFrom("venue_prices")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("venue_id", "=", venueId)
      .where("item_id", "in", itemIds)
      .execute(),
  ]);

  if (menuItems.length !== itemIds.length) {
    return { error: "unknown_item" };
  }
  if (modifiers.length !== modifierIds.length) {
    return { error: "unknown_modifier" };
  }

  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
  const modifiersById = new Map(
    modifiers.map((modifier) => [modifier.id, modifier]),
  );
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const priceByItem = new Map(
    prices.map((price) => [price.item_id, price.price_minor]),
  );

  const allowedGroupsByItem = new Map<string, Set<string>>();
  for (const link of links) {
    const allowed = allowedGroupsByItem.get(link.item_id) ?? new Set<string>();
    allowed.add(link.group_id);
    allowedGroupsByItem.set(link.item_id, allowed);
  }

  const lines: PricedLine[] = [];

  for (const requested of requestedItems) {
    const item = menuItemsById.get(requested.item_id);
    if (!item || item.is_available !== 1) {
      return { error: "item_unavailable" };
    }

    const chosen = (requested.modifier_ids ?? []).map((modifierId) =>
      modifiersById.get(modifierId),
    );
    if (chosen.some((modifier) => !modifier)) {
      return { error: "unknown_modifier" };
    }

    const chosenModifiers = chosen as Array<(typeof modifiers)[number]>;
    const allowedGroups = allowedGroupsByItem.get(item.id) ?? new Set<string>();

    for (const modifier of chosenModifiers) {
      if (!allowedGroups.has(modifier.group_id)) {
        return { error: "modifier_not_allowed" };
      }
    }

    const counts = new Map<string, number>();
    for (const modifier of chosenModifiers) {
      counts.set(modifier.group_id, (counts.get(modifier.group_id) ?? 0) + 1);
    }

    for (const groupId of allowedGroups) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      const count = counts.get(groupId) ?? 0;
      if (count < group.min_select) {
        return { error: "modifier_required" };
      }
      if (count > group.max_select) {
        return { error: "too_many_modifiers" };
      }
    }

    const modifierDelta = chosenModifiers.reduce(
      (sum, modifier) => sum + modifier.price_delta_minor,
      0,
    );
    const unitPriceMinor = priceByItem.get(item.id) ?? item.price_minor;

    lines.push({
      item,
      quantity: requested.quantity,
      notes: requested.notes ?? null,
      unitPriceMinor,
      lineTotalMinor: lineTotalMinor(
        unitPriceMinor,
        requested.quantity,
        modifierDelta,
      ),
      modifiers: chosenModifiers,
    });
  }

  return { lines };
}

function buildItemRows(
  tenantId: string,
  orderId: string,
  lines: PricedLine[],
  now: string,
) {
  const itemRows: Array<{
    id: string;
    tenant_id: string;
    order_id: string;
    item_id: string;
    name_snapshot: string;
    unit_price_minor: number;
    quantity: number;
    tax_rate: number;
    line_total_minor: number;
    notes: string | null;
    status: string;
    created_at: string;
  }> = [];
  const modifierRows: Array<{
    id: string;
    tenant_id: string;
    order_item_id: string;
    modifier_id: string;
    name_snapshot: string;
    price_delta_minor: number;
  }> = [];

  for (const line of lines) {
    const orderItemId = newId();
    itemRows.push({
      id: orderItemId,
      tenant_id: tenantId,
      order_id: orderId,
      item_id: line.item.id,
      name_snapshot: line.item.name,
      unit_price_minor: line.unitPriceMinor,
      quantity: line.quantity,
      tax_rate: line.item.tax_rate,
      line_total_minor: line.lineTotalMinor,
      notes: line.notes,
      status: "pending",
      created_at: now,
    });

    for (const modifier of line.modifiers) {
      modifierRows.push({
        id: newId(),
        tenant_id: tenantId,
        order_item_id: orderItemId,
        modifier_id: modifier.id,
        name_snapshot: modifier.name,
        price_delta_minor: modifier.price_delta_minor,
      });
    }
  }

  return { itemRows, modifierRows };
}

export function registerOrderRoutes(app: Hono<AppEnv>, db: Db) {
  app.post("/api/orders", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;
    const venue = await resolveVenue(db, auth.tenantId, input.venue_id);
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    if (input.idempotency_key) {
      const existing = await db
        .selectFrom("orders")
        .select(["id", "venue_id"])
        .where("tenant_id", "=", auth.tenantId)
        .where("idempotency_key", "=", input.idempotency_key)
        .executeTakeFirst();

      if (existing) {
        if (existing.venue_id !== venue.id) {
          return context.json({ error: "idempotency_conflict" }, 409);
        }
        return context.json(
          await loadOrder(db, auth.tenantId, existing.id),
          200,
        );
      }
    }

    let table = null;
    if (input.table_id) {
      table = await db
        .selectFrom("dining_tables")
        .selectAll()
        .where("id", "=", input.table_id)
        .where("tenant_id", "=", auth.tenantId)
        .where("venue_id", "=", venue.id)
        .executeTakeFirst();

      if (!table) return context.json({ error: "table_not_found" }, 404);
      if (table.status === "occupied") {
        return context.json({ error: "table_occupied" }, 409);
      }
    }

    const priced = await priceOrderLines(
      db,
      auth.tenantId,
      venue.id,
      input.items,
    );
    if ("error" in priced) {
      return context.json({ error: priced.error }, 400);
    }
    const { lines } = priced;

    const totals = orderTotals(
      lines.map((line) => ({
        totalMinor: line.lineTotalMinor,
        taxRate: line.item.tax_rate,
      })),
    );

    const countRow = await db
      .selectFrom("orders")
      .select((expression) => expression.fn.countAll().as("count"))
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .executeTakeFirst();

    const now = new Date().toISOString();
    const orderId = newId();
    const number = `#${String(Number(countRow?.count ?? 0) + 1).padStart(4, "0")}`;

    const { itemRows, modifierRows } = buildItemRows(
      auth.tenantId,
      orderId,
      lines,
      now,
    );

    try {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("orders")
          .values({
            id: orderId,
            tenant_id: auth.tenantId,
            venue_id: venue.id,
            table_id: table?.id ?? null,
            number,
            status: "open",
            subtotal_minor: totals.subtotalMinor,
            tax_minor: totals.taxMinor,
            total_minor: totals.totalMinor,
            notes: input.notes ?? null,
            idempotency_key: input.idempotency_key ?? null,
            opened_by: auth.userId,
            created_at: now,
            updated_at: now,
            closed_at: null,
          })
          .execute();

        await trx.insertInto("order_items").values(itemRows).execute();

        if (modifierRows.length) {
          await trx
            .insertInto("order_item_modifiers")
            .values(modifierRows)
            .execute();
        }

        await trx
          .insertInto("order_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            order_id: orderId,
            type: "opened",
            data: JSON.stringify({
              table_id: table?.id ?? null,
              item_count: input.items.length,
            }),
            idempotency_key: null,
            actor_user_id: auth.userId,
            created_at: now,
          })
          .execute();

        if (table) {
          await trx
            .updateTable("dining_tables")
            .set({ status: "occupied" })
            .where("id", "=", table.id)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
        }
      });
    } catch (error) {
      if (input.idempotency_key) {
        const existing = await db
          .selectFrom("orders")
          .select(["id", "venue_id"])
          .where("tenant_id", "=", auth.tenantId)
          .where("idempotency_key", "=", input.idempotency_key)
          .executeTakeFirst();

        if (existing?.venue_id === venue.id) {
          return context.json(
            await loadOrder(db, auth.tenantId, existing.id),
            200,
          );
        }
      }
      throw error;
    }

    return context.json(await loadOrder(db, auth.tenantId, orderId), 201);
  });

  app.post("/api/orders/:id/items", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = addOrderItemsSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order) return context.json({ error: "order_not_found" }, 404);
    if (order.status === "closed" || order.status === "voided") {
      return context.json({ error: "order_closed" }, 409);
    }

    if (input.idempotency_key) {
      const existingEvent = await db
        .selectFrom("order_events")
        .select(["order_id"])
        .where("tenant_id", "=", auth.tenantId)
        .where("idempotency_key", "=", input.idempotency_key)
        .executeTakeFirst();

      if (existingEvent) {
        if (existingEvent.order_id !== order.id) {
          return context.json({ error: "idempotency_conflict" }, 409);
        }
        return context.json(
          await loadOrder(db, auth.tenantId, order.id),
          200,
        );
      }
    }

    const priced = await priceOrderLines(
      db,
      auth.tenantId,
      order.venue_id,
      input.items,
    );
    if ("error" in priced) {
      return context.json({ error: priced.error }, 400);
    }
    const { lines } = priced;

    const totals = orderTotals([
      ...order.items.map((item) => ({
        totalMinor: item.line_total_minor,
        taxRate: item.tax_rate,
      })),
      ...lines.map((line) => ({
        totalMinor: line.lineTotalMinor,
        taxRate: line.item.tax_rate,
      })),
    ]);

    const now = new Date().toISOString();
    const { itemRows, modifierRows } = buildItemRows(
      auth.tenantId,
      order.id,
      lines,
      now,
    );

    try {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto("order_items").values(itemRows).execute();

        if (modifierRows.length) {
          await trx
            .insertInto("order_item_modifiers")
            .values(modifierRows)
            .execute();
        }

        await trx
          .updateTable("orders")
          .set({
            subtotal_minor: totals.subtotalMinor,
            tax_minor: totals.taxMinor,
            total_minor: totals.totalMinor,
            ...(input.notes !== undefined
              ? { notes: input.notes.trim() || null }
              : {}),
            updated_at: now,
          })
          .where("id", "=", order.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();

        await trx
          .insertInto("order_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            order_id: order.id,
            type: "items_added",
            data: JSON.stringify({ item_count: input.items.length }),
            idempotency_key: input.idempotency_key ?? null,
            actor_user_id: auth.userId,
            created_at: now,
          })
          .execute();
      });
    } catch (error) {
      if (input.idempotency_key) {
        const existingEvent = await db
          .selectFrom("order_events")
          .select(["order_id"])
          .where("tenant_id", "=", auth.tenantId)
          .where("idempotency_key", "=", input.idempotency_key)
          .executeTakeFirst();

        if (existingEvent?.order_id === order.id) {
          return context.json(
            await loadOrder(db, auth.tenantId, order.id),
            200,
          );
        }
      }
      throw error;
    }

    return context.json(await loadOrder(db, auth.tenantId, order.id), 201);
  });

  app.get("/api/orders", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const status = context.req.query("status");
    const query = db
      .selectFrom("orders")
      .leftJoin("dining_tables", "dining_tables.id", "orders.table_id")
      .selectAll("orders")
      .select("dining_tables.name as table_name")
      .where("orders.tenant_id", "=", auth.tenantId)
      .where("orders.venue_id", "=", venue.id);

    const orders = await (
      status ? query.where("orders.status", "=", status) : query
    )
      .orderBy("orders.created_at", "desc")
      .execute();

    return context.json(orders);
  });

  app.get("/api/orders/:id", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order) return context.json({ error: "order_not_found" }, 404);
    return context.json(order);
  });

  app.post("/api/orders/:id/send", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order) return context.json({ error: "order_not_found" }, 404);

    const isOpen = order.status === "open";
    const alreadySent = ["sent", "preparing", "ready", "served"].includes(
      order.status,
    );
    const pendingItems = order.items.filter((item) => item.status === "pending");

    if (!isOpen && !alreadySent) {
      return context.json({ error: "invalid_transition" }, 409);
    }
    if (alreadySent && pendingItems.length === 0) {
      return context.json(order);
    }

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("orders")
        .set({
          ...(isOpen ? { status: "sent" } : {}),
          updated_at: now,
        })
        .where("id", "=", order.id)
        .where("tenant_id", "=", auth.tenantId)
        .execute();

      await trx
        .updateTable("order_items")
        .set({ status: "sent" })
        .where("order_id", "=", order.id)
        .where("tenant_id", "=", auth.tenantId)
        .where("status", "=", "pending")
        .execute();

      await trx
        .insertInto("order_events")
        .values({
          id: newId(),
          tenant_id: auth.tenantId,
          order_id: order.id,
          type: "sent",
          data: JSON.stringify({
            from: order.status,
            item_count: pendingItems.length,
          }),
          idempotency_key: null,
          actor_user_id: auth.userId,
          created_at: now,
        })
        .execute();
    });

    return context.json(await loadOrder(db, auth.tenantId, order.id));
  });

  app.post("/api/orders/:id/status", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = orderStatusSchema.safeParse(
      body && typeof body === "object" && "status" in body
        ? (body as { status: unknown }).status
        : null,
    );
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const next = parsed.data;
    if (next === "voided" && !["owner", "manager"].includes(auth.role)) {
      return context.json({ error: "forbidden" }, 403);
    }

    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order) return context.json({ error: "order_not_found" }, 404);

    if (order.status === next) {
      return context.json(order);
    }

    try {
      assertTransition(order.status as OrderState, next);
    } catch {
      return context.json({ error: "invalid_transition" }, 409);
    }

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("orders")
        .set({
          status: next,
          updated_at: now,
          closed_at:
            next === "closed" || next === "voided" ? now : order.closed_at,
        })
        .where("id", "=", order.id)
        .where("tenant_id", "=", auth.tenantId)
        .execute();

      if (["sent", "preparing", "ready", "served"].includes(next)) {
        await trx
          .updateTable("order_items")
          .set({ status: next })
          .where("order_id", "=", order.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();
      }

      if (order.table_id && (next === "closed" || next === "voided")) {
        await trx
          .updateTable("dining_tables")
          .set({ status: "free" })
          .where("id", "=", order.table_id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();
      }

      await trx
        .insertInto("order_events")
        .values({
          id: newId(),
          tenant_id: auth.tenantId,
          order_id: order.id,
          type: next,
          data: JSON.stringify({ from: order.status }),
          idempotency_key: null,
          actor_user_id: auth.userId,
          created_at: now,
        })
        .execute();
    });

    return context.json(await loadOrder(db, auth.tenantId, order.id));
  });
}
