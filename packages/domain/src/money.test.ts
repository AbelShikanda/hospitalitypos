import { describe, expect, it } from "vitest";
import {
  addVAT,
  applyDiscount,
  extractVAT,
  formatKES,
  fromMinor,
  splitEvenly,
  toMinor,
} from "./money.js";

describe("money", () => {
  it("converts between major and minor units", () => {
    expect(toMinor(12.34)).toBe(1234);
    expect(fromMinor(1234)).toBe(12.34);
  });

  it("formats KES with thousands separators", () => {
    expect(formatKES(123456)).toBe("KES 1,234.56");
  });

  it("adds and extracts VAT with consistent rounding", () => {
    const added = addVAT(10_000);
    expect(added.vat).toBe(1600);
    expect(added.gross).toBe(11_600);

    const extracted = extractVAT(11_600);
    expect(extracted.net).toBe(10_000);
    expect(extracted.vat).toBe(1600);
  });

  it("applies discounts", () => {
    expect(applyDiscount(10_000, 10)).toBe(9000);
  });

  it("splits deterministically with remainder to the first parts", () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(100, 4)).toEqual([25, 25, 25, 25]);
  });

  it("rejects invalid split counts", () => {
    expect(() => splitEvenly(100, 0)).toThrow();
  });
});
