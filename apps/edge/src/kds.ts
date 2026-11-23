import { createStationSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";
import { subscribeEvents } from "./events.js";
import { loadOrder } from "./orders.js";

const ACTIVE_STATUSES = ["open", "sent", "preparing", "ready", "served"];

export function registerKdsRoutes(app: Hono<AppEnv>, db: Db) {
  app.get("/api/stations", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const stations = await db
      .selectFrom("stations")
      .select(["id", "name", "type"])
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .orderBy("name")
      .execute();
    return context.json(stations);
  });

  app.post(
    "/api/stations",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createStationSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const venue = await resolveVenue(
        db,
        auth.tenantId,
        parsed.data.venue_id,
      );
      if (!venue) return context.json({ error: "venue_not_found" }, 404);

      const station = {
        id: newId(),
        tenant_id: auth.tenantId,
        venue_id: venue.id,
        name: parsed.data.name,
        type: parsed.data.type,
        created_at: new Date().toISOString(),
      };
      await db.insertInto("stations").values(station).execute();
      return context.json(station, 201);
    },
  );

  app.patch(
    "/api/menu/items/:id/station",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        station_id?: string | null;
      } | null;
      if (!body || !("station_id" in body)) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const item = await db
        .selectFrom("menu_items")
        .select("id")
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!item) return context.json({ error: "item_not_found" }, 404);

      await db
        .updateTable("menu_items")
        .set({ station_id: body.station_id ?? null })
        .where("id", "=", item.id)
        .where("tenant_id", "=", auth.tenantId)
        .execute();
      return context.json({ id: item.id, station_id: body.station_id ?? null });
    },
  );

  app.get("/api/kds/tickets", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const stationId = context.req.query("station_id");
    const orders = await db
      .selectFrom("orders")
      .leftJoin("dining_tables", "dining_tables.id", "orders.table_id")
      .selectAll("orders")
      .select("dining_tables.name as table_name")
      .where("orders.tenant_id", "=", auth.tenantId)
      .where("orders.venue_id", "=", venue.id)
      .where("orders.status", "in", ACTIVE_STATUSES)
      .orderBy("orders.created_at")
      .execute();

    const tickets = await Promise.all(
      orders.map(async (order) => {
        const full = await loadOrder(db, auth.tenantId, order.id);
        if (!full) return null;
        const items = full.items.filter(
          (item) => !stationId || item.station_id === stationId,
        );
        if (!items.length) return null;
        return {
          id: full.id,
          number: full.number,
          status: full.status,
          table_name: order.table_name ?? null,
          created_at: full.created_at,
          notes: full.notes,
          items,
        };
      }),
    );

    return context.json(tickets.filter(Boolean));
  });

  app.get("/api/kds/events", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);
    const stationId = context.req.query("station_id");

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));
        const unsubscribe = subscribeEvents((event) => {
          if (event.venueId !== venue.id) return;
          if (
            stationId &&
            event.stationIds &&
            !event.stationIds.includes(stationId)
          ) {
            return;
          }
          controller.enqueue(
            encoder.encode(`event: update\ndata: ${JSON.stringify(event)}\n\n`),
          );
        });
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 20000);
        cleanup = () => {
          unsubscribe();
          clearInterval(heartbeat);
        };
      },
      cancel() {
        cleanup();
      },
    });

    context.header("Content-Type", "text/event-stream");
    context.header("Cache-Control", "no-cache");
    context.header("Connection", "keep-alive");
    return context.body(stream);
  });

  app.post("/api/print/kitchen", requireAuth(db), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      order_id?: string;
      station_id?: string;
      idempotency_key?: string;
    } | null;
    if (!body?.order_id || !body.station_id) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    if (body.idempotency_key) {
      const existing = await db
        .selectFrom("print_jobs")
        .selectAll()
        .where("tenant_id", "=", auth.tenantId)
        .where("idempotency_key", "=", body.idempotency_key)
        .executeTakeFirst();
      if (existing) return context.json(existing, 200);
    }

    const order = await loadOrder(db, auth.tenantId, body.order_id);
    if (!order) return context.json({ error: "order_not_found" }, 404);
    const station = await db
      .selectFrom("stations")
      .select("name")
      .where("id", "=", body.station_id)
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirst();
    if (!station) return context.json({ error: "station_not_found" }, 404);

    const items = order.items.filter((item) => item.station_id === body.station_id);
    const lines = [
      station.name.toUpperCase(),
      order.number,
      "-".repeat(32),
      ...items.map(
        (item) =>
          `${item.quantity}x ${item.name}${item.course ? ` (${item.course})` : ""}`,
      ),
      ...items.flatMap((item) =>
        item.modifiers.map((modifier) => `  ${modifier.name}`),
      ),
      ...(order.notes ? [order.notes] : []),
      "-".repeat(32),
    ];
    const text = `${lines.join("\n")}\n`;
    const bytes = Buffer.concat([
      Buffer.from(text, "utf8"),
      Buffer.from([0x1d, 0x56, 0x42, 0x00]),
    ]);

    const now = new Date().toISOString();
    const job = {
      id: newId(),
      tenant_id: auth.tenantId,
      venue_id: order.venue_id,
      order_id: order.id,
      type: "kitchen",
      payload: JSON.stringify({
        text,
        bytes: bytes.toString("base64"),
        kickDrawer: false,
      }),
      status: "queued",
      attempts: 0,
      error: null,
      idempotency_key: body.idempotency_key ?? null,
      created_at: now,
      updated_at: now,
    };
    await db.insertInto("print_jobs").values(job).execute();
    return context.json(job, 201);
  });
}
