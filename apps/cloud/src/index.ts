import { serve } from "@hono/node-server";
import { createDb, migrate, seed } from "@hpos/db";
import type { Dialect } from "@hpos/db";
import { createCloudApp } from "./app.js";

const port = Number(process.env.PORT || 4001);
const version = process.env.POS_VERSION || "0.0.0-dev";
const dialect = (process.env.DB_DIALECT || "sqlite") as Dialect;
const url = process.env.DATABASE_URL || "file:./data/cloud.db";

const db = createDb({ dialect, url });

await migrate(db);
await seed(db);

const app = createCloudApp({ db, version, dialect });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[cloud] listening on http://localhost:${info.port}`);
});
