import { extractVAT } from "@hpos/domain";
import type { Db } from "@hpos/db";
import type { Hono } from "hono";
import { requireAuth, requireRole, type AppEnv } from "./auth.js";
import { resolveVenue } from "./context.js";

function bound(value: string | undefined, end: boolean): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return end ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  }
  return value;
}

function dateRange(context: { req: { query: (name: string) => string | undefined } }) {
  const from =
    bound(context.req.query("from"), false) ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = bound(context.req.query("to"), true) ?? new Date().toISOString();
  return { from, to };
}

async function loadReportData(db: Db, tenantId: string, venueId: string, from: string, to: string) {
  const [orders, items, payments, menuRows, users] = await Promise.all([
    db
      .selectFrom("orders")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("venue_id", "=", venueId)
      .where("created_at", ">=", from)
      .where("created_at", "<=", to)
      .execute(),
    db
      .selectFrom("order_items")
      .innerJoin("orders", (join) =>
        join
          .onRef("order_items.order_id", "=", "orders.id")
          .onRef("order_items.tenant_id", "=", "orders.tenant_id"),
      )
      .select([
        "order_items.item_id",
        "order_items.name_snapshot",
        "order_items.quantity",
        "order_items.line_total_minor",
        "order_items.tax_rate",
        "orders.opened_by",
      ])
      .where("orders.tenant_id", "=", tenantId)
      .where("orders.venue_id", "=", venueId)
      .where("orders.status", "!=", "voided")
      .where("orders.created_at", ">=", from)
      .where("orders.created_at", "<=", to)
      .execute(),
    db
      .selectFrom("payments")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("venue_id", "=", venueId)
      .where("created_at", ">=", from)
      .where("created_at", "<=", to)
      .execute(),
    db
      .selectFrom("menu_items")
      .innerJoin("menu_categories", "menu_categories.id", "menu_items.category_id")
      .select([
        "menu_items.id",
        "menu_items.name",
        "menu_categories.name as category_name",
      ])
      .where("menu_items.tenant_id", "=", tenantId)
      .execute(),
    db
      .selectFrom("users")
      .select(["id", "name"])
      .where("tenant_id", "=", tenantId)
      .execute(),
  ]);

  return { orders, items, payments, menuRows, users };
}

