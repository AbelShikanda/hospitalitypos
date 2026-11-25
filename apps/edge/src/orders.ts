import {
  addOrderItemsSchema,
  applyDiscountSchema,
  createOrderSchema,
  mergeOrderSchema,
  moveOrderSchema,
  updateOrderNotesSchema,
  updateOrderStatusSchema,
  sendOrderSchema,
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
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";
import { publishEvent } from "./events.js";
import { depleteStockForOrder, reverseStockForOrder } from "./stock.js";
import { recordOutbox } from "./sync.js";

function waiterBlocked(
  auth: { role: string; userId: string },
  order: { opened_by: string | null },
): boolean {
  return auth.role === "waiter" && order.opened_by !== auth.userId;
}

export async function loadOrder(db: Db, tenantId: string, orderId: string) {
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
      course: item.course,
      station_id: item.station_id,
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

function emitOrderEvent(
  type: string,
  order: { id: string; venue_id: string; items: Array<{ station_id: string | null }> },
): void {
  publishEvent({
    type,
    venueId: order.venue_id,
    stationIds: order.items.map((item) => item.station_id),
    orderId: order.id,
    at: new Date().toISOString(),
  });
}

interface PricedLine {
  item: {
    id: string;
    name: string;
    price_minor: number;
    tax_rate: number;
    course: string;
    station_id: string | null;
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
    course: string;
    station_id: string | null;
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

  const itemIds: string[] = [];

  for (const line of lines) {
    const orderItemId = newId();
    itemIds.push(orderItemId);
    itemRows.push({
      id: orderItemId,
      tenant_id: tenantId,
      order_id: orderId,
      item_id: line.item.id,
      name_snapshot: line.item.name,
      unit_price_minor: line.unitPriceMinor,
      quantity: line.quantity,
      tax_rate: line.item.tax_rate,
      course: line.item.course,
      station_id: line.item.station_id,
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

  return { itemRows, modifierRows, itemIds };
}

export function registerOrderRoutes(app: Hono<AppEnv>, db: Db) {
  app.post(
    "/api/orders",
    requireAuth(db),
    requireRole("owner", "manager", "cashier", "waiter"),
    async (context) => {
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

    const orderId = input.id ?? newId();
    if (input.id) {
      const clash = await db
        .selectFrom("orders")
        .select("id")
        .where("id", "=", input.id)
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (clash) return context.json({ error: "order_id_conflict" }, 409);
    }

    const now = new Date().toISOString();
    const number = `#${String(Number(countRow?.count ?? 0) + 1).padStart(4, "0")}`;

    const { itemRows, modifierRows, itemIds } = buildItemRows(
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
            discount_minor: 0,
            discount_reason: null,
            idempotency_key: input.idempotency_key ?? null,
            opened_by: auth.userId,
            created_at: now,
            updated_at: now,
            closed_at: null,
          })
          .execute();

        await trx.insertInto("order_items").values(itemRows).execute();

        await depleteStockForOrder(
          trx,
          auth.tenantId,
          venue.id,
          lines.map((line, index) => ({
            itemId: line.item.id,
            quantity: line.quantity,
            referenceId: itemIds[index]!,
            orderId,
          })),
          auth.userId,
        );

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

        if (input.send) {
          const sendIds = lines.flatMap((line, index) =>
            !input.course || line.item.course === input.course
              ? [itemIds[index]!]
              : [],
          );

          if (sendIds.length) {
            await trx
              .updateTable("orders")
              .set({ status: "sent", updated_at: now })
              .where("id", "=", orderId)
              .where("tenant_id", "=", auth.tenantId)
              .execute();

            await trx
              .updateTable("order_items")
              .set({ status: "sent" })
              .where("id", "in", sendIds)
              .where("tenant_id", "=", auth.tenantId)
              .execute();

            await trx
              .insertInto("order_events")
              .values({
                id: newId(),
                tenant_id: auth.tenantId,
                order_id: orderId,
                type: "sent",
                data: JSON.stringify({
                  from: "open",
                  course: input.course ?? null,
                  item_count: sendIds.length,
                }),
                idempotency_key: null,
                actor_user_id: auth.userId,
                created_at: now,
              })
              .execute();
          }
        }

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

    const result = await loadOrder(db, auth.tenantId, orderId);
    if (result) {
      emitOrderEvent("order_created", result);
      await recordOutbox(db, {
        tenantId: auth.tenantId,
        venueId: venue.id,
        entity: "order",
        entityId: result.id,
        op: "created",
        payload: result,
        idempotencyKey: input.idempotency_key
          ? `order:${input.idempotency_key}`
          : undefined,
      });
    }
    return context.json(result, 201);
  });

  app.post(
    "/api/orders/:id/items",
    requireAuth(db),
    requireRole("owner", "manager", "cashier", "waiter"),
    async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = addOrderItemsSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order || waiterBlocked(auth, order)) {
      return context.json({ error: "order_not_found" }, 404);
    }
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
    const { itemRows, modifierRows, itemIds } = buildItemRows(
      auth.tenantId,
      order.id,
      lines,
      now,
    );

    try {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto("order_items").values(itemRows).execute();

        await depleteStockForOrder(
          trx,
          auth.tenantId,
          order.venue_id,
          lines.map((line, index) => ({
            itemId: line.item.id,
            quantity: line.quantity,
            referenceId: itemIds[index]!,
            orderId: order.id,
          })),
          auth.userId,
        );

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

        if (input.send) {
          const existingSendIds = order.items
            .filter(
              (item) =>
                item.status === "pending" &&
                (!input.course || item.course === input.course),
            )
            .map((item) => item.id);
          const newSendIds = lines.flatMap((line, index) =>
            !input.course || line.item.course === input.course
              ? [itemIds[index]!]
              : [],
          );
          const sendIds = [...existingSendIds, ...newSendIds];

          if (sendIds.length) {
            await trx
              .updateTable("orders")
              .set({
                ...(order.status === "open" ? { status: "sent" } : {}),
                updated_at: now,
              })
              .where("id", "=", order.id)
              .where("tenant_id", "=", auth.tenantId)
              .execute();

            await trx
              .updateTable("order_items")
              .set({ status: "sent" })
              .where("id", "in", sendIds)
              .where("tenant_id", "=", auth.tenantId)
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
                  course: input.course ?? null,
                  item_count: sendIds.length,
                }),
                idempotency_key: null,
                actor_user_id: auth.userId,
                created_at: now,
              })
              .execute();
          }
        }
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

    const result = await loadOrder(db, auth.tenantId, order.id);
    if (result) {
      emitOrderEvent("items_added", result);
      await recordOutbox(db, {
        tenantId: auth.tenantId,
        venueId: order.venue_id,
        entity: "order",
        entityId: order.id,
        op: "items_added",
        payload: result,
        idempotencyKey: input.idempotency_key
          ? `append:${input.idempotency_key}`
          : undefined,
      });
    }
    return context.json(result, 201);
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
    let query = db
      .selectFrom("orders")
      .leftJoin("dining_tables", "dining_tables.id", "orders.table_id")
      .selectAll("orders")
      .select("dining_tables.name as table_name")
      .where("orders.tenant_id", "=", auth.tenantId)
      .where("orders.venue_id", "=", venue.id);
    if (auth.role === "waiter") {
      query = query.where("orders.opened_by", "=", auth.userId);
    }

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
    if (!order || waiterBlocked(auth, order)) {
      return context.json({ error: "order_not_found" }, 404);
    }
    return context.json(order);
  });

  app.post(
    "/api/orders/:id/send",
    requireAuth(db),
    requireRole("owner", "manager", "cashier", "waiter", "kitchen"),
    async (context) => {
    const rawBody = await context.req.json().catch(() => null);
    const parsed = sendOrderSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }
    const course = parsed.data.course;

    const auth = context.get("auth");
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order || waiterBlocked(auth, order)) {
      return context.json({ error: "order_not_found" }, 404);
    }

    const isOpen = order.status === "open";
    const alreadySent = ["sent", "preparing", "ready", "served"].includes(
      order.status,
    );
    const pendingItems = order.items.filter(
      (item) =>
        item.status === "pending" && (!course || item.course === course),
    );

    if (!isOpen && !alreadySent) {
      return context.json({ error: "invalid_transition" }, 409);
    }
    if (pendingItems.length === 0) {
      return context.json(order);
    }

    const pendingIds = pendingItems.map((item) => item.id);
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
        .where("id", "in", pendingIds)
        .where("tenant_id", "=", auth.tenantId)
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
            course: course ?? null,
            item_count: pendingItems.length,
          }),
          idempotency_key: null,
          actor_user_id: auth.userId,
          created_at: now,
        })
        .execute();
    });

    const result = await loadOrder(db, auth.tenantId, order.id);
    if (result) {
      emitOrderEvent("order_sent", result);
      await recordOutbox(db, {
        tenantId: auth.tenantId,
        venueId: order.venue_id,
        entity: "order",
        entityId: order.id,
        op: "sent",
        payload: result,
      });
    }
    return context.json(result);
  });

  app.post(
    "/api/orders/:id/move",
    requireAuth(db),
    requireRole("owner", "manager", "cashier", "waiter"),
    async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = moveOrderSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order || waiterBlocked(auth, order)) {
      return context.json({ error: "order_not_found" }, 404);
    }
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
        return context.json(await loadOrder(db, auth.tenantId, order.id), 200);
      }
    }

    const targetTableId = input.table_id;
    if (targetTableId === order.table_id) {
      return context.json(order);
    }

    let targetTable = null;
    if (targetTableId) {
      targetTable = await db
        .selectFrom("dining_tables")
        .selectAll()
        .where("id", "=", targetTableId)
        .where("tenant_id", "=", auth.tenantId)
        .where("venue_id", "=", order.venue_id)
        .executeTakeFirst();

      if (!targetTable) return context.json({ error: "table_not_found" }, 404);
      if (targetTable.status !== "free") {
        return context.json({ error: "table_unavailable" }, 409);
      }
    }

    const now = new Date().toISOString();
    try {
      await db.transaction().execute(async (trx) => {
        if (order.table_id && order.table_id !== targetTableId) {
          await trx
            .updateTable("dining_tables")
            .set({ status: "free" })
            .where("id", "=", order.table_id)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
        }

        if (targetTable) {
          await trx
            .updateTable("dining_tables")
            .set({ status: "occupied" })
            .where("id", "=", targetTable.id)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
        }

        await trx
          .updateTable("orders")
          .set({ table_id: targetTableId, updated_at: now })
          .where("id", "=", order.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();

        await trx
          .insertInto("order_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            order_id: order.id,
            type: "moved",
            data: JSON.stringify({
              from: order.table_id,
              to: targetTableId,
            }),
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

    const result = await loadOrder(db, auth.tenantId, order.id);
    if (result) emitOrderEvent("table_moved", result);
    return context.json(result);
  });

  app.post(
    "/api/orders/:id/merge",
    requireAuth(db),
    requireRole("owner", "manager", "cashier", "waiter"),
    async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = mergeOrderSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;

    if (input.idempotency_key) {
      const existingEvent = await db
        .selectFrom("order_events")
        .select(["order_id"])
        .where("tenant_id", "=", auth.tenantId)
        .where("idempotency_key", "=", input.idempotency_key)
        .executeTakeFirst();

      if (existingEvent) {
        if (existingEvent.order_id !== input.target_order_id) {
          return context.json({ error: "idempotency_conflict" }, 409);
        }
        return context.json(
          await loadOrder(db, auth.tenantId, input.target_order_id),
          200,
        );
      }
    }

    const source = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!source || waiterBlocked(auth, source)) {
      return context.json({ error: "order_not_found" }, 404);
    }
    if (source.status === "closed" || source.status === "voided") {
      return context.json({ error: "order_closed" }, 409);
    }
    if (input.target_order_id === source.id) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const target = await loadOrder(db, auth.tenantId, input.target_order_id);
    if (!target || waiterBlocked(auth, target)) {
      return context.json({ error: "target_not_found" }, 404);
    }
    if (target.venue_id !== source.venue_id) {
      return context.json({ error: "venue_mismatch" }, 400);
    }
    if (target.status === "closed" || target.status === "voided") {
      return context.json({ error: "target_closed" }, 409);
    }

    const totals = orderTotals([
      ...target.items.map((item) => ({
        totalMinor: item.line_total_minor,
        taxRate: item.tax_rate,
      })),
      ...source.items.map((item) => ({
        totalMinor: item.line_total_minor,
        taxRate: item.tax_rate,
      })),
    ]);

    const now = new Date().toISOString();
    try {
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("order_items")
          .set({ order_id: target.id })
          .where("order_id", "=", source.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();

        await trx
          .updateTable("orders")
          .set({
            subtotal_minor: totals.subtotalMinor,
            tax_minor: totals.taxMinor,
            total_minor: totals.totalMinor,
            updated_at: now,
          })
          .where("id", "=", target.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();

        await trx
          .updateTable("orders")
          .set({
            status: "closed",
            table_id: null,
            updated_at: now,
            closed_at: now,
          })
          .where("id", "=", source.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();

        if (source.table_id) {
          await trx
            .updateTable("dining_tables")
            .set({ status: "free" })
            .where("id", "=", source.table_id)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
        }

        await trx
          .insertInto("order_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            order_id: source.id,
            type: "merged_out",
            data: JSON.stringify({
              target_order_id: target.id,
              item_count: source.items.length,
            }),
            idempotency_key: null,
            actor_user_id: auth.userId,
            created_at: now,
          })
          .execute();

        await trx
          .insertInto("order_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            order_id: target.id,
            type: "merged_in",
            data: JSON.stringify({
              source_order_id: source.id,
              item_count: source.items.length,
            }),
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

        if (existingEvent?.order_id === target.id) {
          return context.json(
            await loadOrder(db, auth.tenantId, target.id),
            200,
          );
        }
      }
      throw error;
    }

    const result = await loadOrder(db, auth.tenantId, target.id);
    if (result) emitOrderEvent("tables_merged", result);
    return context.json(result);
  });

  app.post(
    "/api/orders/:id/discount",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = applyDiscountSchema.safeParse(body);
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
      if (input.discount_minor > order.total_minor) {
        return context.json({ error: "discount_too_large" }, 409);
      }

      if (input.idempotency_key) {
        const existingEvent = await db
          .selectFrom("order_events")
          .select("order_id")
          .where("tenant_id", "=", auth.tenantId)
          .where("idempotency_key", "=", input.idempotency_key)
          .executeTakeFirst();
        if (existingEvent) {
          if (existingEvent.order_id !== order.id) {
            return context.json({ error: "idempotency_conflict" }, 409);
          }
          return context.json(order, 200);
        }
      }

      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("orders")
          .set({
            discount_minor: input.discount_minor,
            discount_reason: input.reason,
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
            type: "discounted",
            data: JSON.stringify({
              discount_minor: input.discount_minor,
              reason: input.reason,
            }),
            idempotency_key: input.idempotency_key ?? null,
            actor_user_id: auth.userId,
            created_at: now,
          })
          .execute();
      });

      const result = await loadOrder(db, auth.tenantId, order.id);
      if (result) emitOrderEvent("order_discounted", result);
      return context.json(result);
    },
  );

  app.patch(
    "/api/orders/:id/notes",
    requireAuth(db),
    requireRole("owner", "manager", "cashier", "waiter"),
    async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = updateOrderNotesSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order || waiterBlocked(auth, order)) {
      return context.json({ error: "order_not_found" }, 404);
    }
    if (order.status === "closed" || order.status === "voided") {
      return context.json({ error: "order_closed" }, 409);
    }

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("orders")
        .set({
          notes: parsed.data.notes?.trim() || null,
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
          type: "notes_updated",
          data: JSON.stringify({ notes: parsed.data.notes ?? null }),
          idempotency_key: null,
          actor_user_id: auth.userId,
          created_at: now,
        })
        .execute();
    });

    const result = await loadOrder(db, auth.tenantId, order.id);
    if (result) emitOrderEvent("order_notes_updated", result);
    return context.json(result);
  });

  app.post("/api/orders/:id/status", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = updateOrderStatusSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const { status: next, reason } = parsed.data;
    if (next === "voided" && !["owner", "manager"].includes(auth.role)) {
      return context.json({ error: "forbidden" }, 403);
    }
    if (
      next === "closed" &&
      !["owner", "manager", "cashier"].includes(auth.role)
    ) {
      return context.json({ error: "forbidden" }, 403);
    }

    const order = await loadOrder(db, auth.tenantId, context.req.param("id"));
    if (!order || waiterBlocked(auth, order)) {
      return context.json({ error: "order_not_found" }, 404);
    }

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

      if (next === "voided") {
        await reverseStockForOrder(trx, auth.tenantId, order.id, auth.userId);
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
          data: JSON.stringify({
            from: order.status,
            ...(reason ? { reason } : {}),
          }),
          idempotency_key: null,
          actor_user_id: auth.userId,
          created_at: now,
        })
        .execute();
    });

    const result = await loadOrder(db, auth.tenantId, order.id);
    if (result) {
      emitOrderEvent(`order_${next}`, result);
      await recordOutbox(db, {
        tenantId: auth.tenantId,
        venueId: order.venue_id,
        entity: "order",
        entityId: order.id,
        op: `status_${next}`,
        payload: result,
      });
    }
    return context.json(result);
  });
}
