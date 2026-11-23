import { describe, expect, it } from "vitest";
import {
  assertPaymentTransition,
  canPaymentTransition,
  changeMinor,
  isCard,
  isMpesa,
  isOfflineCapable,
  outstandingMinor,
  paidMinor,
  requiresProviderReference,
} from "./payment.js";

describe("payment state machine", () => {
  it("allows the happy path and reversal", () => {
    expect(canPaymentTransition("pending", "confirmed")).toBe(true);
    expect(canPaymentTransition("confirmed", "reversed")).toBe(true);
  });

  it("allows failure and cancellation before confirmation", () => {
    expect(canPaymentTransition("pending", "failed")).toBe(true);
    expect(canPaymentTransition("pending", "cancelled")).toBe(true);
  });

  it("rejects transitions from terminal states", () => {
    expect(canPaymentTransition("failed", "confirmed")).toBe(false);
    expect(canPaymentTransition("cancelled", "confirmed")).toBe(false);
    expect(canPaymentTransition("reversed", "confirmed")).toBe(false);
    expect(() => assertPaymentTransition("confirmed", "pending")).toThrow(
      "Invalid payment transition",
    );
  });
});

describe("payment method helpers", () => {
  it("classifies M-Pesa methods", () => {
    expect(isMpesa("mpesa_manual")).toBe(true);
    expect(isMpesa("mpesa_stk")).toBe(true);
    expect(isMpesa("cash")).toBe(false);
  });

  it("classifies the PDQ card method", () => {
    expect(isCard("pdq_card")).toBe(true);
    expect(isCard("mpesa_stk")).toBe(false);
  });

  it("requires a provider reference for everything except cash", () => {
    expect(requiresProviderReference("cash")).toBe(false);
    expect(requiresProviderReference("mpesa_manual")).toBe(true);
    expect(requiresProviderReference("mpesa_stk")).toBe(true);
    expect(requiresProviderReference("pdq_card")).toBe(true);
  });

  it("keeps every method except STK offline-capable", () => {
    expect(isOfflineCapable("cash")).toBe(true);
    expect(isOfflineCapable("mpesa_manual")).toBe(true);
    expect(isOfflineCapable("pdq_card")).toBe(true);
    expect(isOfflineCapable("mpesa_stk")).toBe(false);
  });
});

describe("payment amounts", () => {
  const payments = [
    { status: "confirmed" as const, amount_minor: 50000 },
    { status: "pending" as const, amount_minor: 20000 },
    { status: "reversed" as const, amount_minor: 10000 },
  ];

  it("counts only confirmed payments", () => {
    expect(paidMinor(payments)).toBe(50000);
  });

  it("computes outstanding without going negative", () => {
    expect(outstandingMinor(120000, payments)).toBe(70000);
    expect(outstandingMinor(30000, payments)).toBe(0);
  });

  it("computes cash change", () => {
    expect(changeMinor(100000, 72500)).toBe(27500);
  });
});