function buildReport(data: Awaited<ReturnType<typeof loadReportData>>) {
  const sales = data.orders.filter((order) => order.status !== "voided");
  const voids = data.orders.filter((order) => order.status === "voided");
  const captured = data.payments.filter((payment) => payment.status === "confirmed");

  const grossMinor = sales.reduce((sum, order) => sum + order.total_minor, 0);
  const taxMinor = sales.reduce((sum, order) => sum + order.tax_minor, 0);
  const discountsMinor = sales.reduce(
    (sum, order) => sum + order.discount_minor,
    0,
  );
  const tipsMinor = captured.reduce((sum, payment) => sum + payment.tip_minor, 0);
  const voidsMinor = voids.reduce((sum, order) => sum + order.total_minor, 0);

  const menuById = new Map(data.menuRows.map((row) => [row.id, row]));
  const userById = new Map(data.users.map((row) => [row.id, row.name]));

  const methods = ["cash", "mpesa_manual", "mpesa_stk", "pdq_card"] as const;
  const paymentMix = methods.map((method) => ({
    method,
    minor: captured
      .filter((payment) => payment.method === method)
      .reduce((sum, payment) => sum + payment.amount_minor, 0),
    tips_minor: captured
      .filter((payment) => payment.method === method)
      .reduce((sum, payment) => sum + payment.tip_minor, 0),
  }));

  const itemMap = new Map<
    string,
    { item_id: string; name: string; category: string; quantity: number; gross_minor: number }
  >();
  const categoryMap = new Map<string, { category: string; quantity: number; gross_minor: number }>();
  const taxMap = new Map<number, { tax_rate: number; gross_minor: number }>();

  for (const item of data.items) {
    const category = menuById.get(item.item_id)?.category_name ?? "Uncategorised";
    const existing = itemMap.get(item.item_id) ?? {
      item_id: item.item_id,
      name: item.name_snapshot,
      category,
      quantity: 0,
      gross_minor: 0,
    };
    existing.quantity += item.quantity;
    existing.gross_minor += item.line_total_minor;
    itemMap.set(item.item_id, existing);

    const categoryEntry = categoryMap.get(category) ?? {
      category,
      quantity: 0,
      gross_minor: 0,
    };
    categoryEntry.quantity += item.quantity;
    categoryEntry.gross_minor += item.line_total_minor;
    categoryMap.set(category, categoryEntry);

    const taxEntry = taxMap.get(item.tax_rate) ?? {
      tax_rate: item.tax_rate,
      gross_minor: 0,
    };
    taxEntry.gross_minor += item.line_total_minor;
    taxMap.set(item.tax_rate, taxEntry);
  }

  const topItems = [...itemMap.values()].sort(
    (a, b) => b.gross_minor - a.gross_minor,
  );
  const categories = [...categoryMap.values()].sort(
    (a, b) => b.gross_minor - a.gross_minor,
  );
  const vat = [...taxMap.values()].map((entry) => {
    const parts = extractVAT(entry.gross_minor, entry.tax_rate);
    return {
      tax_rate: entry.tax_rate,
      gross_minor: entry.gross_minor,
      net_minor: parts.net,
      tax_minor: parts.vat,
    };
  });

  const staffMap = new Map<
    string,
    { user_id: string; name: string; orders: number; gross_minor: number; captured_minor: number }
  >();
  for (const order of sales) {
    const userId = order.opened_by ?? "";
    const entry = staffMap.get(userId) ?? {
      user_id: userId,
      name: userById.get(userId) ?? "Unknown",
      orders: 0,
      gross_minor: 0,
      captured_minor: 0,
    };
    entry.orders += 1;
    entry.gross_minor += order.total_minor;
    staffMap.set(userId, entry);
  }
  for (const payment of captured) {
    const userId = payment.created_by ?? "";
    const entry = staffMap.get(userId) ?? {
      user_id: userId,
      name: userById.get(userId) ?? "Unknown",
      orders: 0,
      gross_minor: 0,
      captured_minor: 0,
    };
    entry.captured_minor += payment.amount_minor;
    staffMap.set(userId, entry);
  }

  return {
    summary: {
      orders: sales.length,
      gross_minor: grossMinor,
      net_minor: Math.max(0, grossMinor - taxMinor - discountsMinor),
      tax_minor: taxMinor,
      discounts_minor: discountsMinor,
      tips_minor: tipsMinor,
      voids_minor: voidsMinor,
      captured_minor: captured.reduce(
        (sum, payment) => sum + payment.amount_minor,
        0,
      ),
    },
    payment_mix: paymentMix,
    items: topItems,
    categories,
    staff: [...staffMap.values()].sort((a, b) => b.gross_minor - a.gross_minor),
    vat,
  };
}

function csv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

export function registerReportRoutes(app: Hono<AppEnv>, db: Db) {
  app.get(
    "/api/reports",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);
    const { from, to } = dateRange(context);
    const data = await loadReportData(db, auth.tenantId, venue.id, from, to);
    return context.json({ from, to, venue_id: venue.id, ...buildReport(data) });
  });

  app.get(
    "/api/reports/export",
    requireAuth(db),
    requireRole("owner", "manager"),
    async (context) => {
    const auth = context.get("auth");
    const venue = await resolveVenue(
      db,
      auth.tenantId,
      context.req.query("venue_id"),
    );
    if (!venue) return context.json({ error: "venue_not_found" }, 404);
    const { from, to } = dateRange(context);
    const data = await loadReportData(db, auth.tenantId, venue.id, from, to);
    const report = buildReport(data);
    const section = context.req.query("section") ?? "summary";

    let rows: Array<Array<string | number>> = [["section", "label", "value"]];
    if (section === "items") {
      rows = [
        ["item", "category", "quantity", "gross_minor"],
        ...report.items.map((item) => [
          item.name,
          item.category,
          item.quantity,
          item.gross_minor,
        ]),
      ];
    } else if (section === "vat") {
      rows = [
        ["tax_rate", "gross_minor", "net_minor", "tax_minor"],
        ...report.vat.map((row) => [
          row.tax_rate,
          row.gross_minor,
          row.net_minor,
          row.tax_minor,
        ]),
      ];
    } else if (section === "staff") {
      rows = [
        ["staff", "orders", "gross_minor", "captured_minor"],
        ...report.staff.map((row) => [
          row.name,
          row.orders,
          row.gross_minor,
          row.captured_minor,
        ]),
      ];
    } else {
      rows = [
        ["metric", "value"],
        ...Object.entries(report.summary).map(([key, value]) => [key, value]),
        ...report.payment_mix.map((row) => [`payment:${row.method}`, row.minor]),
      ];
    }

    context.header("Content-Type", "text/csv; charset=utf-8");
    context.header(
      "Content-Disposition",
      `attachment; filename="report-${section}.csv"`,
    );
    return context.body(csv(rows));
  });
}
