export const PAYMENT_METHODS = [
  "cash",
  "mpesa_manual",
  "mpesa_stk",
  "pdq_card",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATES = [
  "pending",
  "confirmed",
  "failed",
  "cancelled",
  "reversed",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PDQ_MODES = [
  "integrated",
  "semi_integrated",
  "standalone",
] as const;

export type PdqMode = (typeof PDQ_MODES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa_manual: "M-Pesa (manual)",
  mpesa_stk: "M-Pesa STK",
  pdq_card: "PDQ card",
};

const transitions: Record<PaymentState, readonly PaymentState[]> = {
  pending: ["confirmed", "failed", "cancelled"],
  confirmed: ["reversed"],
  failed: [],
  cancelled: [],
  reversed: [],
};

export function canPaymentTransition(from: PaymentState, to: PaymentState): boolean {
  return transitions[from].includes(to);
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canPaymentTransition(from, to)) {
    throw new Error(`Invalid payment transition: ${from} -> ${to}`);
  }
}

export function isMpesa(method: PaymentMethod): boolean {
  return method === "mpesa_manual" || method === "mpesa_stk";
}

export function isCard(method: PaymentMethod): boolean {
  return method === "pdq_card";
}

export function requiresProviderReference(method: PaymentMethod): boolean {
  return method !== "cash";
}

export function isOfflineCapable(method: PaymentMethod): boolean {
  return method !== "mpesa_stk";
}
