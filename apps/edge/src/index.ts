import { serve } from "@hono/node-server";
import { createDb, migrate, seed } from "@hpos/db";
import { createEdgeApp } from "./app.js";

const port = Number(process.env.PORT || 4000);
const version = process.env.POS_VERSION || "0.0.0-dev";

const db = createDb({
  dialect: "sqlite",
  url: process.env.DATABASE_URL || "file:./data/pos.db",
});

await migrate(db);
await seed(db);

const app = createEdgeApp({ db, version });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[edge] listening on http://localhost:${info.port}`);
});
