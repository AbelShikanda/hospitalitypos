import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "hpos_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now = Date.now()): string {
  return new Date(now + SESSION_TTL_MS).toISOString();
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}
