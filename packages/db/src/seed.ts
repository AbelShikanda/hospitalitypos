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

  const userId = ulid();
  await db
    .insertInto("users")
    .values({
      id: userId,
      tenant_id: tenantId,
      name: "Demo Manager",
      pin_hash: "demo-pin-hash",
      created_at: now,
    })
    .execute();

  await db
    .insertInto("memberships")
    .values({
      id: ulid(),
      tenant_id: tenantId,
      user_id: userId,
      role: "Owner",
      created_at: now,
    })
    .execute();
}
