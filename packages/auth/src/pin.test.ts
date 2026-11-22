import { describe, expect, it } from "vitest";
import { hashPin, isPinFormat, verifyPin } from "./pin.js";

describe("PIN hashing", () => {
  it("verifies the correct PIN", () => {
    const hash = hashPin("1234");
    expect(verifyPin("1234", hash)).toBe(true);
  });

  it("rejects the wrong PIN", () => {
    const hash = hashPin("1234");
    expect(verifyPin("4321", hash)).toBe(false);
  });

  it("uses a fresh salt for every hash", () => {
    expect(hashPin("1234")).not.toBe(hashPin("1234"));
  });

  it("rejects malformed hashes instead of throwing", () => {
    expect(verifyPin("1234", "demo-pin-hash")).toBe(false);
    expect(verifyPin("1234", "")).toBe(false);
  });

  it("accepts 4-8 digit PINs only", () => {
    expect(isPinFormat("1234")).toBe(true);
    expect(isPinFormat("12345678")).toBe(true);
    expect(isPinFormat("123")).toBe(false);
    expect(isPinFormat("123456789")).toBe(false);
    expect(isPinFormat("abcd")).toBe(false);
  });
});
