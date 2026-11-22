import { describe, expect, it } from "vitest";
import {
  assertPaymentTransition,
  canPaymentTransition,
  isCard,
  isMpesa,
  isOfflineCapable,
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
