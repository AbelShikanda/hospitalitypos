import {
  createPaymentSchema,
  darajaCredentialsSchema,
  reversePaymentSchema,
} from "@hpos/contracts";
import type { Db } from "@hpos/db";
import { assertPaymentTransition, newId, outstandingMinor } from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import {
  queryStkStatus,
  stkPush,
  type DarajaConfig,
} from "./daraja.js";
import { loadOrder } from "./orders.js";
import { decryptSecret, encryptSecret } from "./secret.js";
import { recordOutbox } from "./sync.js";

function toPayment(row: {
  id: string;
  tenant_id: string;
  venue_id: string;
  order_id: string;
  method: string;
  status: string;
  amount_minor: number;
  tip_minor: number;
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
    tip_minor: row.tip_minor,
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

async function loadDarajaConfig(
  db: Db,
  tenantId: string,
): Promise<DarajaConfig | null> {
  const row = await db
    .selectFrom("payment_credentials")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("provider", "=", "daraja")
    .orderBy("updated_at", "desc")
    .executeTakeFirst();
  if (!row) return null;

  try {
    const parsed = JSON.parse(decryptSecret(row.encrypted_config)) as Omit<
      DarajaConfig,
      "environment"
    >;
    return {
      ...parsed,
      environment: row.environment as DarajaConfig["environment"],
    };
  } catch {
    return null;
  }
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

export async function processStkTimeouts(db: Db): Promise<void> {
  const rows = await db
    .selectFrom("payments")
    .selectAll()
    .where("status", "=", "pending")
    .where("method", "=", "mpesa_stk")
    .where("provider_ref", "is not", null)
    .execute();

  const cutoff = Date.now() - 2 * 60 * 1000;
  const stale = rows
    .filter((payment) => new Date(payment.created_at).getTime() < cutoff)
    .slice(0, 20);
  const configs = new Map<string, DarajaConfig | null>();

  for (const payment of stale) {
    if (!payment.provider_ref) continue;
    let config = configs.get(payment.tenant_id);
    if (config === undefined) {
      config = await loadDarajaConfig(db, payment.tenant_id);
      configs.set(payment.tenant_id, config);
    }
    if (!config) continue;

    try {
      const result = await queryStkStatus(config, payment.provider_ref);
      const next = result.resultCode === 0 ? "confirmed" : "failed";
      const current = await db
        .selectFrom("payments")
        .select("status")
        .where("id", "=", payment.id)
        .where("tenant_id", "=", payment.tenant_id)
        .executeTakeFirst();
      if (current?.status !== "pending") continue;

      const now = new Date().toISOString();
      const eventKey = `stk-query:${payment.id}`;
      const existingEvent = await db
        .selectFrom("payment_events")
        .select("id")
        .where("tenant_id", "=", payment.tenant_id)
        .where("idempotency_key", "=", eventKey)
        .executeTakeFirst();
      if (existingEvent) continue;

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("payments")
          .set({
            status: next,
            confirmed_at: next === "confirmed" ? now : null,
            updated_at: now,
          })
          .where("id", "=", payment.id)
          .where("tenant_id", "=", payment.tenant_id)
          .execute();
        await trx
          .insertInto("payment_events")
          .values({
            id: newId(),
            tenant_id: payment.tenant_id,
            payment_id: payment.id,
            type: next,
            data: JSON.stringify({
              from: payment.status,
              result_code: result.resultCode,
              result_desc: result.resultDesc,
            }),
            actor_user_id: null,
            idempotency_key: eventKey,
            created_at: now,
          })
          .execute();
      });
    } catch {
      continue;
    }
  }
}

export function registerPaymentRoutes(app: Hono<AppEnv>, db: Db) {
  app.post(
    "/api/payments",
    requireAuth(db),
    requireRole("owner", "manager", "cashier"),
    async (context) => {
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
      .select(["amount_minor", "status", "tip_minor"])
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
    const tipMinor = existingPayments.some((payment) => payment.tip_minor > 0)
      ? 0
      : input.tip_minor;
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
          tip_minor: tipMinor,
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

    if (status === "pending" && input.method === "mpesa_stk") {
      const config = await loadDarajaConfig(db, auth.tenantId);
      if (!config || !input.mpesa?.phone) {
        await db
          .insertInto("payment_events")
          .values({
            id: newId(),
            tenant_id: auth.tenantId,
            payment_id: paymentId,
            type: "provider_not_configured",
            data: JSON.stringify({ provider: "daraja" }),
            actor_user_id: auth.userId,
            idempotency_key: null,
            created_at: new Date().toISOString(),
          })
          .execute();
      } else {
        try {
          const result = await stkPush(config, {
            phone: input.mpesa.phone,
            amountMinor: input.amount_minor,
            orderNumber: order.number,
          });
          const current = await db
            .selectFrom("payments")
            .select("details")
            .where("id", "=", paymentId)
            .where("tenant_id", "=", auth.tenantId)
            .executeTakeFirstOrThrow();
          let currentDetails: Record<string, unknown> = {};
          try {
            currentDetails = JSON.parse(current.details) as Record<
              string,
              unknown
            >;
          } catch {
            currentDetails = {};
          }
          await db
            .updateTable("payments")
            .set({
              provider_ref: result.checkoutRequestId,
              details: JSON.stringify({
                ...currentDetails,
                checkout_request_id: result.checkoutRequestId,
                merchant_request_id: result.merchantRequestId,
                customer_message: result.customerMessage,
              }),
              updated_at: new Date().toISOString(),
            })
            .where("id", "=", paymentId)
            .where("tenant_id", "=", auth.tenantId)
            .execute();
          await db
            .insertInto("payment_events")
            .values({
              id: newId(),
              tenant_id: auth.tenantId,
              payment_id: paymentId,
              type: "stk_requested",
              data: JSON.stringify({
                checkout_request_id: result.checkoutRequestId,
              }),
              actor_user_id: auth.userId,
              idempotency_key: null,
              created_at: new Date().toISOString(),
            })
            .execute();
        } catch (error) {
          await db
            .insertInto("payment_events")
            .values({
              id: newId(),
              tenant_id: auth.tenantId,
              payment_id: paymentId,
              type: "provider_error",
              data: JSON.stringify({
                message: error instanceof Error ? error.message : "stk_failed",
              }),
              actor_user_id: auth.userId,
              idempotency_key: null,
              created_at: new Date().toISOString(),
            })
            .execute();
        }
      }
    }

    const created = await db
      .selectFrom("payments")
      .selectAll()
      .where("id", "=", paymentId)
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirstOrThrow();
    await recordOutbox(db, {
      tenantId: auth.tenantId,
      venueId: created.venue_id,
      entity: "payment",
      entityId: created.id,
      op: "created",
      payload: toPayment(created),
      idempotencyKey: `payment:${input.idempotency_key}`,
    });
    return context.json(toPayment(created), 201);
  });

  app.get("/api/payments", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const orderId = context.req.query("order_id");
    const venueId = context.req.query("venue_id");
    let query = db
      .selectFrom("payments")
      .innerJoin("orders", "orders.id", "payments.order_id")
      .selectAll("payments")
      .where("payments.tenant_id", "=", auth.tenantId);
    if (orderId) query = query.where("payments.order_id", "=", orderId);
    if (venueId) query = query.where("payments.venue_id", "=", venueId);
    if (auth.role === "waiter") {
      query = query.where("orders.opened_by", "=", auth.userId);
    }
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
      await recordOutbox(db, {
        tenantId: auth.tenantId,
        venueId: payment.venue_id,
        entity: "payment",
        entityId: payment.id,
        op: "confirmed",
        payload: { ...toPayment(payment), status: "confirmed" },
      });
      return context.json({
        ...toPayment(payment),
        status: "confirmed",
        confirmed_at: now,
      });
    },
  );

  app.post(
    "/api/payments/:id/cancel",
    requireAuth(db),
    requireRole("owner", "manager", "cashier"),
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
    await recordOutbox(db, {
      tenantId: auth.tenantId,
      venueId: payment.venue_id,
      entity: "payment",
      entityId: payment.id,
      op: "cancelled",
      payload: { ...toPayment(payment), status: "cancelled" },
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
      await recordOutbox(db, {
        tenantId: auth.tenantId,
        venueId: payment.venue_id,
        entity: "payment",
        entityId: payment.id,
        op: "reversed",
        payload: { ...toPayment(payment), status: "reversed" },
      });
      return context.json({ ...toPayment(payment), status: "reversed" });
    },
  );

  app.put(
    "/api/payments/credentials/daraja",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
      const body = await context.req.json().catch(() => null);
      const parsed = darajaCredentialsSchema.safeParse(body);
      if (!parsed.success) {
        return context.json({ error: "invalid_input" }, 400);
      }

      const auth = context.get("auth");
      const { environment, ...config } = parsed.data;
      const encrypted = encryptSecret(JSON.stringify(config));
      const now = new Date().toISOString();
      const existing = await db
        .selectFrom("payment_credentials")
        .select("id")
        .where("tenant_id", "=", auth.tenantId)
        .where("provider", "=", "daraja")
        .where("environment", "=", environment)
        .executeTakeFirst();

      const id = existing?.id ?? newId();
      if (existing) {
        await db
          .updateTable("payment_credentials")
          .set({ encrypted_config: encrypted, updated_at: now })
          .where("id", "=", id)
          .where("tenant_id", "=", auth.tenantId)
          .execute();
      } else {
        await db
          .insertInto("payment_credentials")
          .values({
            id,
            tenant_id: auth.tenantId,
            provider: "daraja",
            environment,
            encrypted_config: encrypted,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }

      return context.json({
        id,
        provider: "daraja",
        environment,
        created_at: existing ? undefined : now,
        updated_at: now,
      });
    },
  );

  app.get(
    "/api/payments/credentials",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const rows = await db
      .selectFrom("payment_credentials")
      .select(["id", "provider", "environment", "created_at", "updated_at"])
      .where("tenant_id", "=", auth.tenantId)
      .orderBy("updated_at", "desc")
      .execute();
    return context.json(rows);
  });

  app.post("/api/payments/mpesa/callback", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      Body?: { stkCallback?: Record<string, unknown> };
    } | null;
    const callback = body?.Body?.stkCallback;
    if (!callback || typeof callback.CheckoutRequestID !== "string") {
      return context.json({ error: "invalid_callback" }, 400);
    }

    const checkoutId = callback.CheckoutRequestID;
    const resultCode = Number(callback.ResultCode ?? -1);
    const transactionId =
      typeof callback.TransactionID === "string"
        ? callback.TransactionID
        : checkoutId;

    const payment = await db
      .selectFrom("payments")
      .selectAll()
      .where((expression) =>
        expression.or([
          expression("provider_ref", "=", checkoutId),
          expression("details", "like", `%${checkoutId}%`),
        ]),
      )
      .where("method", "=", "mpesa_stk")
      .executeTakeFirst();
    if (!payment) return context.json({ error: "unknown_checkout" }, 404);

    const eventKey = `mpesa:${checkoutId}:${resultCode}:${transactionId}`;
    const existingEvent = await db
      .selectFrom("payment_events")
      .select("id")
      .where("tenant_id", "=", payment.tenant_id)
      .where("idempotency_key", "=", eventKey)
      .executeTakeFirst();
    if (existingEvent) return context.json({ received: true, duplicate: true });

    const next = resultCode === 0 ? "confirmed" : "failed";
    if (payment.status !== "pending") {
      return context.json({ received: true, ignored: true });
    }

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("payments")
        .set({
          status: next,
          confirmed_at: next === "confirmed" ? now : null,
          updated_at: now,
          provider_ref:
            next === "confirmed" && transactionId !== checkoutId
              ? transactionId
              : payment.provider_ref,
        })
        .where("id", "=", payment.id)
        .where("tenant_id", "=", payment.tenant_id)
        .execute();

      await trx
        .insertInto("payment_events")
        .values({
          id: newId(),
          tenant_id: payment.tenant_id,
          payment_id: payment.id,
          type: next,
          data: JSON.stringify({
            from: payment.status,
            result_code: resultCode,
            result_desc: callback.ResultDesc ?? null,
          }),
          actor_user_id: null,
          idempotency_key: eventKey,
          created_at: now,
        })
        .execute();
    });

    return context.json({ received: true });
  });

  app.get(
    "/api/payments/reconciliation",
    requireAuth(db),
    requireRole("owner", "manager", "cashier"),
    async (context) => {
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
