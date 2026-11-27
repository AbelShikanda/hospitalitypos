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

const paymentCredentials: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("payment_credentials")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("provider", "varchar(20)", (column) => column.notNull())
      .addColumn("environment", "varchar(20)", (column) => column.notNull())
      .addColumn("encrypted_config", "text", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("payment_credentials_uidx")
      .ifNotExists()
      .on("payment_credentials")
      .columns(["tenant_id", "provider", "environment"])
      .unique()
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("payment_credentials").ifExists().execute();
  },
};

const stations: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("stations")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("type", "varchar(20)", (column) =>
        column.notNull().defaultTo("kitchen"),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .alterTable("menu_items")
      .addColumn("station_id", "char(26)")
      .execute();

    await db.schema
      .alterTable("order_items")
      .addColumn("station_id", "char(26)")
      .execute();

    await db.schema
      .createIndex("stations_tenant_venue_idx")
      .ifNotExists()
      .on("stations")
      .columns(["tenant_id", "venue_id"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.alterTable("order_items").dropColumn("station_id").execute();
    await db.schema.alterTable("menu_items").dropColumn("station_id").execute();
    await db.schema.dropTable("stations").ifExists().execute();
  },
};

const shiftsAndDiscounts: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("shifts")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("user_id", "char(26)", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("open"),
      )
      .addColumn("starting_cash_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("counted_cash_minor", "integer")
      .addColumn("notes", "text")
      .addColumn("opened_by", "char(26)", (column) => column.notNull())
      .addColumn("closed_by", "char(26)")
      .addColumn("clock_in_at", "timestamp", (column) => column.notNull())
      .addColumn("clock_out_at", "timestamp")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .alterTable("orders")
      .addColumn("discount_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();

    await db.schema.alterTable("orders").addColumn("discount_reason", "text").execute();

    await db.schema
      .createIndex("shifts_tenant_venue_status_idx")
      .ifNotExists()
      .on("shifts")
      .columns(["tenant_id", "venue_id", "status"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.alterTable("orders").dropColumn("discount_reason").execute();
    await db.schema.alterTable("orders").dropColumn("discount_minor").execute();
    await db.schema.dropTable("shifts").ifExists().execute();
  },
};

const inventory: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("stock_items")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("unit", "varchar(20)", (column) =>
        column.notNull().defaultTo("pcs"),
      )
      .addColumn("quantity", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("par_level", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("cost_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("recipes")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("menu_item_id", "char(26)", (column) => column.notNull())
      .addColumn("stock_item_id", "char(26)", (column) => column.notNull())
      .addColumn("quantity", "integer", (column) =>
        column.notNull().defaultTo(1),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("stock_movements")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("stock_item_id", "char(26)", (column) => column.notNull())
      .addColumn("type", "varchar(20)", (column) => column.notNull())
      .addColumn("quantity_delta", "integer", (column) => column.notNull())
      .addColumn("reason", "text")
      .addColumn("reference_id", "char(26)")
      .addColumn("order_id", "char(26)")
      .addColumn("actor_user_id", "char(26)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("suppliers")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("phone", "varchar(40)")
      .addColumn("email", "varchar(120)")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("stock_items_tenant_venue_idx")
      .ifNotExists()
      .on("stock_items")
      .columns(["tenant_id", "venue_id"])
      .execute();
    await db.schema
      .createIndex("recipes_tenant_item_uidx")
      .ifNotExists()
      .on("recipes")
      .columns(["tenant_id", "menu_item_id", "stock_item_id"])
      .unique()
      .execute();
    await db.schema
      .createIndex("stock_movements_reference_uidx")
      .ifNotExists()
      .on("stock_movements")
      .columns(["tenant_id", "reference_id", "stock_item_id", "type"])
      .unique()
      .execute();
    await db.schema
      .createIndex("suppliers_tenant_venue_idx")
      .ifNotExists()
      .on("suppliers")
      .columns(["tenant_id", "venue_id"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("suppliers").ifExists().execute();
    await db.schema.dropTable("stock_movements").ifExists().execute();
    await db.schema.dropTable("recipes").ifExists().execute();
    await db.schema.dropTable("stock_items").ifExists().execute();
  },
};

const paymentTips: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable("payments")
      .addColumn("tip_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.alterTable("payments").dropColumn("tip_minor").execute();
  },
};

const cloudSync: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("outbox_events")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("entity", "varchar(40)", (column) => column.notNull())
      .addColumn("entity_id", "char(26)", (column) => column.notNull())
      .addColumn("op", "varchar(20)", (column) => column.notNull())
      .addColumn("payload", "text", (column) => column.notNull())
      .addColumn("idempotency_key", "varchar(128)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("synced_at", "timestamp")
      .addColumn("attempts", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();

    await db.schema
      .createTable("inbox_messages")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)")
      .addColumn("entity", "varchar(40)", (column) => column.notNull())
      .addColumn("entity_id", "char(26)", (column) => column.notNull())
      .addColumn("op", "varchar(20)", (column) => column.notNull())
      .addColumn("payload", "text", (column) => column.notNull())
      .addColumn("idempotency_key", "varchar(128)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("applied_at", "timestamp")
      .execute();

    await db.schema
      .createTable("sync_cursors")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("last_outbox_at", "timestamp")
      .addColumn("last_inbox_at", "timestamp")
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("heartbeats")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("version", "varchar(40)", (column) => column.notNull())
      .addColumn("schema_version", "integer", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) => column.notNull())
      .addColumn("last_seen_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("cloud_jobs")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("type", "varchar(40)", (column) => column.notNull())
      .addColumn("payload", "text", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("queued"),
      )
      .addColumn("attempts", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .addColumn("run_at", "timestamp", (column) => column.notNull())
      .addColumn("error", "text")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("api_tokens")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("name", "varchar(120)", (column) => column.notNull())
      .addColumn("token_hash", "varchar(64)", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("revoked_at", "timestamp")
      .execute();

    await db.schema
      .createTable("subscriptions")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("plan", "varchar(40)", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) => column.notNull())
      .addColumn("trial_ends_at", "timestamp")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("cloud_backups")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("location", "varchar(255)", (column) => column.notNull())
      .addColumn("checksum", "varchar(128)", (column) => column.notNull())
      .addColumn("size_bytes", "integer", (column) => column.notNull())
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("outbox_events_tenant_synced_idx")
      .ifNotExists()
      .on("outbox_events")
      .columns(["tenant_id", "synced_at", "created_at"])
      .execute();
    await db.schema
      .createIndex("outbox_events_idempotency_uidx")
      .ifNotExists()
      .on("outbox_events")
      .columns(["tenant_id", "idempotency_key"])
      .unique()
      .execute();
    await db.schema
      .createIndex("inbox_messages_idempotency_uidx")
      .ifNotExists()
      .on("inbox_messages")
      .columns(["tenant_id", "idempotency_key"])
      .unique()
      .execute();
    await db.schema
      .createIndex("sync_cursors_uidx")
      .ifNotExists()
      .on("sync_cursors")
      .columns(["tenant_id", "venue_id"])
      .unique()
      .execute();
    await db.schema
      .createIndex("heartbeats_tenant_venue_idx")
      .ifNotExists()
      .on("heartbeats")
      .columns(["tenant_id", "venue_id"])
      .execute();
    await db.schema
      .createIndex("cloud_jobs_status_idx")
      .ifNotExists()
      .on("cloud_jobs")
      .columns(["status", "run_at"])
      .execute();
    await db.schema
      .createIndex("api_tokens_hash_uidx")
      .ifNotExists()
      .on("api_tokens")
      .columns(["token_hash"])
      .unique()
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("api_tokens").ifExists().execute();
    await db.schema.dropTable("cloud_jobs").ifExists().execute();
    await db.schema.dropTable("heartbeats").ifExists().execute();
    await db.schema.dropTable("sync_cursors").ifExists().execute();
    await db.schema.dropTable("inbox_messages").ifExists().execute();
    await db.schema.dropTable("outbox_events").ifExists().execute();
    await db.schema.dropTable("subscriptions").ifExists().execute();
    await db.schema.dropTable("cloud_backups").ifExists().execute();
  },
};

const venueSettingsAndFeedback: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("venue_settings")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)", (column) => column.notNull())
      .addColumn("stock_enabled", "integer", (column) =>
        column.notNull().defaultTo(1),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("feedback")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("venue_id", "char(26)")
      .addColumn("user_id", "char(26)", (column) => column.notNull())
      .addColumn("category", "varchar(40)", (column) => column.notNull())
      .addColumn("subject", "varchar(160)", (column) => column.notNull())
      .addColumn("message", "text", (column) => column.notNull())
      .addColumn("status", "varchar(20)", (column) =>
        column.notNull().defaultTo("open"),
      )
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .addColumn("updated_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("venue_settings_uidx")
      .ifNotExists()
      .on("venue_settings")
      .columns(["tenant_id", "venue_id"])
      .unique()
      .execute();
    await db.schema
      .createIndex("feedback_tenant_venue_idx")
      .ifNotExists()
      .on("feedback")
      .columns(["tenant_id", "venue_id", "created_at"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("feedback").ifExists().execute();
    await db.schema.dropTable("venue_settings").ifExists().execute();
  },
};

const housekeepingAndTips: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable("users")
      .addColumn("is_active", "integer", (column) =>
        column.notNull().defaultTo(1),
      )
      .execute();

    await db.schema
      .alterTable("venue_settings")
      .addColumn("tip_enabled", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();
    await db.schema
      .alterTable("venue_settings")
      .addColumn("tip_threshold_minor", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();
    await db.schema
      .alterTable("venue_settings")
      .addColumn("tip_percent", "integer", (column) =>
        column.notNull().defaultTo(0),
      )
      .execute();

    await db.schema
      .alterTable("shifts")
      .addColumn("clock_in_notes", "text")
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.alterTable("shifts").dropColumn("clock_in_notes").execute();
    await db.schema.alterTable("venue_settings").dropColumn("tip_percent").execute();
    await db.schema
      .alterTable("venue_settings")
      .dropColumn("tip_threshold_minor")
      .execute();
    await db.schema.alterTable("venue_settings").dropColumn("tip_enabled").execute();
    await db.schema.alterTable("users").dropColumn("is_active").execute();
  },
};

const systemEvents: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("system_events")
      .ifNotExists()
      .addColumn("id", "char(26)", (column) => column.primaryKey().notNull())
      .addColumn("tenant_id", "char(26)", (column) => column.notNull())
      .addColumn("user_id", "char(26)", (column) => column.notNull())
      .addColumn("action", "varchar(40)", (column) => column.notNull())
      .addColumn("details", "text")
      .addColumn("created_at", "timestamp", (column) => column.notNull())
      .execute();

    await db.schema
      .createIndex("system_events_tenant_created_idx")
      .ifNotExists()
      .on("system_events")
      .columns(["tenant_id", "created_at"])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("system_events").ifExists().execute();
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
  "009_payment_credentials": paymentCredentials,
  "010_stations": stations,
  "011_shifts_discounts": shiftsAndDiscounts,
  "012_inventory": inventory,
  "013_payment_tips": paymentTips,
  "014_cloud_sync": cloudSync,
  "015_venue_settings_feedback": venueSettingsAndFeedback,
  "016_housekeeping_and_tips": housekeepingAndTips,
  "017_system_events": systemEvents,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
