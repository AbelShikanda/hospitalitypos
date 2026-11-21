import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";
import { createPool } from "mysql2";
import { Pool } from "pg";
import type { Database } from "./schema.js";

export type Dialect = "sqlite" | "postgres" | "mysql";

export interface DbConfig {
  dialect: Dialect;
  url: string;
}

export function createDb(config: DbConfig): Kysely<Database> {
  switch (config.dialect) {
    case "sqlite": {
      const file = config.url.replace(/^file:/, "");
      mkdirSync(dirname(file), { recursive: true });
      const database = new BetterSqlite3(file);
      database.pragma("journal_mode = WAL");
      database.pragma("foreign_keys = ON");
      return new Kysely<Database>({
        dialect: new SqliteDialect({ database }),
      });
    }
    case "postgres":
      return new Kysely<Database>({
        dialect: new PostgresDialect({
          pool: new Pool({ connectionString: config.url }),
        }),
      });
    case "mysql":
      return new Kysely<Database>({
        dialect: new MysqlDialect({ pool: createPool(config.url) }),
      });
  }
}
