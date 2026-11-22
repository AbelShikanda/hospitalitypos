import { hashPin } from "@hpos/auth";
import { ulid } from "ulid";
import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

const DEMO_PIN = "1234";

const DEMO_STAFF = [
  { name: "Demo Owner", role: "owner" },
  { name: "Demo Manager", role: "manager" },
  { name: "Demo Cashier", role: "cashier" },
  { name: "Demo Waiter", role: "waiter" },
] as const;

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

  for (const member of DEMO_STAFF) {
    const userId = ulid();
    await db
      .insertInto("users")
      .values({
        id: userId,
        tenant_id: tenantId,
        name: member.name,
        pin_hash: hashPin(DEMO_PIN),
        created_at: now,
      })
      .execute();

    await db
      .insertInto("memberships")
      .values({
        id: ulid(),
        tenant_id: tenantId,
        user_id: userId,
        role: member.role,
        created_at: now,
      })
      .execute();
  }
}
