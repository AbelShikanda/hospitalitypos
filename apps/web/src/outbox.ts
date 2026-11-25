export interface OutboxItem {
  id: string;
  url: string;
  method: "POST";
  body: unknown;
  attempts: number;
  createdAt: string;
}

export interface OutboxFailure {
  id: string;
  url: string;
  status: number;
  error: string;
  at: string;
}

const STORAGE_KEY = "hpos.outbox.v1";
const listeners = new Set<(count: number) => void>();
const failureListeners = new Set<(failure: OutboxFailure | null) => void>();
let flushing: Promise<void> | null = null;
let lastFailure: OutboxFailure | null = null;

function read(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function notify(count: number) {
  for (const listener of listeners) listener(count);
}

function write(items: OutboxItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notify(items.length);
}

function setFailure(failure: OutboxFailure | null) {
  lastFailure = failure;
  for (const listener of failureListeners) listener(failure);
}

export function getOutboxCount(): number {
  return read().length;
}

export function getOutboxFailure(): OutboxFailure | null {
  return lastFailure;
}

export function dismissOutboxFailure(): void {
  setFailure(null);
}

export function subscribeOutbox(listener: (count: number) => void) {
  listeners.add(listener);
  listener(read().length);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeOutboxFailures(
  listener: (failure: OutboxFailure | null) => void,
) {
  failureListeners.add(listener);
  listener(lastFailure);
  return () => {
    failureListeners.delete(listener);
  };
}

export function enqueueOutbox(input: { url: string; body: unknown }): string {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    url: input.url,
    method: "POST",
    body: input.body,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  write([...read(), item]);
  void flushOutbox();
  return item.id;
}

export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = runFlush().finally(() => {
    flushing = null;
    notify(read().length);
  });
  return flushing;
}

async function runFlush(): Promise<void> {
  for (;;) {
    const item = read()[0];
    if (!item) break;

    let response: Response;
    try {
      response = await fetch(item.url, {
        method: item.method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.body),
      });
    } catch {
      bumpAttempt(item.id);
      break;
    }

    if (response.ok) {
      write(read().filter((entry) => entry.id !== item.id));
      continue;
    }

    let code = `request_failed_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      code = `request_failed_${response.status}`;
    }

    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429
    ) {
      write(read().filter((entry) => entry.id !== item.id));
      setFailure({
        id: item.id,
        url: item.url,
        status: response.status,
        error: code.replaceAll("_", " "),
        at: new Date().toISOString(),
      });
      continue;
    }

    bumpAttempt(item.id);
    break;
  }
}

function bumpAttempt(id: string): void {
  const updated = read().map((entry) =>
    entry.id === id ? { ...entry, attempts: entry.attempts + 1 } : entry,
  );
  write(updated);
}
