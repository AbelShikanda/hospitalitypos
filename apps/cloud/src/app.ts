import { createHash, randomBytes } from "node:crypto";
import {
  createApiTokenSchema,
  createTenantSchema,
  createVenueSchema,
  heartbeatSchema,
  publishCatalogSchema,
  syncPushSchema,
} from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import { Hono } from "hono";
import { cors } from "hono/cors";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isAdmin(context: { req: { header: (name: string) => string | undefined } }): boolean {
  const secret = process.env.CLOUD_ADMIN_SECRET ?? process.env.CRON_SECRET;
  return Boolean(secret && context.req.header("x-admin-secret") === secret);
}

async function tenantForToken(db: Db, authorization: string | undefined) {
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  if (!token) return null;
  const row = await db
    .selectFrom("api_tokens")
    .select("tenant_id")
    .where("token_hash", "=", hashToken(token))
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  return row?.tenant_id ?? null;
}

export async function runCloudJobs(db: Db): Promise<number> {
  const now = new Date().toISOString();
  const jobs = await db
    .selectFrom("cloud_jobs")
    .selectAll()
    .where("status", "=", "queued")
    .where("run_at", "<=", now)
    .limit(50)
    .execute();

  for (const job of jobs) {
    if (job.type === "apply_inbox") {
      const payload = JSON.parse(job.payload) as { message_id?: string };
      if (payload.message_id) {
        await db
          .updateTable("inbox_messages")
          .set({ applied_at: now })
          .where("id", "=", payload.message_id)
          .where("tenant_id", "=", job.tenant_id)
          .execute();
      }
    }
    await db
      .updateTable("cloud_jobs")
      .set({ status: "done", updated_at: now })
      .where("id", "=", job.id)
      .execute();
  }
  return jobs.length;
}

