export const KES = { currency: "KES", minorPerMajor: 100 } as const;

export function toMinor(amount: number): number {
  return Math.round(amount * KES.minorPerMajor);
}

export function fromMinor(minor: number): number {
  return minor / KES.minorPerMajor;
}

export function formatKES(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  const major = Math.floor(absolute / KES.minorPerMajor);
  const cents = absolute % KES.minorPerMajor;
  return `${sign}KES ${major.toLocaleString("en-KE")}.${String(cents).padStart(2, "0")}`;
}

export function addVAT(
  netMinor: number,
  rate = 16,
): { net: number; vat: number; gross: number } {
  const vat = Math.round((netMinor * rate) / 100);
  return { net: netMinor, vat, gross: netMinor + vat };
}

export function extractVAT(
  grossMinor: number,
  rate = 16,
): { net: number; vat: number; gross: number } {
  const net = Math.round(grossMinor / (1 + rate / 100));
  return { net, vat: grossMinor - net, gross: grossMinor };
}

export function applyDiscount(minor: number, percent: number): number {
  return minor - Math.round((minor * percent) / 100);
}

export function splitEvenly(totalMinor: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error("parts must be a positive integer");
  }
  const base = Math.trunc(totalMinor / parts);
  const remainder = totalMinor - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}
