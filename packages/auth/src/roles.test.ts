import { describe, expect, it } from "vitest";
import { canManageVenues, isRole, normalizeRole } from "./roles.js";

describe("roles", () => {
  it("normalizes legacy mixed-case roles", () => {
    expect(normalizeRole("Owner")).toBe("owner");
    expect(normalizeRole("CASHIER")).toBe("cashier");
  });

  it("rejects unknown roles", () => {
    expect(normalizeRole("superuser")).toBeNull();
    expect(isRole("owner")).toBe(true);
  });

  it("lets owners and managers manage venues", () => {
    expect(canManageVenues("owner")).toBe(true);
    expect(canManageVenues("manager")).toBe(true);
    expect(canManageVenues("waiter")).toBe(false);
  });
});
