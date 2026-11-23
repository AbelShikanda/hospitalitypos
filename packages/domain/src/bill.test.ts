import { describe, expect, it } from "vitest";
import { billTotals, splitBill, splitBillByShares } from "./bill.js";

const lines = [
  { id: "a", totalMinor: 116000, taxRate: 16 },
  { id: "b", totalMinor: 58000, taxRate: 16 },
];

describe("bill totals", () => {
  it("derives net and VAT from VAT-inclusive lines", () => {
    expect(billTotals(lines)).toEqual({
      grossMinor: 174000,
      discountMinor: 0,
      netMinor: 150000,
      taxMinor: 24000,
      totalMinor: 174000,
      tipMinor: 0,
      payableMinor: 174000,
    });
  });

  it("allocates a fixed discount deterministically", () => {
    expect(billTotals(lines, { discountMinor: 10000 })).toMatchObject({
      discountMinor: 10000,
      totalMinor: 164000,
      payableMinor: 164000,
    });
  });

  it("applies a percentage discount to the gross amount", () => {
    expect(billTotals(lines, { discountPercent: 10 })).toMatchObject({
      discountMinor: 17400,
      netMinor: 135000,
      taxMinor: 21600,
      totalMinor: 156600,
    });
  });

  it("adds an untaxed tip to the payable amount", () => {
    expect(billTotals(lines, { tipMinor: 5000 })).toMatchObject({
      totalMinor: 174000,
      tipMinor: 5000,
      payableMinor: 179000,
    });
  });

  it("caps discounts at the gross amount", () => {
    expect(billTotals(lines, { discountMinor: 999999 }).discountMinor).toBe(
      174000,
    );
  });
});

describe("bill splits", () => {
  it("splits evenly with deterministic remainders", () => {
    expect(splitBill(100, 3)).toEqual([34, 33, 33]);
  });

  it("splits by shares", () => {
    expect(splitBillByShares(100, [1, 2, 1])).toEqual([25, 50, 25]);
  });
});
