import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  createSessionToken,
  hashSessionToken,
  normalizeRole,
  sessionExpiry,
  verifyPin,
} from "@hpos/auth";
import { createVenueSchema, pinLoginSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  clearSessionCookie,
  getSessionToken,
  requireAuth,
  requireRole,
  setSessionCookie,
  type AppEnv,
} from "./auth.js";
import { registerFloorRoutes } from "./floor.js";
import { registerMenuRoutes } from "./menu.js";
import { registerOrderRoutes } from "./orders.js";

export interface EdgeAppOptions {
  db: Db;
  version?: string;
  webDist?: string | null;
}

async function resolveTenant(db: Db) {
  const configured = process.env.POS_TENANT_ID;
  if (configured) {
    return db
      .selectFrom("tenants")
      .selectAll()
      .where("id", "=", configured)
      .executeTakeFirst();
  }
  return db
    .selectFrom("tenants")
    .selectAll()
    .orderBy("created_at")
    .executeTakeFirst();
}

export function createEdgeApp({
  db,
  version = "0.0.0-dev",
  webDist,
}: EdgeAppOptions) {
  const app = new Hono<AppEnv>();
  const build = new Date().toISOString();

  app.use("/api/*", cors());

  app.get("/api/health", (context) =>
    context.json({ status: "ok", mode: "edge", version }),
  );

  app.get("/api/version", (context) =>
    context.json({ app: version, edge: version, schema: 6, build }),
  );

  app.get("/api/bootstrap", async (context) => {
    const tenant = await resolveTenant(db);
    if (!tenant) return context.json({ error: "no_tenant" }, 404);

    const venues = await db
      .selectFrom("venues")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .orderBy("name")
      .execute();

    const staffRows = await db
      .selectFrom("users")
      .innerJoin("memberships", (join) =>
        join
          .onRef("memberships.user_id", "=", "users.id")
          .onRef("memberships.tenant_id", "=", "users.tenant_id"),
      )
      .select(["users.id", "users.name", "memberships.role"])
      .where("users.tenant_id", "=", tenant.id)
      .orderBy("users.name")
      .execute();

    const staff = staffRows.flatMap((row) => {
      const role = normalizeRole(row.role);
      return role ? [{ id: row.id, name: row.name, role }] : [];
    });

    return context.json({ tenant, venues, staff });
  });

  app.post("/api/auth/pin", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = pinLoginSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const { tenant_id, user_id, pin, device_id } = parsed.data;

    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", user_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (!user || !verifyPin(pin, user.pin_hash)) {
      return context.json({ error: "invalid_credentials" }, 401);
    }

    const membership = await db
      .selectFrom("memberships")
      .select("role")
      .where("user_id", "=", user.id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    const role = membership ? normalizeRole(membership.role) : null;
    if (!role) return context.json({ error: "forbidden" }, 403);

    const token = createSessionToken();
    const now = new Date().toISOString();
    const expiresAt = sessionExpiry();
    const sessionId = newId();

    await db
      .insertInto("sessions")
      .values({
        id: sessionId,
        tenant_id,
        user_id: user.id,
        token_hash: hashSessionToken(token),
        device_id: device_id ?? null,
        created_at: now,
        expires_at: expiresAt,
        revoked_at: null,
      })
      .execute();

    setSessionCookie(context, token, expiresAt);

    return context.json({
      session_id: sessionId,
      tenant_id,
      user_id: user.id,
      name: user.name,
      role,
      expires_at: expiresAt,
    });
  });

  app.get("/api/auth/session", requireAuth(db), (context) => {
    const auth = context.get("auth");
    return context.json({
      session_id: auth.sessionId,
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      name: auth.name,
      role: auth.role,
      expires_at: auth.expiresAt,
    });
  });

  app.post("/api/auth/logout", async (context) => {
    const token = getSessionToken(context);
    if (token) {
      await db
        .updateTable("sessions")
        .set({ revoked_at: new Date().toISOString() })
        .where("token_hash", "=", hashSessionToken(token))
        .execute();
    }
    clearSessionCookie(context);
    return context.body(null, 204);
  });

  app.get("/api/tenants", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const tenant = await db
      .selectFrom("tenants")
      .selectAll()
      .where("id", "=", auth.tenantId)
      .executeTakeFirst();
    return context.json(tenant ? [tenant] : []);
  });

  app.get("/api/venues", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venues = await db
      .selectFrom("venues")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .orderBy("name")
      .execute();
    return context.json(venues);
  });

  app.post(
    "/api/venues",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createVenueSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const venue = {
        id: newId(),
        tenant_id: auth.tenantId,
        name: parsed.data.name,
        created_at: new Date().toISOString(),
      };

      await db.insertInto("venues").values(venue).execute();
      return context.json(venue, 201);
    },
  );

  registerMenuRoutes(app, db);
  registerFloorRoutes(app, db);
  registerOrderRoutes(app, db);

  if (webDist !== null) {
    const dist =
      webDist ?? fileURLToPath(new URL("../../web/dist", import.meta.url));

    app.use("/*", serveStatic({ root: dist }));

    app.get("*", async (context) => {
      if (context.req.path.startsWith("/api/")) {
        return context.json({ error: "not_found" }, 404);
      }
      try {
        const html = await readFile(join(dist, "index.html"), "utf8");
        return context.html(html);
      } catch {
        return context.text(
          "Web build not found. Run: pnpm --filter @hpos/web build",
          503,
        );
      }
    });
  }

  return app;
}
