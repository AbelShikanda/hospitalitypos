import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const DEFAULT_COST = 16384;

export function isPinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string, salt = randomBytes(SALT_BYTES)): string {
  const derived = scryptSync(pin, salt, KEY_LENGTH, { N: DEFAULT_COST });
  return [
    "scrypt",
    DEFAULT_COST,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, costRaw, saltRaw, hashRaw] = stored.split("$");
  if (scheme !== "scrypt" || !costRaw || !saltRaw || !hashRaw) return false;

  const cost = Number(costRaw);
  if (!Number.isInteger(cost) || cost <= 0) return false;

  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(hashRaw, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(pin, salt, expected.length, { N: cost });
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}
