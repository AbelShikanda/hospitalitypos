import { createDb, migrate } from "@hpos/db";
import { newId } from "@hpos/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createCloudApp, runCloudJobs } from "./app.js";

const db = createDb({ dialect: "sqlite", url: ":memory:" });

beforeEach(async () => {
  process.env.CLOUD_ADMIN_SECRET = "admin-secret";
  process.env.CRON_SECRET = "cron-secret";
  await migrate(db);
});

describe("cloud control plane", () => {
  it("accepts token-authenticated sync events and exposes reports", async () => {
    const app = createCloudApp({ db, version: "test", dialect: "sqlite" });

    const tenantResponse = await app.request("/api/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Demo Hospitality" }),
    });
    expect(tenantResponse.status).toBe(201);
    const tenant = (await tenantResponse.json()) as { id: string };

    const tokenResponse = await app.request("/api/cloud/tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-secret": "admin-secret",
      },
      body: JSON.stringify({ tenant_id: tenant.id, name: "Edge 1" }),
    });
    expect(tokenResponse.status).toBe(201);
    const token = ((await tokenResponse.json()) as { token: string }).token;

    const venueId = newId();
    const orderId = newId();
    const paymentId = newId();
    const auth = { authorization: `Bearer ${token}` };
    const push = await app.request("/api/sync/push", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            id: newId(),
            tenant_id: tenant.id,
            venue_id: venueId,
            entity: "order",
            entity_id: orderId,
            op: "created",
            payload: JSON.stringify({
              id: orderId,
              total_minor: 115000,
              tax_minor: 15900,
              discount_minor: 0,
              status: "sent",
            }),
            idempotency_key: "order-sync-1",
            created_at: new Date().toISOString(),
          },
          {
            id: newId(),
            tenant_id: tenant.id,
            venue_id: venueId,
            entity: "payment",
            entity_id: paymentId,
            op: "created",
            payload: JSON.stringify({
              id: paymentId,
              amount_minor: 115000,
              tip_minor: 5000,
              status: "confirmed",
              method: "cash",
            }),
            idempotency_key: "payment-sync-1",
            created_at: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(push.status).toBe(200);
    await expect(push.json()).resolves.toMatchObject({ received: 2 });

    const replay = await app.request("/api/sync/push", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ events: [] }),
    });
    expect(replay.status).toBe(200);

    const report = await app.request("/api/cloud/reports", { headers: auth });
    expect(report.status).toBe(200);
    const body = (await report.json()) as {
      summary: { gross_minor: number; captured_minor: number; tips_minor: number };
    };
    expect(body.summary).toMatchObject({
      gross_minor: 115000,
      captured_minor: 115000,
      tips_minor: 5000,
    });

    expect(await runCloudJobs(db)).toBeGreaterThan(0);

    const heartbeat = await app.request("/api/sync/heartbeat", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        venue_id: venueId,
        version: "test",
        schema_version: 14,
        status: "online",
      }),
    });
    expect(heartbeat.status).toBe(200);
  });
});
