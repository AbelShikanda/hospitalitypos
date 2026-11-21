import { createDb } from "./dialect.js";
import type { Dialect } from "./dialect.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

const dialect = (process.env.DB_DIALECT || "sqlite") as Dialect;
const url = process.env.DATABASE_URL || "file:./data/pos.db";
const command = process.argv[2] || "migrate";

const db = createDb({ dialect, url });

if (command === "migrate" || command === "all") {
  await migrate(db);
}

if (command === "seed" || command === "all") {
  await seed(db);
}

await db.destroy();
