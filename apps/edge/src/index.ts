import { serve } from "@hono/node-server";
import { createTenantSchema } from "@hpos/contracts";
import { createDb, migrate, seed } from "@hpos/db";
import { newId } from "@hpos/domain";
import { Hono } from "hono";
import { cors } from "hono/cors";

const port = Number(process.env.PORT || 4000);
const version = process.env.POS_VERSION || "0.0.0-dev";

const db = createDb({
  dialect: "sqlite",
  url: process.env.DATABASE_URL || "file:./data/pos.db",
});

await migrate(db);
await seed(db);

const app = new Hono();

app.use("/api/*", cors());

app.get("/api/health", (context) =>
  context.json({ status: "ok", mode: "edge", version }),
);

app.get("/api/version", (context) =>
  context.json({
    app: version,
    edge: version,
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

app.get("/api/venues", async (context) => {
  const venues = await db.selectFrom("venues").selectAll().execute();
  return context.json(venues);
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[edge] listening on http://localhost:${info.port}`);
});
