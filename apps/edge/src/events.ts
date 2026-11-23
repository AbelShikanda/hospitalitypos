export interface DomainEvent {
  type: string;
  venueId: string;
  stationIds?: Array<string | null>;
  orderId?: string;
  at: string;
}

type Listener = (event: DomainEvent) => void;

const listeners = new Set<Listener>();

export function publishEvent(event: DomainEvent): void {
  for (const listener of listeners) listener(event);
}

export function subscribeEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
