import {
  createPaymentSchema,
  reversePaymentSchema,
} from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { assertPaymentTransition, newId, outstandingMinor } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { loadOrder } from "./orders.js";

function toPayment(row: {
  id: string;
  tenant_id: string;
  venue_id: string;
  order_id: string;
  method: string;
  status: string;
  amount_minor: number;
  currency: string;
  idempotency_key: string;
  provider_ref: string | null;
  details: string;
  created_at: string;
  confirmed_at: string | null;
}) {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.details) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") details = parsed;
  } catch {
    details = {};
  }
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    venue_id: row.venue_id,
    order_id: row.order_id,
    method: row.method,
    status: row.status,
    amount_minor: row.amount_minor,
    currency: row.currency,
    idempotency_key: row.idempotency_key,
    provider_ref: row.provider_ref,
    details,
    created_at: row.created_at,
    confirmed_at: row.confirmed_at,
  };
}

function paymentRef(input: {
  method: string;
  mpesa?: { reference?: string; checkout_request_id?: string };
  pdq?: { approval_code?: string; rrn?: string; terminal_id?: string };
}): string | null {
  if (input.method === "mpesa_manual") return input.mpesa?.reference ?? null;
  if (input.method === "mpesa_stk") {
    return input.mpesa?.checkout_request_id ?? null;
  }
  if (input.method === "pdq_card") {
    return (
      input.pdq?.approval_code ??
      input.pdq?.rrn ??
      input.pdq?.terminal_id ??
      null
    );
  }
  return null;
}

function initialStatus(input: {
  method: string;
  pdq?: { approval_code?: string };
}): string {
  if (input.method === "cash") return "confirmed";
  if (input.method === "pdq_card" && input.pdq?.approval_code) {
    return "confirmed";
  }
  return "pending";
}

