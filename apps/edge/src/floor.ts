import {
  createAreaSchema,
  createTableSchema,
  updateTableSchema,
} from "@hpos/contracts";
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
    "/api/floor/areas",
    requireAuth(db),
    requireRole("owner"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createAreaSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const venue = await resolveVenue(db, auth.tenantId, parsed.data.venue_id);
      if (!venue) return context.json({ error: "venue_not_found" }, 404);

      const area = {
        id: newId(),
        tenant_id: auth.tenantId,
        venue_id: venue.id,
        name: parsed.data.name,
        sort_order: parsed.data.sort_order,
        created_at: new Date().toISOString(),
      };
      await db.insertInto("areas").values(area).execute();
      return context.json(area, 201);
    },
  );

  app.patch(
    "/api/floor/tables/:id",
    requireAuth(db),
    requireRole("owner"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = updateTableSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const table = await db
        .selectFrom("dining_tables")
        .selectAll()
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!table) return context.json({ error: "table_not_found" }, 404);

      if (parsed.data.area_id) {
        const area = await db
          .selectFrom("areas")
          .select(["id", "venue_id"])
          .where("id", "=", parsed.data.area_id)
          .where("tenant_id", "=", auth.tenantId)
          .where("venue_id", "=", table.venue_id)
          .executeTakeFirst();
        if (!area) return context.json({ error: "area_not_found" }, 404);
      }

      if (parsed.data.name !== undefined) {
        const duplicate = await db
          .selectFrom("dining_tables")
          .select("id")
          .where("tenant_id", "=", auth.tenantId)
          .where("venue_id", "=", table.venue_id)
          .where("name", "=", parsed.data.name)
          .where("id", "!=", table.id)
          .executeTakeFirst();
        if (duplicate) {
          return context.json({ error: "table_name_taken" }, 409);
        }
      }

      await db
        .updateTable("dining_tables")
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.seats !== undefined ? { seats: parsed.data.seats } : {}),
          ...(parsed.data.area_id !== undefined
            ? { area_id: parsed.data.area_id }
            : {}),
        })
        .where("id", "=", table.id)
        .where("tenant_id", "=", auth.tenantId)
        .execute();

      return context.json({
        ...table,
        ...parsed.data,
      });
    },
  );

  app.delete(
    "/api/floor/tables/:id",
    requireAuth(db),
    requireRole("owner"),
    async (context) => {
      const auth = context.get("auth");
      const table = await db
        .selectFrom("dining_tables")
        .selectAll()
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!table) return context.json({ error: "table_not_found" }, 404);

      const openOrder = await db
        .selectFrom("orders")
        .select("id")
        .where("tenant_id", "=", auth.tenantId)
        .where("table_id", "=", table.id)
        .where("status", "not in", ["closed", "voided"])
        .executeTakeFirst();
      if (openOrder) return context.json({ error: "table_has_open_order" }, 409);

      await db
        .deleteFrom("dining_tables")
        .where("id", "=", table.id)
        .where("tenant_id", "=", auth.tenantId)
        .execute();
      return context.body(null, 204);
    },
  );

  app.post(
    "/api/floor/tables",
    requireAuth(db),
    requireRole("owner"),
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

      const duplicate = await db
        .selectFrom("dining_tables")
        .select("id")
        .where("tenant_id", "=", auth.tenantId)
        .where("venue_id", "=", area.venue_id)
        .where("name", "=", parsed.data.name)
        .executeTakeFirst();
      if (duplicate) {
        return context.json({ error: "table_name_taken" }, 409);
      }

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
