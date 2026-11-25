import { updateVenueSettingsSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

export interface VenueSettings {
  stock_enabled: boolean;
  tip_enabled: boolean;
  tip_threshold_minor: number;
  tip_percent: number;
}

export async function getVenueSettings(
  db: Db,
  tenantId: string,
  venueId: string,
): Promise<VenueSettings> {
  const row = await db
    .selectFrom("venue_settings")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("venue_id", "=", venueId)
    .executeTakeFirst();

  return {
    stock_enabled: row ? row.stock_enabled === 1 : true,
    tip_enabled: row ? row.tip_enabled === 1 : false,
    tip_threshold_minor: row?.tip_threshold_minor ?? 0,
    tip_percent: row?.tip_percent ?? 0,
  };
}

export async function isStockEnabled(
  db: Db,
  tenantId: string,
  venueId: string,
): Promise<boolean> {
  return (await getVenueSettings(db, tenantId, venueId)).stock_enabled;
}

export function registerSettingsRoutes(app: Hono<AppEnv>, db: Db) {
  app.get("/api/settings", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    return context.json({
      venue_id: venue.id,
      ...(await getVenueSettings(db, auth.tenantId, venue.id)),
    });
  });

  app.patch(
    "/api/settings",
    requireAuth(db),
    requireRole("owner"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = updateVenueSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const venue = await resolveVenue(db, auth.tenantId, parsed.data.venue_id);
      if (!venue) return context.json({ error: "venue_not_found" }, 404);

      const current = await getVenueSettings(db, auth.tenantId, venue.id);
      const next = {
        stock_enabled: parsed.data.stock_enabled ?? current.stock_enabled,
        tip_enabled: parsed.data.tip_enabled ?? current.tip_enabled,
        tip_threshold_minor:
          parsed.data.tip_threshold_minor ?? current.tip_threshold_minor,
        tip_percent:
          parsed.data.tip_percent === undefined
            ? current.tip_percent
            : Math.round(parsed.data.tip_percent),
      };
      const now = new Date().toISOString();
      await db
        .insertInto("venue_settings")
        .values({
          id: newId(),
          tenant_id: auth.tenantId,
          venue_id: venue.id,
          stock_enabled: next.stock_enabled ? 1 : 0,
          tip_enabled: next.tip_enabled ? 1 : 0,
          tip_threshold_minor: next.tip_threshold_minor,
          tip_percent: next.tip_percent,
          created_at: now,
          updated_at: now,
        })
        .onConflict((conflict) =>
          conflict.columns(["tenant_id", "venue_id"]).doUpdateSet({
            stock_enabled: next.stock_enabled ? 1 : 0,
            tip_enabled: next.tip_enabled ? 1 : 0,
            tip_threshold_minor: next.tip_threshold_minor,
            tip_percent: next.tip_percent,
            updated_at: now,
          }),
        )
        .execute();

      return context.json({ venue_id: venue.id, ...next });
    },
  );
}
