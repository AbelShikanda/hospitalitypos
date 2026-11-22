import { createMenuItemSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

export function registerMenuRoutes(app: Hono<AppEnv>, db: Db) {
  app.get("/api/menu", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const [categories, items, groups, modifiers, links, prices] =
      await Promise.all([
        db
          .selectFrom("menu_categories")
          .selectAll()
          .where("tenant_id", "=", auth.tenantId)
          .orderBy("sort_order")
          .orderBy("name")
          .execute(),
        db
          .selectFrom("menu_items")
          .selectAll()
          .where("tenant_id", "=", auth.tenantId)
          .orderBy("sort_order")
          .orderBy("name")
          .execute(),
        db
          .selectFrom("modifier_groups")
          .selectAll()
          .where("tenant_id", "=", auth.tenantId)
          .orderBy("name")
          .execute(),
        db
          .selectFrom("modifiers")
          .selectAll()
          .where("tenant_id", "=", auth.tenantId)
          .orderBy("sort_order")
          .execute(),
        db
          .selectFrom("menu_item_modifier_groups")
          .selectAll()
          .where("tenant_id", "=", auth.tenantId)
          .execute(),
        db
          .selectFrom("venue_prices")
          .selectAll()
          .where("tenant_id", "=", auth.tenantId)
          .where("venue_id", "=", venue.id)
          .execute(),
      ]);

    const modifiersByGroup = new Map<string, typeof modifiers>();
    for (const modifier of modifiers) {
      const list = modifiersByGroup.get(modifier.group_id) ?? [];
      list.push(modifier);
      modifiersByGroup.set(modifier.group_id, list);
    }

    const groupIdsByItem = new Map<string, string[]>();
    for (const link of links) {
      const list = groupIdsByItem.get(link.item_id) ?? [];
      list.push(link.group_id);
      groupIdsByItem.set(link.item_id, list);
    }

    const priceByItem = new Map(
      prices.map((price) => [price.item_id, price.price_minor]),
    );

    const groupsById = new Map(groups.map((group) => [group.id, group]));

    const itemsByCategory = new Map<
      string,
      Array<{
        id: string;
        category_id: string;
        name: string;
        description: string | null;
        price_minor: number;
        tax_rate: number;
        is_available: boolean;
        modifier_groups: Array<{
          id: string;
          name: string;
          min_select: number;
          max_select: number;
          modifiers: Array<{
            id: string;
            name: string;
            price_delta_minor: number;
          }>;
        }>;
      }>
    >();

    for (const item of items) {
      const itemGroups = (groupIdsByItem.get(item.id) ?? []).flatMap(
        (groupId) => {
          const group = groupsById.get(groupId);
          if (!group) return [];
          return [
            {
              id: group.id,
              name: group.name,
              min_select: group.min_select,
              max_select: group.max_select,
              modifiers: (modifiersByGroup.get(group.id) ?? []).map(
                (modifier) => ({
                  id: modifier.id,
                  name: modifier.name,
                  price_delta_minor: modifier.price_delta_minor,
                }),
              ),
            },
          ];
        },
      );

      const list = itemsByCategory.get(item.category_id) ?? [];
      list.push({
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price_minor: priceByItem.get(item.id) ?? item.price_minor,
        tax_rate: item.tax_rate,
        is_available: item.is_available === 1,
        modifier_groups: itemGroups,
      });
      itemsByCategory.set(item.category_id, list);
    }

    return context.json({
      venue_id: venue.id,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        items: itemsByCategory.get(category.id) ?? [],
      })),
    });
  });

  app.post(
    "/api/menu/items",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createMenuItemSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const category = await db
        .selectFrom("menu_categories")
        .select("id")
        .where("id", "=", parsed.data.category_id)
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();

      if (!category) return context.json({ error: "category_not_found" }, 404);

      const item = {
        id: newId(),
        tenant_id: auth.tenantId,
        category_id: parsed.data.category_id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        price_minor: parsed.data.price_minor,
        tax_rate: parsed.data.tax_rate,
        is_available: parsed.data.is_available ? 1 : 0,
        sort_order: 0,
        created_at: new Date().toISOString(),
      };

      await db.insertInto("menu_items").values(item).execute();
      return context.json(item, 201);
    },
  );
}
