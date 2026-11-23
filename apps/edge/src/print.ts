import { printReceiptSchema } from "@hpos/contracts";
import type { Db } from "@hpos/db";
import {
  billTotals,
  formatReceiptText,
  newId,
  receiptEscPos,
} from "@hpos/domain";
import type { Hono } from "hono";
import { requireAuth, type AppEnv } from "./auth.js";
import { loadOrder } from "./orders.js";
import { sendPrintJob, type PrintPayload } from "./printer.js";

let processing = false;

export async function processPrintJobs(db: Db): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const jobs = await db
      .selectFrom("print_jobs")
      .selectAll()
      .where("status", "=", "queued")
      .orderBy("created_at")
      .execute();

    for (const job of jobs) {
      const now = new Date().toISOString();
      try {
        await sendPrintJob(JSON.parse(job.payload) as PrintPayload);
        await db
          .updateTable("print_jobs")
          .set({ status: "sent", error: null, updated_at: now })
          .where("id", "=", job.id)
          .execute();
      } catch (error) {
        await db
          .updateTable("print_jobs")
          .set({
            status: "failed",
            attempts: job.attempts + 1,
            error: error instanceof Error ? error.message : "print_failed",
            updated_at: now,
          })
          .where("id", "=", job.id)
          .execute();
      }
    }
  } finally {
    processing = false;
  }
}

export function registerPrintRoutes(app: Hono<AppEnv>, db: Db) {
  app.post("/api/print/receipt", requireAuth(db), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = printReceiptSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid_input" }, 400);
    }

    const auth = context.get("auth");
    const input = parsed.data;

    if (input.idempotency_key) {
      const existing = await db
        .selectFrom("print_jobs")
        .selectAll()
        .where("tenant_id", "=", auth.tenantId)
        .where("idempotency_key", "=", input.idempotency_key)
        .executeTakeFirst();
      if (existing) return context.json(existing, 200);
    }

    const order = await loadOrder(db, auth.tenantId, input.order_id);
    if (!order) return context.json({ error: "order_not_found" }, 404);

    const [venue, tenant] = await Promise.all([
      db
        .selectFrom("venues")
        .select("name")
        .where("id", "=", order.venue_id)
        .where("tenant_id", "=", auth.tenantId)
        .executeTakeFirst(),
      db
        .selectFrom("tenants")
        .select("name")
        .where("id", "=", auth.tenantId)
        .executeTakeFirst(),
    ]);

    const bill = billTotals(
      order.items.map((item) => ({
        id: item.id,
        totalMinor: item.line_total_minor,
        taxRate: item.tax_rate,
      })),
      {
        discountMinor: order.discount_minor,
        discountPercent: input.discount_percent,
        tipMinor: input.tip_minor,
      },
    );

    const receiptInput = {
      venueName: `${tenant?.name ?? "Hospitality POS"} · ${venue?.name ?? "Main Venue"}`,
      orderNumber: order.number,
      table: order.table_id,
      lines: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        totalMinor: item.line_total_minor,
        modifiers: item.modifiers.map((modifier) => modifier.name),
      })),
      bill,
    };

    const payload: PrintPayload = {
      text: formatReceiptText(receiptInput),
      bytes: Buffer.from(receiptEscPos(receiptInput)).toString("base64"),
      kickDrawer: input.kick_drawer,
    };

    const now = new Date().toISOString();
    const job = {
      id: newId(),
      tenant_id: auth.tenantId,
      venue_id: order.venue_id,
      order_id: order.id,
      type: "receipt",
      payload: JSON.stringify(payload),
      status: "queued",
      attempts: 0,
      error: null,
      idempotency_key: input.idempotency_key ?? null,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("print_jobs").values(job).execute();
    void processPrintJobs(db);
    return context.json(job, 201);
  });

  app.get("/api/print/jobs", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const venueId = context.req.query("venue_id");
    const query = db
      .selectFrom("print_jobs")
      .selectAll()
      .where("tenant_id", "=", auth.tenantId);
    const jobs = await (
      venueId ? query.where("venue_id", "=", venueId) : query
    )
      .orderBy("created_at", "desc")
      .execute();
    return context.json(jobs);
  });

  app.post("/api/print/jobs/:id/retry", requireAuth(db), async (context) => {
    const auth = context.get("auth");
    const job = await db
      .selectFrom("print_jobs")
      .selectAll()
      .where("id", "=", context.req.param("id"))
      .where("tenant_id", "=", auth.tenantId)
      .executeTakeFirst();
    if (!job) return context.json({ error: "job_not_found" }, 404);

    const updated = {
      status: "queued",
      error: null,
      updated_at: new Date().toISOString(),
    };
    await db
      .updateTable("print_jobs")
      .set(updated)
      .where("id", "=", job.id)
      .where("tenant_id", "=", auth.tenantId)
      .execute();
    void processPrintJobs(db);
    return context.json({ ...job, ...updated });
  });
}
