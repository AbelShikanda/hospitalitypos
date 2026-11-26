import { clockInSchema, clockOutSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { newId } from "@hpos/domain";
import type { Hono } from "hono";
import { normalizeRole } from "@hpos/auth";
import { requireAuth, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";
import { getVenueSettings } from "./settings.js";

const CASH_ROLES = ["owner", "manager", "cashier"];
const SHIFT_VIEW_ROLES = ["owner", "manager", "cashier"];

function toShift(row: {
  id: string;
  venue_id: string;
  user_id: string;
  status: string;
  starting_cash_minor: number;
  counted_cash_minor: number | null;
  notes: string | null;
  clock_in_notes: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
}) {
  return {
    id: row.id,
    venue_id: row.venue_id,
    user_id: row.user_id,
    status: row.status,
    starting_cash_minor: row.starting_cash_minor,
    counted_cash_minor: row.counted_cash_minor,
    notes: row.notes,
    clock_in_notes: row.clock_in_notes,
    clock_in_at: row.clock_in_at,
    clock_out_at: row.clock_out_at,
  };
}

export function registerShiftRoutes(app: Hono<AppEnv>, db: Db) {
  app.post("/api/shifts/clock-in", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = clockInSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    if (auth.role === "owner") {
      return context.json({ error: "owners_do_not_clock_in" }, 403);
    }
    const venue = await resolveVenue(db, auth.tenantId, parsed.data.venue_id);
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const active = await db
      .selectFrom("shifts")
      .select("id")
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .where("user_id", "=", auth.userId)
      .where("status", "=", "open")
      .executeTakeFirst();
    if (active) return context.json({ error: "shift_active" }, 409);

    const now = new Date().toISOString();
    const shift = {
      id: newId(),
      tenant_id: auth.tenantId,
      venue_id: venue.id,
      user_id: auth.userId,
      status: "open",
      starting_cash_minor: CASH_ROLES.includes(auth.role)
        ? parsed.data.starting_cash_minor
        : 0,
      counted_cash_minor: null,
      notes: null,
      clock_in_notes: parsed.data.notes ?? null,
      opened_by: auth.userId,
      closed_by: null,
      clock_in_at: now,
      clock_out_at: null,
      created_at: now,
      updated_at: now,
    };
    await db.insertInto("shifts").values(shift).execute();
    return context.json(toShift(shift), 201);
  });

  app.get("/api/shifts/active", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    const shift = await db
      .selectFrom("shifts")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id)
      .where("user_id", "=", auth.userId)
      .where("status", "=", "open")
      .executeTakeFirst();
    return context.json(shift ? toShift(shift) : null);
  });

  app.get("/api/shifts", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);

    let query = db
      .selectFrom("shifts")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", venue.id);
    if (!SHIFT_VIEW_ROLES.includes(auth.role)) {
      query = query.where("user_id", "=", auth.userId);
    }
    const shifts = await query.orderBy("clock_in_at", "desc").execute();
    return context.json(shifts.map(toShift));
  });

  app.post("/api/shifts/:id/clock-out", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = clockOutSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    if (auth.role === "owner") {
      return context.json({ error: "owners_do_not_clock_out" }, 403);
    }
    const shift = await db
      .selectFrom("shifts")
      .selectAll()
      .where("id", "=", context.req.param("id"))
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirst();
    if (!shift) return context.json({ error: "shift_not_found" }, 404);
    if (
      shift.user_id !== auth.userId &&
      !["owner", "manager"].includes(auth.role)
    ) {
      return context.json({ error: "forbidden" }, 403);
    }
    if (shift.status !== "open") {
      return context.json({ error: "shift_closed" }, 409);
    }

    const now = new Date().toISOString();
    const countedCashMinor = CASH_ROLES.includes(auth.role)
      ? parsed.data.counted_cash_minor
      : 0;
    await db
      .updateTable("shifts")
      .set({
        status: "closed",
        counted_cash_minor: countedCashMinor,
        notes: parsed.data.notes ?? null,
        closed_by: auth.userId,
        clock_out_at: now,
        updated_at: now,
      })
      .where("id", "=", shift.id)
      .where("tenant_id", "=", auth.tenantId)
      .execute();

    return context.json({
      ...toShift(shift),
      status: "closed",
      counted_cash_minor: countedCashMinor,
      notes: parsed.data.notes ?? null,
      closed_by: auth.userId,
      clock_out_at: now,
      updated_at: now,
    });
  });

  app.get("/api/shifts/:id/report", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const shift = await db
      .selectFrom("shifts")
      .selectAll()
      .where("id", "=", context.req.param("id"))
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirst();
    if (!shift) return context.json({ error: "shift_not_found" }, 404);
    if (
      !SHIFT_VIEW_ROLES.includes(auth.role) &&
      shift.user_id !== auth.userId
    ) {
      return context.json({ error: "forbidden" }, 403);
    }

    const upper = shift.clock_out_at ?? new Date().toISOString();
    const orders = await db
      .selectFrom("orders")
      .select(["total_minor", "discount_minor"])
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", shift.venue_id)
      .where("opened_by", "=", shift.user_id)
      .where("status", "!=", "voided")
      .where("created_at", ">=", shift.clock_in_at)
      .where("created_at", "<=", upper)
      .execute();

    const payments = await db
      .selectFrom("payments")
      .select(["method", "status", "amount_minor"])
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", shift.venue_id)
      .where("created_by", "=", shift.user_id)
      .where("created_at", ">=", shift.clock_in_at)
      .where("created_at", "<=", upper)
      .execute();

    const methods = ["cash", "mpesa_manual", "mpesa_stk", "pdq_card"] as const;
    const paymentMix = methods.map((method) => ({
      method,
      minor: payments
        .filter(
          (payment) =>
            payment.method === method && payment.status === "confirmed",
        )
        .reduce((sum, payment) => sum + payment.amount_minor, 0),
    }));

    const expectedCash = paymentMix.find((row) => row.method === "cash")?.minor ?? 0;
    const counted = shift.counted_cash_minor ?? expectedCash;
    const grossMinor = orders.reduce((sum, order) => sum + order.total_minor, 0);
    const discountsMinor = orders.reduce(
      (sum, order) => sum + order.discount_minor,
      0,
    );
    const netMinor = Math.max(0, grossMinor - discountsMinor);
    const settings = await getVenueSettings(db, auth.tenantId, shift.venue_id);
    const membership = await db
      .selectFrom("memberships")
      .select("role")
      .where("tenant_id", "=", auth.tenantId)
      .where("user_id", "=", shift.user_id)
      .executeTakeFirst();
    const staffRole = membership ? normalizeRole(membership.role) : null;
    const eligible = settings.tip_enabled && staffRole === "waiter";
    const staffTipMinor = eligible
      ? Math.round(
          Math.max(0, netMinor - settings.tip_threshold_minor) *
            (settings.tip_percent / 100),
        )
      : 0;

    return context.json({
      shift: toShift(shift),
      sales: {
        orders: orders.length,
        gross_minor: grossMinor,
        discounts_minor: discountsMinor,
        net_minor: netMinor,
      },
      payment_mix: paymentMix,
      cash: {
        starting_minor: shift.starting_cash_minor,
        expected_minor: expectedCash,
        counted_minor: counted,
        variance_minor: counted - expectedCash,
      },
      tips: {
        enabled: settings.tip_enabled,
        eligible,
        threshold_minor: settings.tip_threshold_minor,
        percent: settings.tip_percent,
        staff_tip_minor: staffTipMinor,
      },
    });
  });

  app.get("/api/shifts/:id/export", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const shift = await db
      .selectFrom("shifts")
      .selectAll()
      .where("id", "=", context.req.param("id"))
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirst();
    if (!shift) return context.json({ error: "shift_not_found" }, 404);
    if (
      !SHIFT_VIEW_ROLES.includes(auth.role) &&
      shift.user_id !== auth.userId
    ) {
      return context.json({ error: "forbidden" }, 403);
    }

    const upper = shift.clock_out_at ?? new Date().toISOString();
    const payments = await db
      .selectFrom("payments")
      .select(["method", "status", "amount_minor", "provider_ref", "created_at"])
      .where("tenant_id", "=", auth.tenantId)
      .where("venue_id", "=", shift.venue_id)
      .where("created_by", "=", shift.user_id)
      .where("created_at", ">=", shift.clock_in_at)
      .where("created_at", "<=", upper)
      .orderBy("created_at")
      .execute();

    const rows = [
      "created_at,method,status,amount_minor,provider_ref",
      ...payments.map((payment) =>
        [
          payment.created_at,
          payment.method,
          payment.status,
          payment.amount_minor,
          payment.provider_ref ?? "",
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    context.header("Content-Type", "text/csv; charset=utf-8");
    context.header(
      "Content-Disposition",
      `attachment; filename="shift-${shift.id}.csv"`,
    );
    return context.body(rows.join("\n"));
  });
}
