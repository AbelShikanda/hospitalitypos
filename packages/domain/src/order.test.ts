import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  lineTotalMinor,
  orderTotals,
} from "./order.js";

describe("order state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransition("open", "sent")).toBe(true);
    expect(canTransition("sent", "preparing")).toBe(true);
    expect(canTransition("ready", "served")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("closed", "open")).toBe(false);
    expect(() => assertTransition("voided", "sent")).toThrow();
  });
});

describe("order pricing", () => {
  it("computes a line total with modifiers", () => {
    expect(lineTotalMinor(45000, 2, 5000)).toBe(100000);
  });

  it("rejects non-positive quantities", () => {
    expect(() => lineTotalMinor(1000, 0)).toThrow();
    expect(() => lineTotalMinor(1000, 1.5)).toThrow();
  });

  it("extracts VAT from VAT-inclusive line totals", () => {
    const totals = orderTotals([
      { totalMinor: 116000, taxRate: 16 },
      { totalMinor: 58000, taxRate: 16 },
    ]);
    expect(totals.totalMinor).toBe(174000);
    expect(totals.taxMinor).toBe(24000);
    expect(totals.subtotalMinor).toBe(150000);
  });
});
