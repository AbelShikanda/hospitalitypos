import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

export { createDb } from "./dialect.js";
export type { Dialect, DbConfig } from "./dialect.js";
export type Db = Kysely<Database>;
export { migrate } from "./migrate.js";
export { seed } from "./seed.js";
export type {
  Database,
  TenantsTable,
  VenuesTable,
  UsersTable,
  MembershipsTable,
  SessionsTable,
} from "./schema.js";
