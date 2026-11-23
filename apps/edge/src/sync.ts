import { publishCatalogSchema, syncPushSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

export interface OutboxInput {
  tenantId: string;
  venueId: string;
  entity: string;
  entityId: string;
  op: string;
  payload: unknown;
  idempotencyKey?: string;
}

export async function recordOutbox(db: Db, input: OutboxInput): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto("outbox_events")
    .values({
      id: newId(),
      tenant_id: input.tenantId,
      venue_id: input.venueId,
      entity: input.entity,
      entity_id: input.entityId,
      op: input.op,
      payload: JSON.stringify(input.payload ?? {}),
      idempotency_key: input.idempotencyKey ?? `sync-${newId()}`,
      created_at: now,
      synced_at: null,
      attempts: 0,
    })
    .onConflict((conflict) =>
      conflict.columns(["tenant_id", "idempotency_key"]).doNothing(),
    )
    .execute();
}

async function applyCatalog(db: Db, tenantId: string, raw: string): Promise<void> {
  const parsed = publishCatalogSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return;
  const { categories, items } = parsed.data;

  for (const category of categories) {
    const existing = await db
      .selectFrom("menu_categories")
      .select("id")
      .where("id", "=", category.id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    if (existing) {
      await db
        .updateTable("menu_categories")
        .set({ name: category.name, sort_order: category.sort_order })
        .where("id", "=", category.id)
        .where("tenant_id", "=", tenantId)
        .execute();
    } else {
      await db
        .insertInto("menu_categories")
        .values({
          id: category.id,
          tenant_id: tenantId,
          name: category.name,
          sort_order: category.sort_order,
          created_at: new Date().toISOString(),
        })
        .execute();
    }
  }

  for (const item of items) {
    const values = {
      tenant_id: tenantId,
      category_id: item.category_id,
      name: item.name,
      description: item.description ?? null,
      price_minor: item.price_minor,
      tax_rate: item.tax_rate,
      course: item.course,
      is_available: item.is_available ? 1 : 0,
      station_id: null,
    };
    const existing = await db
      .selectFrom("menu_items")
      .select("id")
      .where("id", "=", item.id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    if (existing) {
      await db
        .updateTable("menu_items")
        .set(values)
        .where("id", "=", item.id)
        .where("tenant_id", "=", tenantId)
        .execute();
    } else {
      await db
        .insertInto("menu_items")
        .values({
          id: item.id,
          ...values,
          sort_order: 0,
          created_at: new Date().toISOString(),
        })
        .execute();
    }
  }

}

async function applyInbox(db: Db, tenantId: string): Promise<void> {
  const messages = await db
    .selectFrom("inbox_messages")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("applied_at", "is", null)
    .execute();

  for (const message of messages) {
    if (message.entity === "catalog") {
      await applyCatalog(db, tenantId, message.payload);
    }
    await db
      .updateTable("inbox_messages")
      .set({ applied_at: new Date().toISOString() })
      .where("id", "=", message.id)
      .execute();
  }
}

export function registerEdgeSyncRoutes(app: Hono<AppEnv>, db: Db) {
  app.post(
    "/api/sync/heartbeat",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        venue_id?: string;
        version?: string;
        schema_version?: number;
        status?: string;
      } | null;
      if (!body?.venue_id || !body.version || !body.schema_version) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const venue = await resolveVenue(db, auth.tenantId, body.venue_id);
      if (!venue) return context.json({ error: "venue_not_found" }, 404);

      const now = new Date().toISOString();
      const existing = await db
        .selectFrom("heartbeats")
        .select("id")
        .where("tenant_id", "=", auth.tenantId)
        .where("venue_id", "=", venue.id)
        .executeTakeFirst();
      const values = {
        version: body.version,
        schema_version: body.schema_version,
        status: body.status ?? "online",
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
            tenant_id: auth.tenantId,
            venue_id: venue.id,
            ...values,
          })
          .execute();
      }
      return context.json({ ok: true });
    },
  );

  app.get(
    "/api/sync/pull",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const auth = context.get("auth");
      const since = context.req.query("since");
      let query = db
        .selectFrom("inbox_messages")
        .selectAll()
        .where("tenant_id", "=", auth.tenantId);
      if (since) query = query.where("created_at", ">", since);
      const messages = await query.orderBy("created_at").execute();
      await applyInbox(db, auth.tenantId);
      return context.json(messages);
    },
  );

  app.post(
    "/api/sync/push",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = syncPushSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      for (const event of parsed.data.events) {
        await db
          .insertInto("inbox_messages")
          .values({
            id: event.id,
            tenant_id: event.tenant_id,
            venue_id: event.venue_id,
            entity: event.entity,
            entity_id: event.entity_id,
            op: event.op,
            payload: event.payload,
            idempotency_key: event.idempotency_key,
            created_at: event.created_at,
            applied_at: null,
          })
          .onConflict((conflict) =>
            conflict.columns(["tenant_id", "idempotency_key"]).doNothing(),
          )
          .execute();
      }
      await applyInbox(db, auth.tenantId);
      return context.json({ received: parsed.data.events.length });
    },
  );
}

