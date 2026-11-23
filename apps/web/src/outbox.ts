export interface OutboxItem {
  id: string;
  url: string;
  method: "POST";
  body: unknown;
  attempts: number;
  createdAt: string;
}

const STORAGE_KEY = "hpos.outbox.v1";
const listeners = new Set<(count: number) => void>();
let flushing = false;

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

export function getOutboxCount(): number {
  return read().length;
}

export function subscribeOutbox(listener: (count: number) => void) {
  listeners.add(listener);
  listener(read().length);
  return () => {
    listeners.delete(listener);
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

export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    const queue = read();
    for (const item of queue) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item.body),
        });
        if (!response.ok) throw new Error(`outbox request failed: ${response.status}`);
        write(read().filter((entry) => entry.id !== item.id));
      } catch {
        const current = read();
        const updated = current.map((entry) =>
          entry.id === item.id
            ? { ...entry, attempts: entry.attempts + 1 }
            : entry,
        );
        write(updated);
        break;
      }
    }
  } finally {
    flushing = false;
    notify(read().length);
  }
}
