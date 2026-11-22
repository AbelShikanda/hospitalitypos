import { extractVAT } from "./money.js";

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

export interface OrderLineTotalInput {
  totalMinor: number;
  taxRate?: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function lineTotalMinor(
  unitPriceMinor: number,
  quantity: number,
  modifierDeltaMinor = 0,
): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }
  return (unitPriceMinor + modifierDeltaMinor) * quantity;
}

export function orderTotals(
  lines: readonly OrderLineTotalInput[],
): OrderTotals {
  let subtotalMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;

  for (const line of lines) {
    const { net, vat, gross } = extractVAT(line.totalMinor, line.taxRate ?? 16);
    subtotalMinor += net;
    taxMinor += vat;
    totalMinor += gross;
  }

  return { subtotalMinor, taxMinor, totalMinor };
}
