import { billTotals, type BillTotals } from "./bill.js";
import { formatKES } from "./money.js";

export interface ReceiptLineInput {
  name: string;
  quantity: number;
  totalMinor: number;
  modifiers?: readonly string[];
}

export interface ReceiptInput {
  venueName: string;
  orderNumber: string;
  table?: string | null;
  lines: readonly ReceiptLineInput[];
  bill: BillTotals;
  servedBy?: string | null;
  footer?: string;
}

function fit(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

function center(text: string, width: number): string {
  const size = Math.max(0, width - text.length);
  const left = Math.floor(size / 2);
  return " ".repeat(left) + text + " ".repeat(size - left);
}

function row(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${" ".repeat(gap)}${right}`;
}

export function formatReceiptText(input: ReceiptInput, width = 32): string {
  const output: string[] = [
    center(fit(input.venueName, width), width),
    `-`.repeat(width),
    row(input.orderNumber, input.table ?? "Takeaway", width),
  ];

  if (input.servedBy) output.push(row("Served by", fit(input.servedBy, 16), width));
  output.push("-".repeat(width));

  for (const line of input.lines) {
    const label = `${line.quantity}x ${fit(line.name, width - 12)}`;
    output.push(row(label, formatKES(line.totalMinor), width));
    for (const modifier of line.modifiers ?? []) {
      output.push(`  ${fit(modifier, width - 2)}`);
    }
  }

  output.push("-".repeat(width));
  if (input.bill.discountMinor) {
    output.push(row("Discount", `-${formatKES(input.bill.discountMinor)}`, width));
  }
  output.push(row("VAT", formatKES(input.bill.taxMinor), width));
  output.push(row("Total", formatKES(input.bill.totalMinor), width));
  if (input.bill.tipMinor) {
    output.push(row("Tip", formatKES(input.bill.tipMinor), width));
  }
  output.push(row("PAYABLE", formatKES(input.bill.payableMinor), width));
  output.push("-".repeat(width));
  output.push(center(input.footer ?? "Thank you", width));
  return `${output.join("\n")}\n`;
}

export function receiptEscPos(input: ReceiptInput, width = 32): Uint8Array {
  const encoder = new TextEncoder();
  const commands = [
    Uint8Array.of(0x1b, 0x40),
    encoder.encode(formatReceiptText(input, width)),
    Uint8Array.of(0x1d, 0x56, 0x42, 0x00),
  ];
  const length = commands.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of commands) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export function drawerKickCommand(): Uint8Array {
  return Uint8Array.of(0x1b, 0x70, 0x00, 0x19, 0xfa);
}

export function receiptBill(
  lines: readonly ReceiptLineInput[],
  adjustments?: Parameters<typeof billTotals>[1],
): BillTotals {
  return billTotals(
    lines.map((line) => ({
      id: line.name,
      totalMinor: line.totalMinor,
    })),
    adjustments,
  );
}