interface SyncConfig {
  url: string;
  token: string;
  tenantId: string;
  venueId: string;
  version: string;
  schemaVersion: number;
}

export async function runEdgeSync(db: Db, config: SyncConfig): Promise<void> {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.token}`,
  };
  const base = config.url.replace(/\/$/, "");

  const pending = await db
    .selectFrom("outbox_events")
    .selectAll()
    .where("tenant_id", "=", config.tenantId)
    .where("synced_at", "is", null)
    .orderBy("created_at")
    .limit(100)
    .execute();

  if (pending.length) {
    const response = await fetch(`${base}/api/sync/push`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events: pending }),
    });
    if (response.ok) {
      const now = new Date().toISOString();
      for (const event of pending) {
        await db
          .updateTable("outbox_events")
          .set({ synced_at: now })
          .where("id", "=", event.id)
          .execute();
      }
    }
  }

  const cursor = await db
    .selectFrom("sync_cursors")
    .selectAll()
    .where("tenant_id", "=", config.tenantId)
    .where("venue_id", "=", config.venueId)
    .executeTakeFirst();

  const pullResponse = await fetch(
    `${base}/api/sync/pull?venue_id=${encodeURIComponent(config.venueId)}&since=${encodeURIComponent(cursor?.last_inbox_at ?? "")}`,
    { headers },
  );
  if (pullResponse.ok) {
    const messages = (await pullResponse.json()) as Array<{
      id: string;
      tenant_id: string;
      venue_id: string | null;
      entity: string;
      entity_id: string;
      op: string;
      payload: string;
      idempotency_key: string;
      created_at: string;
    }>;
    for (const message of messages) {
      const existing = await db
        .selectFrom("inbox_messages")
        .select("id")
        .where("id", "=", message.id)
        .executeTakeFirst();
      if (existing) continue;
      await db
        .insertInto("inbox_messages")
        .values({ ...message, applied_at: null })
        .execute();
    }
    await applyInbox(db, config.tenantId);

    const now = new Date().toISOString();
    if (cursor) {
      await db
        .updateTable("sync_cursors")
        .set({ last_inbox_at: now, updated_at: now })
        .where("id", "=", cursor.id)
        .execute();
    } else {
      await db
        .insertInto("sync_cursors")
        .values({
          id: newId(),
          tenant_id: config.tenantId,
          venue_id: config.venueId,
          last_outbox_at: now,
          last_inbox_at: now,
          updated_at: now,
        })
        .execute();
    }
  }

  await fetch(`${base}/api/sync/heartbeat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      venue_id: config.venueId,
      version: config.version,
      schema_version: config.schemaVersion,
      status: "online",
    }),
  }).catch(() => undefined);
}
