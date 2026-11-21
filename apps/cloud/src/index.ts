import { serve } from "@hono/node-server";
import { createTenantSchema } from "@hpos/contracts";
import { createDb, migrate, seed } from "@hpos/db";
import type { Dialect } from "@hpos/db";
import { newId } from "@hpos/domain";
import { Hono } from "hono";
import { cors } from "hono/cors";

const port = Number(process.env.PORT || 4001);
const version = process.env.POS_VERSION || "0.0.0-dev";
const dialect = (process.env.DB_DIALECT || "sqlite") as Dialect;
const url = process.env.DATABASE_URL || "file:./data/cloud.db";

const db = createDb({ dialect, url });

await migrate(db);
await seed(db);

const app = new Hono();

app.use("/api/*", cors());

app.get("/api/health", (context) =>
  context.json({ status: "ok", mode: "cloud", dialect, version }),
);

app.get("/api/version", (context) =>
  context.json({
    app: version,
    edge: "cloud",
    schema: 1,
    build: new Date().toISOString(),
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
  return context.json(tenant, 201);
});

app.post("/internal/cron/run", (context) => {
  if (context.req.header("x-cron-secret") !== process.env.CRON_SECRET) {
    return context.json({ error: "unauthorized" }, 401);
  }
  return context.json({ ok: true, ran: new Date().toISOString() });
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[cloud] listening on http://localhost:${info.port}`);
});
