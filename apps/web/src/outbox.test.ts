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

const { enqueueOutbox, flushOutbox, getOutboxCount } = await import(
  "./outbox.js"
);

describe("web outbox", () => {
  beforeEach(() => {
    store.clear();
    fetchMock.mockReset();
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

  it("keeps a failed mutation queued for retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    enqueueOutbox({ url: "/api/orders", body: { id: "order-2" } });
    await flushOutbox();

    expect(getOutboxCount()).toBe(1);
  });
});
