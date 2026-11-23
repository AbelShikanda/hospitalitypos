import { serve } from "@hono/node-server";
import { createDb, migrate, seed } from "@hpos/db";
import { createEdgeApp } from "./app.js";
import { processStkTimeouts } from "./payments.js";
import { processPrintJobs } from "./print.js";
import { runEdgeSync } from "./sync.js";

const port = Number(process.env.PORT || 4000);
const version = process.env.POS_VERSION || "0.0.0-dev";

const db = createDb({
  dialect: "sqlite",
  url: process.env.DATABASE_URL || "file:./data/pos.db",
});

await migrate(db);
await seed(db);

const app = createEdgeApp({ db, version });

const syncUrl = process.env.CLOUD_SYNC_URL;
const syncToken = process.env.CLOUD_TOKEN;
const tenant =
  (process.env.POS_TENANT_ID
    ? await db
        .selectFrom("tenants")
        .select("id")
        .where("id", "=", process.env.POS_TENANT_ID)
        .executeTakeFirst()
    : await db
        .selectFrom("tenants")
        .select("id")
        .orderBy("created_at")
        .executeTakeFirst()) ?? null;
const venue = tenant
  ? await db
      .selectFrom("venues")
      .select("id")
      .where("tenant_id", "=", tenant.id)
      .orderBy("name")
      .executeTakeFirst()
  : null;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[edge] listening on http://localhost:${info.port}`);
});

if (syncUrl && syncToken && tenant && venue) {
  setInterval(() => {
    void runEdgeSync(db, {
      url: syncUrl,
      token: syncToken,
      tenantId: tenant.id,
      venueId: venue.id,
      version,
      schemaVersion: 14,
    }).catch(() => undefined);
  }, 30000).unref();
}

setInterval(() => {
  void processPrintJobs(db);
  void processStkTimeouts(db);
}, 10000).unref();
