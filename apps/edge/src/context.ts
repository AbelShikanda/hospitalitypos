import type { Db } from "@hpos/db";

export async function resolveVenue(
  db: Db,
  tenantId: string,
  venueId?: string | null,
) {
  const query = db
    .selectFrom("venues")
    .selectAll()
    .where("tenant_id", "=", tenantId);

  if (venueId) {
    return query.where("id", "=", venueId).executeTakeFirst();
  }

  return query.orderBy("created_at").executeTakeFirst();
}
