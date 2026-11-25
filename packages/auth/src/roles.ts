export const ROLES = [
  "owner",
  "manager",
  "cashier",
  "waiter",
  "kitchen",
  "housekeeping",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: string): Role | null {
  const role = value.toLowerCase();
  return isRole(role) ? role : null;
}

export const MANAGEMENT_ROLES: readonly Role[] = ["owner", "manager"];

export function canManageVenues(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}
