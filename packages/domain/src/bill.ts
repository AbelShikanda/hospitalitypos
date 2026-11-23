import { extractVAT } from "./money.js";
import { splitEvenly } from "./money.js";

export interface BillLineInput {
  id: string;
  totalMinor: number;
  taxRate?: number;
}

export interface BillAdjustments {
  discountMinor?: number;
  discountPercent?: number;
  tipMinor?: number;
}

export interface BillTotals {
  grossMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  tipMinor: number;
  payableMinor: number;
}

function allocateByWeights(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((value, weight) => value + weight, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (total * weight) / sum);
  const allocated = raw.map((value) => Math.floor(value));
  let remainder = total - allocated.reduce((value, part) => value + part, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - allocated[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const entry of order) {
    if (remainder <= 0) break;
    allocated[entry.index]! += 1;
    remainder -= 1;
  }

  return allocated;
}

export function billTotals(
  lines: readonly BillLineInput[],
  adjustments: BillAdjustments = {},
): BillTotals {
  const grossMinor = lines.reduce(
    (sum, line) => sum + line.totalMinor,
    0,
  );
  const requestedDiscount =
    (adjustments.discountMinor ?? 0) +
    Math.round((grossMinor * (adjustments.discountPercent ?? 0)) / 100);
  const discountMinor = Math.max(0, Math.min(grossMinor, requestedDiscount));
  const lineDiscounts = allocateByWeights(
    discountMinor,
    lines.map((line) => line.totalMinor),
  );

  let netMinor = 0;
  let taxMinor = 0;

  lines.forEach((line, index) => {
    const discounted = line.totalMinor - lineDiscounts[index]!;
    const parts = extractVAT(discounted, line.taxRate ?? 16);
    netMinor += parts.net;
    taxMinor += parts.vat;
  });

  const tipMinor = Math.max(0, adjustments.tipMinor ?? 0);
  const totalMinor = netMinor + taxMinor;

  return {
    grossMinor,
    discountMinor,
    netMinor,
    taxMinor,
    totalMinor,
    tipMinor,
    payableMinor: totalMinor + tipMinor,
  };
}

export function splitBill(payableMinor: number, parts: number): number[] {
  return splitEvenly(payableMinor, parts);
}

export function splitBillByShares(
  payableMinor: number,
  shares: readonly number[],
): number[] {
  return allocateByWeights(payableMinor, shares);
}
