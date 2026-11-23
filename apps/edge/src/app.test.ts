import { hashPin } from "@hpos/auth";
import { createDb, migrate, type Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import { describe, expect, it } from "vitest";
import { createEdgeApp } from "./app.js";

async function makeDb(): Promise<Db> {
  const db = createDb({ dialect: "sqlite", url: ":memory:" });
  await migrate(db);
  return db;
}

interface Fixture {
  tenantId: string;
  userId: string;
  venueId: string;
}

async function addTenant(
  db: Db,
  name: string,
  role = "owner",
  pin = "1234",
): Promise<Fixture> {
  const now = new Date().toISOString();
  const tenantId = newId();
  const userId = newId();
  const venueId = newId();

  await db
    .insertInto("tenants")
    .values({ id: tenantId, name, created_at: now })
    .execute();
  await db
    .insertInto("venues")
    .values({
      id: venueId,
      tenant_id: tenantId,
      name: `${name} Main`,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("users")
    .values({
      id: userId,
      tenant_id: tenantId,
      name: `${name} User`,
      pin_hash: hashPin(pin),
      created_at: now,
    })
    .execute();
  await db
    .insertInto("memberships")
    .values({
      id: newId(),
      tenant_id: tenantId,
      user_id: userId,
      role,
      created_at: now,
    })
    .execute();

  return { tenantId, userId, venueId };
}

interface MenuFixture {
  categoryId: string;
  itemId: string;
  groupId: string;
  modifierId: string;
  areaId: string;
  tableId: string;
}

async function addMenu(db: Db, fixture: Fixture): Promise<MenuFixture> {
  const now = new Date().toISOString();
  const categoryId = newId();
  const itemId = newId();
  const groupId = newId();
  const modifierId = newId();
  const areaId = newId();
  const tableId = newId();

  await db
    .insertInto("menu_categories")
    .values({
      id: categoryId,
      tenant_id: fixture.tenantId,
      name: "Mains",
      sort_order: 0,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("menu_items")
    .values({
      id: itemId,
      tenant_id: fixture.tenantId,
      category_id: categoryId,
      name: "Nyama Choma",
      description: null,
      price_minor: 95000,
      tax_rate: 16,
      is_available: 1,
      sort_order: 0,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("modifier_groups")
    .values({
      id: groupId,
      tenant_id: fixture.tenantId,
      name: "Portion",
      min_select: 1,
      max_select: 1,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("modifiers")
    .values({
      id: modifierId,
      tenant_id: fixture.tenantId,
      group_id: groupId,
      name: "Large",
      price_delta_minor: 20000,
      sort_order: 0,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("menu_item_modifier_groups")
    .values({
      id: newId(),
      tenant_id: fixture.tenantId,
      item_id: itemId,
      group_id: groupId,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("areas")
    .values({
      id: areaId,
      tenant_id: fixture.tenantId,
      venue_id: fixture.venueId,
      name: "Main Hall",
      sort_order: 0,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("dining_tables")
    .values({
      id: tableId,
      tenant_id: fixture.tenantId,
      venue_id: fixture.venueId,
      area_id: areaId,
      name: "T1",
      seats: 4,
      status: "free",
      created_at: now,
    })
    .execute();

  return { categoryId, itemId, groupId, modifierId, areaId, tableId };
}

function appFor(db: Db) {
  return createEdgeApp({ db, version: "test", webDist: null });
}

async function login(
  app: ReturnType<typeof appFor>,
  fixture: Fixture,
  pin = "1234",
) {
  const response = await app.request("/api/auth/pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_id: fixture.tenantId,
      user_id: fixture.userId,
      pin,
    }),
  });

  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/hpos_session=([^;]+)/);
  return { response, cookie: match ? `hpos_session=${match[1]}` : "" };
}

describe("edge app auth and tenant isolation", () => {
  it("reports health without auth", async () => {
    const app = appFor(await makeDb());
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      mode: "edge",
    });
  });

  it("bootstraps the local tenant and staff", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const app = appFor(db);

    const response = await app.request("/api/bootstrap");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      tenant: { id: string };
      venues: Array<{ id: string }>;
      staff: Array<{ id: string; role: string }>;
    };

    expect(body.tenant.id).toBe(fixture.tenantId);
    expect(body.venues.map((venue) => venue.id)).toEqual([fixture.venueId]);
    expect(body.staff).toEqual([
      { id: fixture.userId, name: "Alpha User", role: "owner" },
    ]);
  });

  it("rejects unauthenticated venue access", async () => {
    const app = appFor(await makeDb());
    const response = await app.request("/api/venues");
    expect(response.status).toBe(401);
  });

  it("rejects a wrong PIN", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const { response, cookie } = await login(appFor(db), fixture, "9999");
    expect(response.status).toBe(401);
    expect(cookie).toBe("");
  });

  it("creates a revocable session on PIN login", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const app = appFor(db);
    const { response, cookie } = await login(app, fixture);

    expect(response.status).toBe(200);
    expect(cookie).not.toBe("");

    const session = await app.request("/api/auth/session", {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      tenant_id: fixture.tenantId,
      user_id: fixture.userId,
      role: "owner",
    });

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(logout.status).toBe(204);

    const after = await app.request("/api/auth/session", {
      headers: { cookie },
    });
    expect(after.status).toBe(401);
  });

  it("returns only the session tenant's venues", async () => {
    const db = await makeDb();
    const alpha = await addTenant(db, "Alpha");
    const beta = await addTenant(db, "Beta");
    const app = appFor(db);
    const { cookie } = await login(app, alpha);

    const response = await app.request("/api/venues", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);

    const venues = (await response.json()) as Array<{
      id: string;
      tenant_id: string;
    }>;
    expect(venues).toHaveLength(1);
    expect(venues[0]?.tenant_id).toBe(alpha.tenantId);
    expect(venues.map((venue) => venue.id)).not.toContain(beta.venueId);
  });

  it("refuses to log a user into another tenant", async () => {
    const db = await makeDb();
    const alpha = await addTenant(db, "Alpha");
    const beta = await addTenant(db, "Beta");
    const app = appFor(db);

    const response = await app.request("/api/auth/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: beta.tenantId,
        user_id: alpha.userId,
        pin: "1234",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("enforces roles for venue creation", async () => {
    const db = await makeDb();
    const waiter = await addTenant(db, "Alpha", "waiter");
    const app = appFor(db);
    const { cookie } = await login(app, waiter);

    const denied = await app.request("/api/venues", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "New Venue" }),
    });
    expect(denied.status).toBe(403);

    const owner = await addTenant(db, "Beta", "owner");
    const ownerLogin = await login(app, owner);
    const created = await app.request("/api/venues", {
      method: "POST",
      headers: {
        cookie: ownerLogin.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "New Venue" }),
    });

    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      tenant_id: owner.tenantId,
      name: "New Venue",
    });
  });
});

describe("menu, floor and orders", () => {
  it("serves the venue menu and floor plan", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const menuResponse = await app.request(
      `/api/menu?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    expect(menuResponse.status).toBe(200);
    const menuBody = (await menuResponse.json()) as {
      venue_id: string;
      categories: Array<{
        name: string;
        items: Array<{
          id: string;
          name: string;
          price_minor: number;
          is_available: boolean;
          modifier_groups: Array<{
            modifiers: Array<{
              id: string;
              name: string;
              price_delta_minor: number;
            }>;
          }>;
        }>;
      }>;
    };

    expect(menuBody.venue_id).toBe(fixture.venueId);
    expect(menuBody.categories[0]?.items[0]).toMatchObject({
      id: menu.itemId,
      name: "Nyama Choma",
      price_minor: 95000,
      is_available: true,
    });
    expect(
      menuBody.categories[0]?.items[0]?.modifier_groups[0]?.modifiers[0],
    ).toMatchObject({
      id: menu.modifierId,
      name: "Large",
      price_delta_minor: 20000,
    });

    const floorResponse = await app.request(
      `/api/floor?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    expect(floorResponse.status).toBe(200);
    const floorBody = (await floorResponse.json()) as {
      areas: Array<{
        name: string;
        tables: Array<{
          id: string;
          name: string;
          seats: number;
          status: string;
        }>;
      }>;
    };
    expect(floorBody.areas[0]?.tables[0]).toMatchObject({
      id: menu.tableId,
      name: "T1",
      seats: 4,
      status: "free",
    });
  });

  it("opens an order, prices modifiers, sends it and frees the table", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const missingModifier = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        table_id: menu.tableId,
        items: [{ item_id: menu.itemId, quantity: 2 }],
      }),
    });
    expect(missingModifier.status).toBe(400);
    await expect(missingModifier.json()).resolves.toMatchObject({
      error: "modifier_required",
    });

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        table_id: menu.tableId,
        items: [
          {
            item_id: menu.itemId,
            quantity: 2,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);

    const order = (await created.json()) as {
      id: string;
      number: string;
      status: string;
      subtotal_minor: number;
      tax_minor: number;
      total_minor: number;
      table_id: string;
      items: Array<{
        unit_price_minor: number;
        quantity: number;
        line_total_minor: number;
        modifiers: Array<{ name: string; price_delta_minor: number }>;
      }>;
    };

    expect(order).toMatchObject({
      number: "#0001",
      status: "open",
      subtotal_minor: 198276,
      tax_minor: 31724,
      total_minor: 230000,
      table_id: menu.tableId,
    });
    expect(order.items[0]).toMatchObject({
      unit_price_minor: 95000,
      quantity: 2,
      line_total_minor: 230000,
    });
    expect(order.items[0]?.modifiers[0]).toMatchObject({
      name: "Large",
      price_delta_minor: 20000,
    });

    const floor = await app.request(`/api/floor?venue_id=${fixture.venueId}`, {
      headers: { cookie },
    });
    const floorBody = (await floor.json()) as {
      areas: Array<{ tables: Array<{ id: string; status: string }> }>;
    };
    expect(
      floorBody.areas[0]?.tables.find((table) => table.id === menu.tableId),
    ).toMatchObject({ status: "occupied" });

    const list = await app.request(
      `/api/orders?venue_id=${fixture.venueId}&status=open`,
      { headers: { cookie } },
    );
    const orders = (await list.json()) as Array<{
      id: string;
      table_name: string;
      total_minor: number;
    }>;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: order.id,
      table_name: "T1",
      total_minor: 230000,
    });

    const sent = await app.request(`/api/orders/${order.id}/send`, {
      method: "POST",
      headers: { cookie },
    });
    expect(sent.status).toBe(200);
    await expect(sent.json()).resolves.toMatchObject({ status: "sent" });

    const closed = await app.request(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closed.status).toBe(409);

    for (const status of ["preparing", "ready", "served", "closed"]) {
      const response = await app.request(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      expect(response.status).toBe(200);
    }

    const after = await app.request(`/api/floor?venue_id=${fixture.venueId}`, {
      headers: { cookie },
    });
    const afterBody = (await after.json()) as {
      areas: Array<{ tables: Array<{ id: string; status: string }> }>;
    };
    expect(
      afterBody.areas[0]?.tables.find((table) => table.id === menu.tableId),
    ).toMatchObject({ status: "free" });
  });

  it("replays order creation and transitions safely with an idempotency key", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const payload = {
      venue_id: fixture.venueId,
      table_id: menu.tableId,
      idempotency_key: "order-key-0001",
      items: [
        {
          item_id: menu.itemId,
          quantity: 1,
          modifier_ids: [menu.modifierId],
        },
      ],
    };

    const first = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    const firstOrder = (await first.json()) as { id: string };

    const replay = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(replay.status).toBe(200);
    const replayOrder = (await replay.json()) as { id: string };
    expect(replayOrder.id).toBe(firstOrder.id);

    const list = await app.request(
      `/api/orders?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    const orders = (await list.json()) as Array<{ id: string }>;
    expect(orders).toHaveLength(1);

    const sent = await app.request(`/api/orders/${firstOrder.id}/send`, {
      method: "POST",
      headers: { cookie },
    });
    expect(sent.status).toBe(200);

    const sentAgain = await app.request(`/api/orders/${firstOrder.id}/send`, {
      method: "POST",
      headers: { cookie },
    });
    expect(sentAgain.status).toBe(200);

    const preparing = await app.request(
      `/api/orders/${firstOrder.id}/status`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "preparing" }),
      },
    );
    expect(preparing.status).toBe(200);

    const preparingAgain = await app.request(
      `/api/orders/${firstOrder.id}/status`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "preparing" }),
      },
    );
    expect(preparingAgain.status).toBe(200);
  });

  it("reopens a sent tab, appends a round and sends only new items", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        table_id: menu.tableId,
        items: [
          {
            item_id: menu.itemId,
            quantity: 2,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const sent = await app.request(`/api/orders/${order.id}/send`, {
      method: "POST",
      headers: { cookie },
    });
    expect(sent.status).toBe(200);

    const appendPayload = {
      idempotency_key: "append-key-0001",
      items: [
        {
          item_id: menu.itemId,
          quantity: 1,
          modifier_ids: [menu.modifierId],
        },
      ],
    };

    const appended = await app.request(`/api/orders/${order.id}/items`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(appendPayload),
    });
    expect(appended.status).toBe(201);

    const appendedOrder = (await appended.json()) as {
      status: string;
      subtotal_minor: number;
      tax_minor: number;
      total_minor: number;
      items: Array<{ status: string }>;
    };
    expect(appendedOrder).toMatchObject({
      status: "sent",
      subtotal_minor: 297414,
      tax_minor: 47586,
      total_minor: 345000,
    });
    expect(appendedOrder.items.map((item) => item.status)).toEqual([
      "sent",
      "pending",
    ]);

    const replay = await app.request(`/api/orders/${order.id}/items`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(appendPayload),
    });
    expect(replay.status).toBe(200);
    const replayOrder = (await replay.json()) as { items: Array<unknown> };
    expect(replayOrder.items).toHaveLength(2);

    const sentRound = await app.request(`/api/orders/${order.id}/send`, {
      method: "POST",
      headers: { cookie },
    });
    expect(sentRound.status).toBe(200);
    const sentOrder = (await sentRound.json()) as {
      status: string;
      items: Array<{ status: string }>;
    };
    expect(sentOrder.status).toBe("sent");
    expect(sentOrder.items.every((item) => item.status === "sent")).toBe(true);
  });

  it("keeps menu and orders isolated between tenants", async () => {
    const db = await makeDb();
    const alpha = await addTenant(db, "Alpha");
    const beta = await addTenant(db, "Beta");
    const menu = await addMenu(db, alpha);
    const app = appFor(db);
    const alphaLogin = await login(app, alpha);
    const betaLogin = await login(app, beta);

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: {
        cookie: alphaLogin.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        venue_id: alpha.venueId,
        table_id: menu.tableId,
        items: [
          {
            item_id: menu.itemId,
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const crossOrder = await app.request(`/api/orders/${order.id}`, {
      headers: { cookie: betaLogin.cookie },
    });
    expect(crossOrder.status).toBe(404);

    const crossMenu = await app.request(`/api/menu?venue_id=${alpha.venueId}`, {
      headers: { cookie: betaLogin.cookie },
    });
    expect(crossMenu.status).toBe(404);

    const crossCreate = await app.request("/api/orders", {
      method: "POST",
      headers: {
        cookie: betaLogin.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        venue_id: alpha.venueId,
        items: [{ item_id: menu.itemId, quantity: 1 }],
      }),
    });
    expect(crossCreate.status).toBe(404);
  });
});
