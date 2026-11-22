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
      headers: { cookie: ownerLogin.cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "New Venue" }),
    });

    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      tenant_id: owner.tenantId,
      name: "New Venue",
    });
  });
});