export function registerPaymentRoutes(app: Hono<AppEnv>, db: Db) {
  app.post("/api/payments", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;

    const existing = await db
      .selectFrom("payments")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId)
      .where("idempotency_key", "=", input.idempotency_key)
      .executeTakeFirst();
    if (existing) return context.json(toPayment(existing), 200);

    const order = await loadOrder(db, auth.tenantId, input.order_id);
    if (!order) return context.json({ error: "order_not_found" }, 404);
    if (order.status === "voided" || order.status === "closed") {
      return context.json({ error: "order_closed" }, 409);
    }

    const existingPayments = await db
      .selectFrom("payments")
      .select(["amount_minor", "status"])
      .where("tenant_id", "=", auth.tenantId)
      .where("order_id", "=", order.id)
      .execute();
    const remaining = outstandingMinor(
      order.total_minor,
      existingPayments.map((payment) => ({
        status: payment.status as "confirmed" | "pending" | "reversed",
        amount_minor: payment.amount_minor,
      })),
    );
    if (input.amount_minor > remaining) {
      return context.json({ error: "overpayment" }, 409);
    }

    const status = initialStatus(input);
    const now = new Date().toISOString();
    const paymentId = newId();
    const details = JSON.stringify({
      ...(input.mpesa ?? {}),
      ...(input.pdq ?? {}),
    });

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("payments")
        .values({
          id: paymentId,
          tenant_id: auth.tenantId,
          venue_id: order.venue_id,
          order_id: order.id,
          method: input.method,
          status,
          amount_minor: input.amount_minor,
          currency: input.currency,
          idempotency_key: input.idempotency_key,
          provider_ref: paymentRef(input),
          details,
          created_by: auth.userId,
          created_at: now,
          updated_at: now,
          confirmed_at: status === "confirmed" ? now : null,
        })
        .execute();

      await trx
        .insertInto("payment_events")
        .values({
          id: newId(),
          tenant_id: auth.tenantId,
          payment_id: paymentId,
          type: "created",
          data: JSON.stringify({ status, amount_minor: input.amount_minor }),
          actor_user_id: auth.userId,
          idempotency_key: null,
          created_at: now,
        })
        .execute();
    });

    const created = await db
      .selectFrom("payments")
      .selectAll()
      .where("id", "=", paymentId)
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirstOrThrow();
    return context.json(toPayment(created), 201);
  });

  app.get("/api/payments", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const orderId = context.req.query("order_id");
    const venueId = context.req.query("venue_id");
    let query = db
      .selectFrom("payments")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId);
    if (orderId) query = query.where("order_id", "=", orderId);
    if (venueId) query = query.where("venue_id", "=", venueId);
    const payments = await query.orderBy("created_at", "desc").execute();
    return context.json(payments.map(toPayment));
  });

  app.post(
    "/api/payments/:id/confirm",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const auth = context.get("auth");
      const payment = await db
        .selectFrom("payments")
        .selectAll()
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!payment) return context.json({ error: "payment_not_found" }, 404);

      try {
        assertPaymentTransition(payment.status as "pending", "confirmed");
      } catch {
        return context.json({ error: "invalid_transition" }, 409);
      }

      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("payments")
          .set({ status: "confirmed", confirmed_at: now, updated_at: now })
          .where("id", "=", payment.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();
        await trx
          .insertInto("payment_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            payment_id: payment.id,
            type: "confirmed",
            data: JSON.stringify({ from: payment.status }),
            actor_user_id: auth.userId,
            idempotency_key: null,
            created_at: now,
          })
          .execute();
      });
      return context.json({
        ...toPayment(payment),
        status: "confirmed",
        confirmed_at: now,
      });
    },
  );

  app.post("/api/payments/:id/cancel", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const payment = await db
      .selectFrom("payments")
      .selectAll()
      .where("id", "=", context.req.param("id"))
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirst();
    if (!payment) return context.json({ error: "payment_not_found" }, 404);

    try {
      assertPaymentTransition(payment.status as "pending", "cancelled");
    } catch {
      return context.json({ error: "invalid_transition" }, 409);
    }

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("payments")
        .set({ status: "cancelled", updated_at: now })
        .where("id", "=", payment.id)
        .where("tenant_id", "=", auth.tenantId)
        .execute();
      await trx
        .insertInto("payment_events")
        .values({
          id: newId(),
          tenant_id: auth.tenantId,
          payment_id: payment.id,
          type: "cancelled",
          data: JSON.stringify({ from: payment.status }),
          actor_user_id: auth.userId,
          idempotency_key: null,
          created_at: now,
        })
        .execute();
    });
    return context.json({ ...toPayment(payment), status: "cancelled" });
  });

  app.post(
    "/api/payments/:id/reverse",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = reversePaymentSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const payment = await db
        .selectFrom("payments")
        .selectAll()
        .where("id", "=", context.req.param("id"))
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!payment) return context.json({ error: "payment_not_found" }, 404);

      try {
        assertPaymentTransition(payment.status as "confirmed", "reversed");
      } catch {
        return context.json({ error: "invalid_transition" }, 409);
      }

      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("payments")
          .set({ status: "reversed", updated_at: now })
          .where("id", "=", payment.id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();
        await trx
          .insertInto("payment_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            payment_id: payment.id,
            type: "reversed",
            data: JSON.stringify({ from: payment.status, reason: parsed.data.reason }),
            actor_user_id: auth.userId,
            idempotency_key: null,
            created_at: now,
          })
          .execute();
      });
      return context.json({ ...toPayment(payment), status: "reversed" });
    },
  );

  app.get("/api/payments/reconciliation", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venueId = context.req.query("venue_id");
    let query = db
      .selectFrom("payments")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId);
    if (venueId) query = query.where("venue_id", "=", venueId);
    const payments = (await query.execute()).map(toPayment);

    const methods = ["cash", "mpesa_manual", "mpesa_stk", "pdq_card"] as const;
    const report = methods.map((method) => {
      const rows = payments.filter((payment) => payment.method === method);
      const captured = rows
        .filter((payment) => payment.status === "confirmed")
        .reduce((sum, payment) => sum + payment.amount_minor, 0);
      const pending = rows
        .filter((payment) => payment.status === "pending")
        .reduce((sum, payment) => sum + payment.amount_minor, 0);
      const reversed = rows
        .filter((payment) => payment.status === "reversed")
        .reduce((sum, payment) => sum + payment.amount_minor, 0);
      return {
        method,
        attempts: rows.length,
        expected_minor: captured + pending,
        captured_minor: captured,
        pending_minor: pending,
        reversed_minor: reversed,
      };
    });

    return context.json(report);
  });
}
