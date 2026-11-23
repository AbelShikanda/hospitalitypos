import { describe, expect, it } from "vitest";
import { billTotals } from "./bill.js";
import { drawerKickCommand, formatReceiptText, receiptEscPos } from "./receipt.js";

const bill = billTotals([{ id: "a", totalMinor: 116000, taxRate: 16 }]);

describe("receipt formatting", () => {
  it("renders totals and VAT in the text receipt", () => {
    const text = formatReceiptText({
      venueName: "Demo Hospitality",
      orderNumber: "#0001",
      table: "T1",
      lines: [{ name: "Nyama Choma", quantity: 1, totalMinor: 116000 }],
      bill,
    });
    expect(text).toContain("Demo Hospitality");
    expect(text).toContain("VAT");
    expect(text).toContain("KES 1,160.00");
    expect(text).toContain("PAYABLE");
  });

  it("emits ESC/POS init and cut commands", () => {
    const bytes = receiptEscPos({
      venueName: "Demo",
      orderNumber: "#0001",
      lines: [],
      bill,
    });
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("emits a cash drawer pulse", () => {
    expect(Array.from(drawerKickCommand())).toEqual([
      0x1b, 0x70, 0x00, 0x19, 0xfa,
    ]);
  });
});
