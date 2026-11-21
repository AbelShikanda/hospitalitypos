import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./order.js";

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
