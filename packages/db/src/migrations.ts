/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Kysely, Migration, MigrationProvider } from "kysely";

const initial: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("tenants")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("venues")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("users")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("pin_hash", "varchar(255)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("memberships")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("user_id", "char(26)", (column) => column.notNull())
      .addColumn("role", "varchar(40)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("memberships").ifExists().execute();
    await db.schema.dropTable("users").ifExists().execute();
    await db.schema.dropTable("venues").ifExists().execute();
    await db.schema.dropTable("tenants").ifExists().execute();
  },
};

const sessions: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("sessions")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("user_id", "char(26)", (column) => column.notNull())
      .addColumn("token_hash", "varchar(64)", (column) => column.notNull())
      .addColumn("device_id", "varchar(128)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("expires_at", "timestamp", (column) => column.notNull())
      .addColumn("revoked_at", "timestamp")
      .execute();

    await db.schema
      .createIndex("sessions_token_hash_idx")
      .ifNotExists()
      .on("sessions")
      .column("token_hash")
      .unique()
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("sessions").ifExists().execute();
  },
};

const menuFloorOrders: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("menu_categories")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("sort_order", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("menu_items")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("category_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("description", "text")
      .addColumn("price_minor", "integer", (column) => column.notNull())
      .addColumn("tax_rate", "integer", (column) =>
        column.notNull().defaultTo(16),
      )
      .addColumn("is_available", "integer", (column) =>
        column.notNull().defaultTo(1),
      )
      .addColumn("sort_order", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("modifier_groups")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("min_select", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("max_select", "integer", (column) =>
        column.notNull().defaultTo(1),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("modifiers")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("group_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("price_delta_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("sort_order", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("menu_item_modifier_groups")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("item_id", "char(26)", (column) => column.notNull())
      .addColumn("group_id", "char(26)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("venue_prices")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("item_id", "char(26)", (column) => column.notNull())
      .addColumn("price_minor", "integer", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("areas")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("sort_order", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("dining_tables")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("area_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(40)", (column) => column.notNull())
      .addColumn("seats", "integer", (column) => column.notNull().defaultTo(2))
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("free"),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("orders")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("table_id", "char(26)")
      .addColumn("number", "varchar(20)", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("open"),
      )
      .addColumn("subtotal_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("tax_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("total_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("notes", "text")
      .addColumn("opened_by", "char(26)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .addColumn("closed_at", "timestamp")
      .execute();

    await db.schema
      .createTable("order_items")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("order_id", "char(26)", (column) => column.notNull())
      .addColumn("item_id", "char(26)", (column) => column.notNull())
      .addColumn("name_snapshot", "varchar(120)", (column) => column.notNull())
      .addColumn("unit_price_minor", "integer", (column) => column.notNull())
      .addColumn("quantity", "integer", (column) => column.notNull())
      .addColumn("tax_rate", "integer", (column) =>
        column.notNull().defaultTo(16),
      )
      .addColumn("line_total_minor", "integer", (column) => column.notNull())
      .addColumn("notes", "text")
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("pending"),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("order_item_modifiers")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("order_item_id", "char(26)", (column) => column.notNull())
      .addColumn("modifier_id", "char(26)", (column) => column.notNull())
      .addColumn("name_snapshot", "varchar(120)", (column) => column.notNull())
      .addColumn("price_delta_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();

    await db.schema
      .createTable("order_events")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("order_id", "char(26)", (column) => column.notNull())
      .addColumn("type", "varchar(40)", (column) => column.notNull())
      .addColumn("data", "text", (column) => column.notNull())
      .addColumn("actor_user_id", "char(26)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("menu_items_tenant_category_idx")
      .ifNotExists()
      .on("menu_items")
      .columns(["tenant_id", "category_id"])
      .execute();
    await db.schema
      .createIndex("modifiers_tenant_group_idx")
      .ifNotExists()
      .on("modifiers")
      .columns(["tenant_id", "group_id"])
      .execute();
    await db.schema
      .createIndex("menu_item_modifier_groups_uidx")
      .ifNotExists()
      .on("menu_item_modifier_groups")
      .columns(["tenant_id", "item_id", "group_id"])
      .unique()
      .execute();
    await db.schema
      .createIndex("venue_prices_uidx")
      .ifNotExists()
      .on("venue_prices")
      .columns(["tenant_id", "venue_id", "item_id"])
      .unique()
      .execute();
    await db.schema
      .createIndex("areas_tenant_venue_idx")
      .ifNotExists()
      .on("areas")
      .columns(["tenant_id", "venue_id"])
      .execute();
    await db.schema
      .createIndex("dining_tables_uidx")
      .ifNotExists()
      .on("dining_tables")
      .columns(["tenant_id", "venue_id", "name"])
      .unique()
      .execute();
    await db.schema
      .createIndex("orders_tenant_venue_status_idx")
      .ifNotExists()
      .on("orders")
      .columns(["tenant_id", "venue_id", "status"])
      .execute();
    await db.schema
      .createIndex("order_items_tenant_order_idx")
      .ifNotExists()
      .on("order_items")
      .columns(["tenant_id", "order_id"])
      .execute();
    await db.schema
      .createIndex("order_events_tenant_order_idx")
      .ifNotExists()
      .on("order_events")
      .columns(["tenant_id", "order_id"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("order_events").ifExists().execute();
    await db.schema.dropTable("order_item_modifiers").ifExists().execute();
    await db.schema.dropTable("order_items").ifExists().execute();
    await db.schema.dropTable("orders").ifExists().execute();
    await db.schema.dropTable("dining_tables").ifExists().execute();
    await db.schema.dropTable("areas").ifExists().execute();
    await db.schema.dropTable("venue_prices").ifExists().execute();
    await db.schema.dropTable("menu_item_modifier_groups").ifExists().execute();
    await db.schema.dropTable("modifiers").ifExists().execute();
    await db.schema.dropTable("modifier_groups").ifExists().execute();
    await db.schema.dropTable("menu_items").ifExists().execute();
    await db.schema.dropTable("menu_categories").ifExists().execute();
  },
};

const orderIdempotency: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable("orders")
      .addColumn("idempotency_key", "varchar(128)")
      .execute();

    await db.schema
      .createIndex("orders_tenant_idempotency_uidx")
      .ifNotExists()
      .on("orders")
      .columns(["tenant_id", "idempotency_key"])
      .unique()
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema
      .dropIndex("orders_tenant_idempotency_uidx")
      .ifExists()
      .execute();
    await db.schema
      .alterTable("orders")
      .dropColumn("idempotency_key")
      .execute();
  },
};

const orderEventIdempotency: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable("order_events")
      .addColumn("idempotency_key", "varchar(128)")
      .execute();

    await db.schema
      .createIndex("order_events_tenant_idempotency_uidx")
      .ifNotExists()
      .on("order_events")
      .columns(["tenant_id", "idempotency_key"])
      .unique()
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema
      .dropIndex("order_events_tenant_idempotency_uidx")
      .ifExists()
      .execute();
    await db.schema
      .alterTable("order_events")
      .dropColumn("idempotency_key")
      .execute();
  },
};

const orderCourses: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable("menu_items")
      .addColumn("course", "varchar(20)", (column) =>
        column.notNull().defaultTo("main"),
      )
      .execute();

    await db.schema
      .alterTable("order_items")
      .addColumn("course", "varchar(20)", (column) =>
        column.notNull().defaultTo("main"),
      )
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.alterTable("order_items").dropColumn("course").execute();
    await db.schema.alterTable("menu_items").dropColumn("course").execute();
  },
};

const printJobs: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("print_jobs")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("order_id", "char(26)", (column) => column.notNull())
      .addColumn("type", "varchar(20)", (column) => column.notNull())
      .addColumn("payload", "text", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("queued"),
      )
      .addColumn("attempts", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("error", "text")
      .addColumn("idempotency_key", "varchar(128)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("print_jobs_tenant_idempotency_uidx")
      .ifNotExists()
      .on("print_jobs")
      .columns(["tenant_id", "idempotency_key"])
      .unique()
      .execute();

    await db.schema
      .createIndex("print_jobs_tenant_status_idx")
      .ifNotExists()
      .on("print_jobs")
      .columns(["tenant_id", "venue_id", "status"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("print_jobs").ifExists().execute();
  },
};

const payments: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("payments")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("order_id", "char(26)", (column) => column.notNull())
      .addColumn("method", "varchar(20)", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("pending"),
      )
      .addColumn("amount_minor", "integer", (column) => column.notNull())
      .addColumn("currency", "varchar(3)", (column) =>
        column.notNull().defaultTo("KES"),
      )
      .addColumn("idempotency_key", "varchar(128)", (column) =>
        column.notNull(),
      )
      .addColumn("provider_ref", "varchar(128)")
      .addColumn("details", "text", (column) =>
        column.notNull().defaultTo("{}"),
      )
      .addColumn("created_by", "char(26)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .addColumn("confirmed_at", "timestamp")
      .execute();

    await db.schema
      .createTable("payment_events")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("payment_id", "char(26)", (column) => column.notNull())
      .addColumn("type", "varchar(40)", (column) => column.notNull())
      .addColumn("data", "text", (column) => column.notNull())
      .addColumn("actor_user_id", "char(26)")
      .addColumn("idempotency_key", "varchar(128)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("payments_tenant_idempotency_uidx")
      .ifNotExists()
      .on("payments")
      .columns(["tenant_id", "idempotency_key"])
      .unique()
      .execute();

    await db.schema
      .createIndex("payments_tenant_order_idx")
      .ifNotExists()
      .on("payments")
      .columns(["tenant_id", "order_id"])
      .execute();

    await db.schema
      .createIndex("payment_events_tenant_payment_idx")
      .ifNotExists()
      .on("payment_events")
      .columns(["tenant_id", "payment_id"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("payment_events").ifExists().execute();
    await db.schema.dropTable("payments").ifExists().execute();
  },
};

const migrations: Record<string, Migration> = {
  "001_initial": initial,
  "002_sessions": sessions,
  "003_menu_floor_orders": menuFloorOrders,
  "004_order_idempotency": orderIdempotency,
  "005_order_event_idempotency": orderEventIdempotency,
  "006_order_courses": orderCourses,
  "007_print_jobs": printJobs,
  "008_payments": payments,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
