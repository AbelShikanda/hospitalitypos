import {
  SESSION_COOKIE,
  hashSessionToken,
  isExpired,
  normalizeRole,
  type Role,
} from "@hpos/auth";
import type { Db } from "@hpos/db";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

export interface AuthContext {
  tenantId: string;
  userId: string;
  name: string;
  role: Role;
  sessionId: string;
  expiresAt: string;
}

export interface AppEnv {
  Variables: { auth: AuthContext };
}

export function getSessionToken(context: Context): string | undefined {
  const header = context.req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return getCookie(context, SESSION_COOKIE);
}

export function setSessionCookie(
  context: Context,
  token: string,
  expiresAt: string,
): void {
  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(context: Context): void {
  deleteCookie(context, SESSION_COOKIE, { path: "/" });
}

export function requireAuth(db: Db) {
  return createMiddleware<AppEnv>(async (context, next) => {
    const token = getSessionToken(context);
    if (!token) return context.json({ error: "unauthorized" }, 401);

    const session = await db
      .selectFrom("sessions")
      .selectAll()
      .where("token_hash", "=", hashSessionToken(token))
      .executeTakeFirst();

    if (!session || session.revoked_at || isExpired(session.expires_at)) {
      return context.json({ error: "unauthorized" }, 401);
    }

    const user = await db
      .selectFrom("users")
      .select(["id", "name", "tenant_id"])
      .where("id", "=", session.user_id)
      .where("tenant_id", "=", session.tenant_id)
      .executeTakeFirst();

    if (!user) return context.json({ error: "unauthorized" }, 401);

    const membership = await db
      .selectFrom("memberships")
      .select("role")
      .where("user_id", "=", user.id)
      .where("tenant_id", "=", user.tenant_id)
      .executeTakeFirst();

    const role = membership ? normalizeRole(membership.role) : null;
    if (!role) return context.json({ error: "forbidden" }, 403);

    context.set("auth", {
      tenantId: user.tenant_id,
      userId: user.id,
      name: user.name,
      role,
      sessionId: session.id,
      expiresAt: session.expires_at,
    });

    await next();
  });
}

export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (context, next) => {
    const auth = context.get("auth");
    if (!auth || !roles.includes(auth.role)) {
      return context.json({ error: "forbidden" }, 403);
    }
    await next();
  });
}
