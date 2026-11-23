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
  starterItemId: string;
  groupId: string;
  modifierId: string;
  areaId: string;
  tableId: string;
  secondTableId: string;
}

async function addMenu(db: Db, fixture: Fixture): Promise<MenuFixture> {
  const now = new Date().toISOString();
  const categoryId = newId();
  const itemId = newId();
  const starterItemId = newId();
  const groupId = newId();
  const modifierId = newId();
  const areaId = newId();
  const tableId = newId();
  const secondTableId = newId();

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
      course: "main",
      station_id: null,
      is_available: 1,
      sort_order: 0,
      created_at: now,
    })
    .execute();
  await db
    .insertInto("menu_items")
    .values({
      id: starterItemId,
      tenant_id: fixture.tenantId,
      category_id: categoryId,
      name: "Samosa",
      description: null,
      price_minor: 25000,
      tax_rate: 16,
      course: "starter",
      station_id: null,
      is_available: 1,
      sort_order: 1,
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
  await db
    .insertInto("dining_tables")
    .values({
      id: secondTableId,
      tenant_id: fixture.tenantId,
      venue_id: fixture.venueId,
      area_id: areaId,
      name: "T2",
      seats: 2,
      status: "free",
      created_at: now,
    })
    .execute();

  return {
    categoryId,
    itemId,
    starterItemId,
    groupId,
    modifierId,
    areaId,
    tableId,
    secondTableId,
  };
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
          course: string;
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
      course: "main",
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
      course: "main",
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

  it("accepts a client order id and combined create-and-send request", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);
    const clientId = newId();

    const payload = {
      id: clientId,
      venue_id: fixture.venueId,
      table_id: menu.tableId,
      idempotency_key: "queued-order-0001",
      send: true,
      course: "starter",
      items: [
        { item_id: menu.starterItemId, quantity: 1 },
        {
          item_id: menu.itemId,
          quantity: 1,
          modifier_ids: [menu.modifierId],
        },
      ],
    };

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as {
      id: string;
      status: string;
      items: Array<{ course: string; status: string }>;
    };
    expect(order.id).toBe(clientId);
    expect(order.status).toBe("sent");
    expect(
      order.items.find((item) => item.course === "starter")?.status,
    ).toBe("sent");
    expect(
      order.items.find((item) => item.course === "main")?.status,
    ).toBe("pending");

    const replay = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ id: clientId });
  });

  it("fires only the selected course and then the remaining items", async () => {
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
          { item_id: menu.starterItemId, quantity: 1 },
          {
            item_id: menu.itemId,
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as {
      id: string;
      items: Array<{ id: string; course: string; status: string }>;
    };

    const starter = await app.request(`/api/orders/${order.id}/send`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ course: "starter" }),
    });
    expect(starter.status).toBe(200);
    const afterStarter = (await starter.json()) as {
      status: string;
      items: Array<{ course: string; status: string }>;
    };
    expect(afterStarter.status).toBe("sent");
    expect(
      afterStarter.items.find((item) => item.course === "starter")?.status,
    ).toBe("sent");
    expect(
      afterStarter.items.find((item) => item.course === "main")?.status,
    ).toBe("pending");

    const main = await app.request(`/api/orders/${order.id}/send`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ course: "main" }),
    });
    expect(main.status).toBe(200);
    const afterMain = (await main.json()) as {
      items: Array<{ status: string }>;
    };
    expect(afterMain.items.every((item) => item.status === "sent")).toBe(true);
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
      notes: "Bring extra napkins",
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
      notes: string;
      subtotal_minor: number;
      tax_minor: number;
      total_minor: number;
      items: Array<{ status: string }>;
    };
    expect(appendedOrder).toMatchObject({
      status: "sent",
      notes: "Bring extra napkins",
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

  it("moves an order to a free table and frees the old table", async () => {
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
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const movePayload = {
      table_id: menu.secondTableId,
      idempotency_key: "move-key-0001",
    };
    const moved = await app.request(`/api/orders/${order.id}/move`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(movePayload),
    });
    expect(moved.status).toBe(200);
    await expect(moved.json()).resolves.toMatchObject({
      table_id: menu.secondTableId,
    });

    const floor = await app.request(`/api/floor?venue_id=${fixture.venueId}`, {
      headers: { cookie },
    });
    const floorBody = (await floor.json()) as {
      areas: Array<{ tables: Array<{ id: string; status: string }> }>;
    };
    const tables = floorBody.areas[0]?.tables ?? [];
    expect(tables.find((table) => table.id === menu.tableId)?.status).toBe(
      "free",
    );
    expect(tables.find((table) => table.id === menu.secondTableId)?.status).toBe(
      "occupied",
    );

    const replay = await app.request(`/api/orders/${order.id}/move`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(movePayload),
    });
    expect(replay.status).toBe(200);
  });

  it("merges two tabs and frees the source table", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    async function createOrder(tableId: string) {
      const response = await app.request("/api/orders", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          venue_id: fixture.venueId,
          table_id: tableId,
          items: [
            {
              item_id: menu.itemId,
              quantity: 1,
              modifier_ids: [menu.modifierId],
            },
          ],
        }),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as { id: string };
    }

    const source = await createOrder(menu.tableId);
    const target = await createOrder(menu.secondTableId);

    const mergePayload = {
      target_order_id: target.id,
      idempotency_key: "merge-key-0001",
    };
    const merged = await app.request(`/api/orders/${source.id}/merge`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(mergePayload),
    });
    expect(merged.status).toBe(200);
    const mergedOrder = (await merged.json()) as {
      id: string;
      total_minor: number;
      items: Array<unknown>;
    };
    expect(mergedOrder).toMatchObject({
      id: target.id,
      total_minor: 230000,
    });
    expect(mergedOrder.items).toHaveLength(2);

    const sourceAfter = await app.request(`/api/orders/${source.id}`, {
      headers: { cookie },
    });
    await expect(sourceAfter.json()).resolves.toMatchObject({ status: "closed" });

    const floor = await app.request(`/api/floor?venue_id=${fixture.venueId}`, {
      headers: { cookie },
    });
    const floorBody = (await floor.json()) as {
      areas: Array<{ tables: Array<{ id: string; status: string }> }>;
    };
    const tables = floorBody.areas[0]?.tables ?? [];
    expect(tables.find((table) => table.id === menu.tableId)?.status).toBe(
      "free",
    );
    expect(tables.find((table) => table.id === menu.secondTableId)?.status).toBe(
      "occupied",
    );

    const replay = await app.request(`/api/orders/${source.id}/merge`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(mergePayload),
    });
    expect(replay.status).toBe(200);
  });

  it("queues a receipt print job once for a given idempotency key", async () => {
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
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const payload = {
      order_id: order.id,
      discount_percent: 10,
      tip_minor: 5000,
      kick_drawer: true,
      idempotency_key: "print-key-0001",
    };

    const first = await app.request("/api/print/receipt", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    const job = (await first.json()) as { id: string };

    const replay = await app.request("/api/print/receipt", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ id: job.id });

    const jobs = await app.request(
      `/api/print/jobs?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    const jobList = (await jobs.json()) as Array<{ id: string }>;
    expect(jobList).toHaveLength(1);
  });

  it("records payments with idempotency, confirmation and reversal", async () => {
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
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const cashPayload = {
      order_id: order.id,
      method: "cash",
      amount_minor: 50000,
      idempotency_key: "cash-payment-001",
    };
    const cash = await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(cashPayload),
    });
    expect(cash.status).toBe(201);
    const cashPayment = (await cash.json()) as { id: string; status: string };
    expect(cashPayment.status).toBe("confirmed");

    const replay = await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(cashPayload),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ id: cashPayment.id });

    const manual = await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        method: "mpesa_manual",
        amount_minor: 50000,
        idempotency_key: "mpesa-payment-001",
        mpesa: { reference: "ABC123XYZ" },
      }),
    });
    expect(manual.status).toBe(201);
    const manualPayment = (await manual.json()) as { id: string; status: string };
    expect(manualPayment.status).toBe("pending");

    const confirmed = await app.request(
      `/api/payments/${manualPayment.id}/confirm`,
      { method: "POST", headers: { cookie } },
    );
    expect(confirmed.status).toBe(200);
    await expect(confirmed.json()).resolves.toMatchObject({
      status: "confirmed",
    });

    const reversed = await app.request(
      `/api/payments/${manualPayment.id}/reverse`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ reason: "Customer disputed the code" }),
      },
    );
    expect(reversed.status).toBe(200);
    await expect(reversed.json()).resolves.toMatchObject({
      status: "reversed",
    });

    const report = await app.request(
      `/api/payments/reconciliation?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    const rows = (await report.json()) as Array<{
      method: string;
      captured_minor: number;
      reversed_minor: number;
    }>;
    expect(rows.find((row) => row.method === "cash")).toMatchObject({
      captured_minor: 50000,
    });
    expect(rows.find((row) => row.method === "mpesa_manual")).toMatchObject({
      reversed_minor: 50000,
    });
  });

  it("confirms an STK payment from an idempotent Daraja callback", async () => {
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
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const payment = await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        method: "mpesa_stk",
        amount_minor: 50000,
        idempotency_key: "stk-payment-001",
        mpesa: { phone: "0712345678" },
      }),
    });
    expect(payment.status).toBe(201);
    const stkPayment = (await payment.json()) as { id: string; status: string };
    expect(stkPayment.status).toBe("pending");

    await db
      .updateTable("payments")
      .set({
        provider_ref: "ws_CO_test",
        details: JSON.stringify({ checkout_request_id: "ws_CO_test" }),
      })
      .where("id", "=", stkPayment.id)
      .execute();

    const callbackBody = {
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_test",
          ResultCode: 0,
          ResultDesc: "Success",
          TransactionID: "MPESA123",
        },
      },
    };
    const callback = await app.request("/api/payments/mpesa/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(callbackBody),
    });
    expect(callback.status).toBe(200);

    const after = await app.request(`/api/payments?order_id=${order.id}`, {
      headers: { cookie },
    });
    const rows = (await after.json()) as Array<{
      id: string;
      status: string;
      provider_ref: string;
    }>;
    expect(rows[0]).toMatchObject({
      id: stkPayment.id,
      status: "confirmed",
      provider_ref: "MPESA123",
    });

    const replay = await app.request("/api/payments/mpesa/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(callbackBody),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ duplicate: true });
  });

  it("routes tickets to a station and reprints them", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const stationResponse = await app.request("/api/stations", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        name: "Grill",
        type: "kitchen",
      }),
    });
    expect(stationResponse.status).toBe(201);
    const station = (await stationResponse.json()) as { id: string };

    const assigned = await app.request(
      `/api/menu/items/${menu.itemId}/station`,
      {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ station_id: station.id }),
      },
    );
    expect(assigned.status).toBe(200);

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
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

    const tickets = await app.request(
      `/api/kds/tickets?venue_id=${fixture.venueId}&station_id=${station.id}`,
      { headers: { cookie } },
    );
    const rows = (await tickets.json()) as Array<{
      id: string;
      items: Array<{ station_id: string | null }>;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(order.id);
    expect(rows[0]?.items[0]?.station_id).toBe(station.id);

    const printed = await app.request("/api/print/kitchen", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        station_id: station.id,
        idempotency_key: "kitchen-print-001",
      }),
    });
    expect(printed.status).toBe(201);
    await expect(printed.json()).resolves.toMatchObject({ type: "kitchen" });
  });

  it("enforces role checks for discounts and order close", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha", "waiter");
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
            quantity: 1,
            modifier_ids: [menu.modifierId],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const order = (await created.json()) as { id: string };

    const discount = await app.request(`/api/orders/${order.id}/discount`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        discount_minor: 5000,
        reason: "Regular customer",
      }),
    });
    expect(discount.status).toBe(403);

    const closed = await app.request(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closed.status).toBe(403);
  });

  it("tracks shifts with a Z-report and CSV export", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const clockIn = await app.request("/api/shifts/clock-in", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        starting_cash_minor: 10000,
      }),
    });
    expect(clockIn.status).toBe(201);
    const shift = (await clockIn.json()) as { id: string };

    const duplicate = await app.request("/api/shifts/clock-in", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ venue_id: fixture.venueId }),
    });
    expect(duplicate.status).toBe(409);

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
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

    const payment = await app.request("/api/payments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        method: "cash",
        amount_minor: 1000,
        idempotency_key: "shift-cash-001",
      }),
    });
    expect(payment.status).toBe(201);

    const clockOut = await app.request(`/api/shifts/${shift.id}/clock-out`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ counted_cash_minor: 11000 }),
    });
    expect(clockOut.status).toBe(200);

    const reportResponse = await app.request(`/api/shifts/${shift.id}/report`, {
      headers: { cookie },
    });
    expect(reportResponse.status).toBe(200);
    const report = (await reportResponse.json()) as {
      sales: { orders: number };
      cash: { expected_minor: number; variance_minor: number };
    };
    expect(report.sales.orders).toBe(1);
    expect(report.cash.expected_minor).toBe(1000);
    expect(report.cash.variance_minor).toBe(10000);

    const csv = await app.request(`/api/shifts/${shift.id}/export`, {
      headers: { cookie },
    });
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("cash");
  });

  it("depletes stock on sale and restores it on void", async () => {
    const db = await makeDb();
    const fixture = await addTenant(db, "Alpha");
    const menu = await addMenu(db, fixture);
    const app = appFor(db);
    const { cookie } = await login(app, fixture);

    const stockResponse = await app.request("/api/stock", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        name: "Beef",
        unit: "g",
        quantity: 10,
        par_level: 5,
      }),
    });
    expect(stockResponse.status).toBe(201);
    const stock = (await stockResponse.json()) as { id: string };

    const recipe = await app.request("/api/recipes", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        menu_item_id: menu.itemId,
        stock_item_id: stock.id,
        quantity: 2,
      }),
    });
    expect(recipe.status).toBe(201);

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

    const afterSale = await app.request(
      `/api/stock?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    const items = (await afterSale.json()) as Array<{
      id: string;
      quantity: number;
    }>;
    expect(items.find((item) => item.id === stock.id)?.quantity).toBe(6);

    const voided = await app.request(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "voided", reason: "Customer cancelled" }),
    });
    expect(voided.status).toBe(200);

    const afterVoid = await app.request(
      `/api/stock?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    const restored = (await afterVoid.json()) as Array<{
      id: string;
      quantity: number;
    }>;
    expect(restored.find((item) => item.id === stock.id)?.quantity).toBe(10);

    const counted = await app.request(`/api/stock/${stock.id}/count`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ counted_quantity: 4, reason: "Weekly count" }),
    });
    expect(counted.status).toBe(200);
    await expect(counted.json()).resolves.toMatchObject({ quantity: 4 });

    const alerts = await app.request(
      `/api/stock/alerts?venue_id=${fixture.venueId}`,
      { headers: { cookie } },
    );
    const alertRows = (await alerts.json()) as Array<{ id: string }>;
    expect(alertRows).toHaveLength(1);
    expect(alertRows[0]?.id).toBe(stock.id);

    const supplier = await app.request("/api/suppliers", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: fixture.venueId,
        name: "Nairobi Meats",
        phone: "0712345678",
      }),
    });
    expect(supplier.status).toBe(201);
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
