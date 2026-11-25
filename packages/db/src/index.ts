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
  VenueSettingsTable,
  FeedbackTable,
  UsersTable,
  MembershipsTable,
  SessionsTable,
  MenuCategoriesTable,
  MenuItemsTable,
  ModifierGroupsTable,
  ModifiersTable,
  MenuItemModifierGroupsTable,
  VenuePricesTable,
  AreasTable,
  DiningTablesTable,
  OrdersTable,
  OrderItemsTable,
  OrderItemModifiersTable,
  OrderEventsTable,
} from "./schema.js";
