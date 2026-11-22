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

const migrations: Record<string, Migration> = {
  "001_initial": initial,
  "002_sessions": sessions,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
