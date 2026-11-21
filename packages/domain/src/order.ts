export const ORDER_STATES = [
  "open",
  "sent",
  "preparing",
  "ready",
  "served",
  "closed",
  "voided",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

const transitions: Record<OrderState, readonly OrderState[]> = {
  open: ["sent", "voided", "closed"],
  sent: ["preparing", "voided"],
  preparing: ["ready", "voided"],
  ready: ["served", "voided"],
  served: ["closed"],
  closed: [],
  voided: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: OrderState, to: OrderState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid order transition: ${from} -> ${to}`);
  }
}
