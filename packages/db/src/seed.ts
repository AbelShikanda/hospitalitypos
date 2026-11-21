import { ulid } from "ulid";
import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

export async function seed(db: Kysely<Database>): Promise<void> {
  const existing = await db
    .selectFrom("tenants")
    .select("id")
    .executeTakeFirst();

  if (existing) return;

  const now = new Date().toISOString();
  const tenantId = ulid();

  await db
    .insertInto("tenants")
    .values({ id: tenantId, name: "Demo Hospitality", created_at: now })
    .execute();

  await db
    .insertInto("venues")
    .values({
      id: ulid(),
      tenant_id: tenantId,
      name: "Main Venue",
      created_at: now,
    })
    .execute();
}
