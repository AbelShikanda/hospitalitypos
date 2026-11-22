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

const DEMO_CATEGORIES = ["Starters", "Mains", "Drinks"] as const;

const DEMO_ITEMS = [
  { key: "samosa", category: "Starters", name: "Beef Samosa", price: 25000 },
  {
    key: "wings",
    category: "Starters",
    name: "Chicken Wings",
    price: 55000,
  },
  {
    key: "spring-rolls",
    category: "Starters",
    name: "Veg Spring Rolls",
    price: 35000,
  },
  { key: "nyama", category: "Mains", name: "Nyama Choma", price: 95000 },
  { key: "biryani", category: "Mains", name: "Chicken Biryani", price: 75000 },
  { key: "tilapia", category: "Mains", name: "Grilled Tilapia", price: 110000 },
  {
    key: "ugali",
    category: "Mains",
    name: "Ugali & Sukuma",
    price: 35000,
  },
  { key: "soda", category: "Drinks", name: "Soda", price: 15000 },
  { key: "dawa", category: "Drinks", name: "Dawa", price: 45000 },
  { key: "water", category: "Drinks", name: "Water", price: 10000 },
] as const;

const DEMO_TABLES = [
  { area: "Main Hall", name: "T1", seats: 2, status: "free" },
  { area: "Main Hall", name: "T2", seats: 4, status: "free" },
  { area: "Main Hall", name: "T3", seats: 4, status: "occupied" },
  { area: "Terrace", name: "T4", seats: 6, status: "free" },
  { area: "Terrace", name: "T5", seats: 2, status: "reserved" },
  { area: "Terrace", name: "T6", seats: 4, status: "free" },
] as const;

async function seedMenuAndFloor(
  db: Kysely<Database>,
  tenantId: string,
  venueId?: string,
): Promise<void> {
  const existing = await db
    .selectFrom("menu_categories")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (existing) return;

  let venue = venueId;
  if (!venue) {
    const existingVenue = await db
      .selectFrom("venues")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .orderBy("created_at")
      .executeTakeFirst();

    if (existingVenue) {
      venue = existingVenue.id;
    } else {
      venue = ulid();
      await db
        .insertInto("venues")
        .values({
          id: venue,
          tenant_id: tenantId,
          name: "Main Venue",
          created_at: new Date().toISOString(),
        })
        .execute();
    }
  }

  const now = new Date().toISOString();

  const categoryIds = new Map<string, string>();
  for (const [index, name] of DEMO_CATEGORIES.entries()) {
    const categoryId = ulid();
    categoryIds.set(name, categoryId);
    await db
      .insertInto("menu_categories")
      .values({
        id: categoryId,
        tenant_id: tenantId,
        name,
        sort_order: index,
        created_at: now,
      })
      .execute();
  }

  const itemIds = new Map<string, string>();
  for (const [index, item] of DEMO_ITEMS.entries()) {
    const itemId = ulid();
    itemIds.set(item.key, itemId);
    await db
      .insertInto("menu_items")
      .values({
        id: itemId,
        tenant_id: tenantId,
        category_id: categoryIds.get(item.category)!,
        name: item.name,
        description: null,
        price_minor: item.price,
        tax_rate: 16,
        is_available: 1,
        sort_order: index,
        created_at: now,
      })
      .execute();
  }

  const spiceGroupId = ulid();
  await db
    .insertInto("modifier_groups")
    .values({
      id: spiceGroupId,
      tenant_id: tenantId,
      name: "Spice level",
      min_select: 0,
      max_select: 1,
      created_at: now,
    })
    .execute();

  const portionGroupId = ulid();
  await db
    .insertInto("modifier_groups")
    .values({
      id: portionGroupId,
      tenant_id: tenantId,
      name: "Portion",
      min_select: 1,
      max_select: 1,
      created_at: now,
    })
    .execute();

  const modifiers = [
    { group: spiceGroupId, name: "Mild", delta: 0 },
    { group: spiceGroupId, name: "Hot", delta: 0 },
    { group: portionGroupId, name: "Regular", delta: 0 },
    { group: portionGroupId, name: "Large", delta: 20000 },
  ];

  for (const [index, modifier] of modifiers.entries()) {
    await db
      .insertInto("modifiers")
      .values({
        id: ulid(),
        tenant_id: tenantId,
        group_id: modifier.group,
        name: modifier.name,
        price_delta_minor: modifier.delta,
        sort_order: index,
        created_at: now,
      })
      .execute();
  }

  const mains = ["nyama", "biryani", "tilapia", "ugali"];
  for (const key of mains) {
    for (const groupId of [spiceGroupId, portionGroupId]) {
      await db
        .insertInto("menu_item_modifier_groups")
        .values({
          id: ulid(),
          tenant_id: tenantId,
          item_id: itemIds.get(key)!,
          group_id: groupId,
          created_at: now,
        })
        .execute();
    }
  }

  await db
    .insertInto("venue_prices")
    .values({
      id: ulid(),
      tenant_id: tenantId,
      venue_id: venue,
      item_id: itemIds.get("dawa")!,
      price_minor: 50000,
      created_at: now,
    })
    .execute();

  const areaIds = new Map<string, string>();
  for (const [index, name] of ["Main Hall", "Terrace"].entries()) {
    const areaId = ulid();
    areaIds.set(name, areaId);
    await db
      .insertInto("areas")
      .values({
        id: areaId,
        tenant_id: tenantId,
        venue_id: venue,
        name,
        sort_order: index,
        created_at: now,
      })
      .execute();
  }

  for (const table of DEMO_TABLES) {
    await db
      .insertInto("dining_tables")
      .values({
        id: ulid(),
        tenant_id: tenantId,
        venue_id: venue,
        area_id: areaIds.get(table.area)!,
        name: table.name,
        seats: table.seats,
        status: table.status,
        created_at: now,
      })
      .execute();
  }
}

export async function seed(db: Kysely<Database>): Promise<void> {
  const existing = await db
    .selectFrom("tenants")
    .select("id")
    .orderBy("created_at")
    .executeTakeFirst();

  if (existing) {
    await seedMenuAndFloor(db, existing.id);
    return;
  }

  const now = new Date().toISOString();
  const tenantId = ulid();
  const venueId = ulid();

  await db
    .insertInto("tenants")
    .values({ id: tenantId, name: "Demo Hospitality", created_at: now })
    .execute();

  await db
    .insertInto("venues")
    .values({
      id: venueId,
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

  await seedMenuAndFloor(db, tenantId, venueId);
}
