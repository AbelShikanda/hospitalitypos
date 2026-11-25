import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const fetchMock = vi.fn();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
});
vi.stubGlobal("crypto", { randomUUID: () => `id-${Math.random()}` });
vi.stubGlobal("fetch", fetchMock);

const {
  enqueueOutbox,
  flushOutbox,
  getOutboxCount,
  getOutboxFailure,
  dismissOutboxFailure,
} = await import("./outbox.js");

describe("web outbox", () => {
  beforeEach(() => {
    store.clear();
    fetchMock.mockReset();
    dismissOutboxFailure();
  });

  it("queues a mutation and removes it after a successful replay", async () => {
    const deferred: { resolve?: () => void } = {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = () => resolve({ ok: true, status: 201 });
        }),
    );

    enqueueOutbox({ url: "/api/orders", body: { id: "order-1" } });
    expect(getOutboxCount()).toBe(1);

    deferred.resolve?.();
    await vi.waitFor(() => expect(getOutboxCount()).toBe(0));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps a transient server failure queued for retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    enqueueOutbox({ url: "/api/orders", body: { id: "order-2" } });
    await flushOutbox();

    expect(getOutboxCount()).toBe(1);
    expect(getOutboxFailure()).toBeNull();
  });

  it("drops a permanent failure and reports it instead of blocking the queue", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "overpayment" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 201 });

    enqueueOutbox({ url: "/api/payments", body: { id: "payment-1" } });
    enqueueOutbox({ url: "/api/orders", body: { id: "order-3" } });
    await flushOutbox();

    expect(getOutboxCount()).toBe(0);
    expect(getOutboxFailure()).toMatchObject({
      status: 409,
      error: "overpayment",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits for the in-flight flush instead of returning early", async () => {
    let release: (() => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 201 });
        }),
    );

    enqueueOutbox({ url: "/api/orders", body: { id: "order-4" } });
    const pending = flushOutbox();
    release?.();
    await pending;

    expect(getOutboxCount()).toBe(0);
  });
});