export function createCloudApp({
  db,
  version,
  dialect,
}: {
  db: Db;
  version: string;
  dialect: string;
}) {
  const app = new Hono();
  const build = new Date().toISOString();

  app.use("/api/*", cors());

  app.get("/api/health", (context) =>
    context.json({ status: "ok", mode: "cloud", dialect, version }),
  );

  app.get("/api/version", (context) =>
    context.json({
      app: version,
      edge: "cloud",
      schema: 2,
      build,
    }),
  );

  app.get("/api/tenants", async (context) => {
    const tenants = await db.selectFrom("tenants").selectAll().execute();
    return context.json(tenants);
  });

  app.post("/api/tenants", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = createTenantSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }
    const tenant = {
      id: newId(),
      name: parsed.data.name,
      created_at: new Date().toISOString(),
    };
    await db.insertInto("tenants").values(tenant).execute();
    const now = new Date().toISOString();
    await db
      .insertInto("subscriptions")
      .values({
        id: newId(),
        tenant_id: tenant.id,
        plan: "starter",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now,
        updated_at: now,
      })
      .execute();
    return context.json(tenant, 201);
  });

  app.post("/api/cloud/venues", async (context) => {
    if (!isAdmin(context)) return context.json({ error: "unauthorized" }, 401);
    const body = await context.req.json().catch(() => null);
    const parsed = createVenueSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }
    const tenantId = (body as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return context.json({ error: "invalid_input" }, 400);
    const venue = {
      id: newId(),
      tenant_id: tenantId,
      name: parsed.data.name,
      created_at: new Date().toISOString(),
    };
    await db.insertInto("venues").values(venue).execute();
    return context.json(venue, 201);
  });

  app.post("/api/cloud/tokens", async (context) => {
    if (!isAdmin(context)) return context.json({ error: "unauthorized" }, 401);
    const body = await context.req.json().catch(() => null);
    const parsed = createApiTokenSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }
    const tenantId = (body as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return context.json({ error: "invalid_input" }, 400);
    const token = randomBytes(32).toString("hex");
    const row = {
      id: newId(),
      tenant_id: tenantId,
      name: parsed.data.name,
      token_hash: hashToken(token),
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    await db.insertInto("api_tokens").values(row).execute();
    return context.json({ ...row, token }, 201);
  });

  app.post("/api/sync/push", async (context) => {
    const tenantId = await tenantForToken(db, context.req.header("authorization"));
    if (!tenantId) return context.json({ error: "unauthorized" }, 401);
    const body = await context.req.json().catch(() => null);
    const parsed = syncPushSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    let received = 0;
    for (const event of parsed.data.events) {
      if (event.tenant_id !== tenantId) continue;
      const existing = await db
        .selectFrom("inbox_messages")
        .select("id")
        .where("tenant_id", "=", tenantId)
        .where("idempotency_key", "=", event.idempotency_key)
        .executeTakeFirst();
      if (existing) continue;

      const messageId = newId();
      const now = new Date().toISOString();
      await db
        .insertInto("inbox_messages")
        .values({
          id: messageId,
          tenant_id: tenantId,
          venue_id: event.venue_id,
          entity: event.entity,
          entity_id: event.entity_id,
          op: event.op,
          payload: event.payload,
          idempotency_key: event.idempotency_key,
          created_at: event.created_at,
          applied_at: null,
        })
        .execute();
      await db
        .insertInto("cloud_jobs")
        .values({
          id: newId(),
          tenant_id: tenantId,
          type: "apply_inbox",
          payload: JSON.stringify({ message_id: messageId }),
          status: "queued",
          attempts: 0,
          run_at: now,
          error: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      received += 1;
    }
    return context.json({ received });
  });

  app.get("/api/sync/pull", async (context) => {
    const tenantId = await tenantForToken(db, context.req.header("authorization"));
    if (!tenantId) return context.json({ error: "unauthorized" }, 401);
    const since = context.req.query("since");
    let query = db
      .selectFrom("inbox_messages")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity", "=", "catalog");
    if (since) query = query.where("created_at", ">", since);
    const messages = await query.orderBy("created_at").execute();
    return context.json(messages);
  });

  app.post("/api/sync/heartbeat", async (context) => {
    const tenantId = await tenantForToken(db, context.req.header("authorization"));
    if (!tenantId) return context.json({ error: "unauthorized" }, 401);
    const body = await context.req.json().catch(() => null);
    const parsed = heartbeatSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }
    const now = new Date().toISOString();
    const existing = await db
      .selectFrom("heartbeats")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("venue_id", "=", parsed.data.venue_id)
      .executeTakeFirst();
    const values = {
      version: parsed.data.version,
      schema_version: parsed.data.schema_version,
      status: parsed.data.status,
      last_seen_at: now,
    };
    if (existing) {
      await db
        .updateTable("heartbeats")
        .set(values)
        .where("id", "=", existing.id)
        .execute();
    } else {
      await db
        .insertInto("heartbeats")
        .values({
          id: newId(),
          tenant_id: tenantId,
          venue_id: parsed.data.venue_id,
          ...values,
        })
        .execute();
    }
    return context.json({ ok: true });
  });

  app.get("/api/cloud/heartbeats", async (context) => {
    if (!isAdmin(context)) return context.json({ error: "unauthorized" }, 401);
    const rows = await db
      .selectFrom("heartbeats")
      .selectAll()
      .orderBy("last_seen_at", "desc")
      .execute();
    return context.json(rows);
  });

  app.post("/api/cloud/catalog/publish", async (context) => {
    if (!isAdmin(context)) return context.json({ error: "unauthorized" }, 401);
    const body = await context.req.json().catch(() => null);
    const parsed = publishCatalogSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }
    const tenantId = (body as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return context.json({ error: "invalid_input" }, 400);
    const now = new Date().toISOString();
    const key = `catalog:${tenantId}:${parsed.data.venue_id}:${newId()}`;
    const message = {
      id: newId(),
      tenant_id: tenantId,
      venue_id: parsed.data.venue_id,
      entity: "catalog",
      entity_id: parsed.data.venue_id,
      op: "publish",
      payload: JSON.stringify(parsed.data),
      idempotency_key: key,
      created_at: now,
      applied_at: null,
    };
    await db.insertInto("inbox_messages").values(message).execute();
    return context.json(message, 201);
  });

  app.get("/api/cloud/reports", async (context) => {
    const tenantId = await tenantForToken(db, context.req.header("authorization"));
    if (!tenantId) return context.json({ error: "unauthorized" }, 401);

    const messages = await db
      .selectFrom("inbox_messages")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .execute();

    const latest = new Map<string, (typeof messages)[number]>();
    for (const message of messages) {
      const key = `${message.entity}:${message.entity_id}`;
      const current = latest.get(key);
      if (!current || message.created_at > current.created_at) {
        latest.set(key, message);
      }
    }

    let gross = 0;
    let tax = 0;
    let discounts = 0;
    let captured = 0;
    let tips = 0;
    let orders = 0;
    const mix = new Map<string, number>();

    for (const message of latest.values()) {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(message.payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (message.entity === "order") {
        orders += 1;
        gross += Number(payload.total_minor ?? 0);
        tax += Number(payload.tax_minor ?? 0);
        discounts += Number(payload.discount_minor ?? 0);
      }
      if (message.entity === "payment" && payload.status === "confirmed") {
        captured += Number(payload.amount_minor ?? 0);
        tips += Number(payload.tip_minor ?? 0);
        const method = String(payload.method ?? "unknown");
        mix.set(method, (mix.get(method) ?? 0) + Number(payload.amount_minor ?? 0));
      }
    }

    return context.json({
      summary: {
        orders,
        gross_minor: gross,
        net_minor: Math.max(0, gross - tax - discounts),
        tax_minor: tax,
        discounts_minor: discounts,
        captured_minor: captured,
        tips_minor: tips,
      },
      payment_mix: [...mix.entries()].map(([method, minor]) => ({ method, minor })),
    });
  });

  app.post("/internal/cron/run", async (context) => {
    if (context.req.header("x-cron-secret") !== process.env.CRON_SECRET) {
      return context.json({ error: "unauthorized" }, 401);
    }
    const ran = await runCloudJobs(db);
    return context.json({ ok: true, ran, at: new Date().toISOString() });
  });

  return app;
}
