import { createFeedbackSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

export function registerFeedbackRoutes(app: Hono<AppEnv>, db: Db) {
  app.get(
    "/api/feedback",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const auth = context.get("auth");
      const rows = await db
        .selectFrom("feedback")
        .leftJoin("users", "users.id", "feedback.user_id")
        .selectAll("feedback")
        .select("users.name as user_name")
        .where("feedback.tenant_id", "=", auth.tenantId)
        .orderBy("feedback.created_at", "desc")
        .execute();

      return context.json(
        rows.map((row) => ({
          id: row.id,
          venue_id: row.venue_id,
          user_id: row.user_id,
          user_name: row.user_name ?? "Staff",
          category: row.category,
          subject: row.subject,
          message: row.message,
          status: row.status,
          created_at: row.created_at,
        })),
      );
    },
  );

  app.post(
    "/api/feedback",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createFeedbackSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      let venueId: string | null = null;
      if (parsed.data.venue_id) {
        const venue = await resolveVenue(db, auth.tenantId, parsed.data.venue_id);
        if (!venue) return context.json({ error: "venue_not_found" }, 404);
        venueId = venue.id;
      }

      const now = new Date().toISOString();
      const row = {
        id: newId(),
        tenant_id: auth.tenantId,
        venue_id: venueId,
        user_id: auth.userId,
        category: parsed.data.category,
        subject: parsed.data.subject,
        message: parsed.data.message,
        status: "open",
        created_at: now,
        updated_at: now,
      };
      await db.insertInto("feedback").values(row).execute();

      return context.json(
        {
          ...row,
          user_name: auth.name,
        },
        201,
      );
    },
  );
}
