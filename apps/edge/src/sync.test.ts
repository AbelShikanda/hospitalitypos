import { createDb, migrate } from "@hpos/db";
import { newId } from "@hpos/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordOutbox, runEdgeSync } from "./sync.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("edge sync resilience", () => {
  it("keeps events queued when the cloud is unavailable", async () => {
    const db = createDb({ dialect: "sqlite", url: ":memory:" });
    await migrate(db);
    const tenantId = newId();
    const venueId = newId();
    const now = new Date().toISOString();
    await db
      .insertInto("tenants")
      .values({ id: tenantId, name: "Demo", created_at: now })
      .execute();
    await db
      .insertInto("venues")
      .values({
        id: venueId,
        tenant_id: tenantId,
        name: "Main",
        created_at: now,
      })
      .execute();

    await recordOutbox(db, {
      tenantId,
      venueId,
      entity: "order",
      entityId: newId(),
      op: "created",
      payload: { total_minor: 1000 },
      idempotencyKey: "chaos-order-1",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    await runEdgeSync(db, {
      url: "https://cloud.test",
      token: "token",
      tenantId,
      venueId,
      version: "test",
      schemaVersion: 14,
    });

    const pending = await db
      .selectFrom("outbox_events")
      .selectAll()
      .where("synced_at", "is", null)
      .execute();
    expect(pending).toHaveLength(1);
  });

  it("marks events synced after a successful replay", async () => {
    const db = createDb({ dialect: "sqlite", url: ":memory:" });
    await migrate(db);
    const tenantId = newId();
    const venueId = newId();
    const now = new Date().toISOString();
    await db
      .insertInto("tenants")
      .values({ id: tenantId, name: "Demo", created_at: now })
      .execute();
    await db
      .insertInto("venues")
      .values({
        id: venueId,
        tenant_id: tenantId,
        name: "Main",
        created_at: now,
      })
      .execute();

    await recordOutbox(db, {
      tenantId,
      venueId,
      entity: "payment",
      entityId: newId(),
      op: "created",
      payload: { amount_minor: 1000 },
      idempotencyKey: "chaos-payment-1",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/sync/pull")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, status: 200 };
      }),
    );

    await runEdgeSync(db, {
      url: "https://cloud.test",
      token: "token",
      tenantId,
      venueId,
      version: "test",
      schemaVersion: 14,
    });

    const pending = await db
      .selectFrom("outbox_events")
      .selectAll()
      .where("synced_at", "is", null)
      .execute();
    expect(pending).toHaveLength(0);
  });
});
