import { createTableSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

export function registerFloorRoutes(app: Hono<AppEnv>, db: Db) {
  app.get("/api/floor", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const [areas, tables] = await Promise.all([
      db
        .selectFrom("areas")
        .selectAll()
        .where("tenant_id", "=", auth.tenantId)
        .where("venue_id", "=", venue.id)
        .orderBy("sort_order")
        .orderBy("name")
        .execute(),
      db
        .selectFrom("dining_tables")
        .selectAll()
        .where("tenant_id", "=", auth.tenantId)
        .where("venue_id", "=", venue.id)
        .orderBy("name")
        .execute(),
    ]);

    const tablesByArea = new Map<string, typeof tables>();
    for (const table of tables) {
      const list = tablesByArea.get(table.area_id) ?? [];
      list.push(table);
      tablesByArea.set(table.area_id, list);
    }

    return context.json({
      venue_id: venue.id,
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        tables: (tablesByArea.get(area.id) ?? []).map((table) => ({
          id: table.id,
          area_id: table.area_id,
          name: table.name,
          seats: table.seats,
          status: table.status,
        })),
      })),
    });
  });

  app.post(
    "/api/floor/tables",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createTableSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const area = await db
        .selectFrom("areas")
        .selectAll()
        .where("id", "=", parsed.data.area_id)
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();

      if (!area) return context.json({ error: "area_not_found" }, 404);

      const table = {
        id: newId(),
        tenant_id: auth.tenantId,
        venue_id: area.venue_id,
        area_id: area.id,
        name: parsed.data.name,
        seats: parsed.data.seats,
        status: "free",
        created_at: new Date().toISOString(),
      };

      await db.insertInto("dining_tables").values(table).execute();
      return context.json(table, 201);
    },
  );
}
