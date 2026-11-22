import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS,
  createSessionToken,
  hashSessionToken,
  isExpired,
  sessionExpiry,
} from "./session.js";

describe("session tokens", () => {
  it("creates unique, URL-safe tokens", () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes deterministically without storing the raw token", () => {
    const token = createSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("expires after the TTL", () => {
    const now = Date.parse("2026-11-22T10:00:00.000Z");
    const expiresAt = sessionExpiry(now);
    expect(Date.parse(expiresAt) - now).toBe(SESSION_TTL_MS);
    expect(isExpired(expiresAt, now + 1)).toBe(false);
    expect(isExpired(expiresAt, now + SESSION_TTL_MS)).toBe(true);
  });
});
