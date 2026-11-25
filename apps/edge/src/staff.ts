import { hashPin, normalizeRole, type Role } from "@hpos/auth";
import { createStaffSchema, updateStaffSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";

const PRIVILEGED: Role[] = ["owner", "manager"];

async function listStaff(db: Db, tenantId: string) {
  const rows = await db
    .selectFrom("users")
    .innerJoin("memberships", (join) =>
      join
        .onRef("memberships.user_id", "=", "users.id")
        .onRef("memberships.tenant_id", "=", "users.tenant_id"),
    )
    .select([
      "users.id",
      "users.name",
      "users.is_active",
      "memberships.role",
    ])
    .where("users.tenant_id", "=", tenantId)
    .where("users.is_active", "=", 1)
    .orderBy("users.name")
    .execute();

  return rows.flatMap((row) => {
    const role = normalizeRole(row.role);
    return role
      ? [{ id: row.id, name: row.name, role, is_active: row.is_active === 1 }]
      : [];
  });
}

export function registerStaffRoutes(app: Hono<AppEnv>, db: Db) {
  app.get(
    "/api/staff",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const auth = context.get("auth");
      return context.json(await listStaff(db, auth.tenantId));
    },
  );

  app.post(
    "/api/staff",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = createStaffSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      if (
        auth.role === "manager" &&
        PRIVILEGED.includes(parsed.data.role)
      ) {
        return context.json({ error: "forbidden" }, 403);
      }

      const now = new Date().toISOString();
      const userId = newId();
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("users")
          .values({
            id: userId,
            tenant_id: auth.tenantId,
            name: parsed.data.name,
            pin_hash: hashPin(parsed.data.pin),
            is_active: 1,
            created_at: now,
          })
          .execute();
        await trx
          .insertInto("memberships")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            user_id: userId,
            role: parsed.data.role,
            created_at: now,
          })
          .execute();
      });

      return context.json(
        {
          id: userId,
          name: parsed.data.name,
          role: parsed.data.role,
          is_active: true,
        },
        201,
      );
    },
  );

  app.patch(
    "/api/staff/:id",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = updateStaffSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }
      const auth = context.get("auth");
      const userId = context.req.param("id");
      const target = await db
        .selectFrom("users")
        .innerJoin("memberships", (join) =>
          join
            .onRef("memberships.user_id", "=", "users.id")
            .onRef("memberships.tenant_id", "=", "users.tenant_id"),
        )
        .select([
          "users.id",
          "users.tenant_id",
          "memberships.id as membership_id",
          "memberships.role",
        ])
        .where("users.id", "=", userId)
        .where("users.tenant_id", "=", auth.tenantId)
        .where("users.is_active", "=", 1)
        .executeTakeFirst();
      if (!target) return context.json({ error: "staff_not_found" }, 404);

      const targetRole = normalizeRole(target.role);
      if (!targetRole) return context.json({ error: "forbidden" }, 403);
      if (auth.role === "manager") {
        if (
          PRIVILEGED.includes(targetRole) ||
          (parsed.data.role && PRIVILEGED.includes(parsed.data.role))
        ) {
          return context.json({ error: "forbidden" }, 403);
        }
      }

      const now = new Date().toISOString();
      const nextRole = parsed.data.role ?? targetRole;
      if (
        targetRole === "owner" &&
        nextRole !== "owner" &&
        (await db
          .selectFrom("memberships")
          .select("id")
          .where("tenant_id", "=", auth.tenantId)
          .where("role", "=", "owner")
          .execute()).length <= 1
      ) {
        return context.json({ error: "last_owner" }, 409);
      }

      await db.transaction().execute(async (trx) => {
        if (parsed.data.name !== undefined || parsed.data.pin !== undefined) {
          await trx
            .updateTable("users")
            .set({
              ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
              ...(parsed.data.pin !== undefined
                ? { pin_hash: hashPin(parsed.data.pin) }
                : {}),
            })
            .where("id", "=", target.id)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
        }
        if (parsed.data.role !== undefined) {
          await trx
            .updateTable("memberships")
            .set({ role: parsed.data.role })
            .where("id", "=", target.membership_id)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
        }
        if (parsed.data.pin !== undefined) {
          await trx
            .updateTable("sessions")
            .set({ revoked_at: now })
            .where("tenant_id", "=", auth.tenantId)
            .where("user_id", "=", target.id)
            .execute();
        }
      });

      const current = (await listStaff(db, auth.tenantId)).find(
        (member) => member.id === target.id,
      );
      return context.json(current ?? { error: "staff_not_found" }, current ? 200 : 404);
    },
  );

  app.delete(
    "/api/staff/:id",
    requireAuth(db),
    requireRole("owner"),
    async (context) => {
      const auth = context.get("auth");
      const userId = context.req.param("id");
      if (userId === auth.userId) {
        return context.json({ error: "cannot_delete_self" }, 409);
      }

      const target = await db
        .selectFrom("users")
        .innerJoin("memberships", (join) =>
          join
            .onRef("memberships.user_id", "=", "users.id")
            .onRef("memberships.tenant_id", "=", "users.tenant_id"),
        )
        .select(["users.id", "memberships.role"])
        .where("users.id", "=", userId)
        .where("users.tenant_id", "=", auth.tenantId)
        .where("users.is_active", "=", 1)
        .executeTakeFirst();
      if (!target) return context.json({ error: "staff_not_found" }, 404);

      if (
        target.role === "owner" &&
        (await db
          .selectFrom("memberships")
          .select("id")
          .where("tenant_id", "=", auth.tenantId)
          .where("role", "=", "owner")
          .execute()).length <= 1
      ) {
        return context.json({ error: "last_owner" }, 409);
      }

      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("users")
          .set({ is_active: 0 })
          .where("id", "=", target.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();
        await trx
          .updateTable("sessions")
          .set({ revoked_at: now })
          .where("tenant_id", "=", auth.tenantId)
          .where("user_id", "=", target.id)
          .execute();
      });

      return context.body(null, 204);
    },
  );
}
