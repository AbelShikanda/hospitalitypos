import { Migrator } from "kysely";
import type { Kysely } from "kysely";
import { migrationProvider } from "./migrations.js";
import type { Database } from "./schema.js";

export async function migrate(db: Kysely<Database>) {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return results;
}
