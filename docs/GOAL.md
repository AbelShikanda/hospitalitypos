# Goal

## One-liner

A multi-tenant, offline-first hospitality point-of-sale for restaurants, bars,
cafés and small chains — built to work when the internet doesn't, and to handle
Kenyan mobile money natively.

## Why this exists

Most POS products assume always-on internet and foreign card rails. Hospitality
venues in Kenya routinely lose connectivity, take most payments via M-Pesa, and
still need printed receipts, kitchen tickets and a cash drawer. We want a system
that keeps selling through outages, settles payments the way customers actually
pay, and gives owners trustworthy numbers at the end of the day.

## Who it is for

| Persona | Needs |
| --- | --- |
| **Owner / operator** | Revenue visibility, menu control, staff accountability, low downtime |
| **Manager** | Shift reconciliation, discounts/voids control, stock alerts, reports |
| **Waiter / cashier** | Fast touch ordering, table management, split bills, M-Pesa collection |
| **Kitchen / bar** | Clear tickets on a KDS, status flow, no lost orders |
| **Platform admin (us)** | Onboard tenants, manage plans, observe health, support venues |

## Product principles

1. **Offline-first, not offline-tolerant.** The venue LAN is the source of truth
   during service. The cloud is a sync/reporting control plane, never a hard
   dependency for taking an order or payment.
2. **Touch-first and fast.** Common actions in one or two taps. No spinners on
   the critical path.
3. **Money is sacred.** Integer minor units, idempotent payments, full audit
   trail, no silent failures.
4. **Pay the way locals pay.** M-Pesa (Daraja STK Push), manual M-Pesa reference
   entry, and card terminals — not card-only.
5. **Hardware is part of the product.** Printers, cash drawer, scanner and KDS
   are first-class, not afterthoughts.
6. **Multi-tenant by construction.** Every record is tenant-scoped from day one.
7. **Shippable by default.** Every release is try-able in one link and runnable in
   one download: a public demo PWA, plus a download-and-run edge bundle. Updates
   are visible, safe, and never interrupt an open bill.
8. **No paid dependency to start.** Free/OSS libraries, engines and sync; the VPS
   is the only expected recurring cost.
9. **A shortcut, always.** Every release ships a desktop shortcut that starts
   the app without opening a console window.

## MVP scope

### In scope (first sellable version)

- **Menu & catalog** — categories, items, variants, modifiers, availability,
  per-venue pricing.
- **Tables & order taking** — floor/area/table map, open tabs, courses, notes,
  move/merge tables.
- **Billing & payments** — split bills (by item / by seat / by amount), tax
  (VAT), discounts, tips, voids with reason, receipt printing.
- **Payments** — cash, manual M-Pesa reference capture, Daraja STK Push,
  card-terminal bridge.
- **Kitchen display & order routing** — send tickets to kitchen/bar stations
  with status flow (queued → preparing → ready → served).
- **Staff, roles & shifts** — login (PIN), RBAC, clock-in/out, per-staff sales,
  shift close/Z-report.
- **Inventory & stock** — stock items, recipe/depletion links, stock movements,
  low-stock alerts, simple stock counts.
- **Reports & analytics** — daily sales, top items, payment mix, staff
  performance, tax summary, export.
- **Device support** — ESC/POS receipt printer, cash drawer kick, keyboard-wedge
  barcode scanner, KDS screen, card terminal.
- **Distribution & lifecycle** — hosted demo link (GitHub Pages, IndexedDB, no
  hardware), one-command edge bundle from GitHub Releases, in-app update
  notifications with safe deferred reload, startup splash, desktop shortcuts
  for Linux/Windows/macOS that start the app with no terminal, and Settings →
  Danger Zone server restart/shutdown.

### Out of scope (for MVP, revisit later)

- Full accounting / ledger and payroll.
- Loyalty, CRM and marketing automation.
- Online ordering / QR menu / delivery integrations.
- Native iOS/Android apps (PWA covers tablets).
- Multi-currency and multi-language (design for it, ship KES/English first).
- Supplier purchase orders and advanced procurement.
- Franchise-level central kitchen / recipe cost accounting.

## Success metrics

- A venue can complete a full service day with the internet unplugged.
- Order-to-kitchen latency under 2 seconds on the LAN.
- Bill split + M-Pesa + printed receipt in under 60 seconds.
- Zero lost or double-charged payments across an outage/recovery cycle.
- New tenant onboarded to first order in under 30 minutes.
- A new venue can download the edge bundle, start it, and open the PWA on a
  tablet in under 10 minutes.
- An installed app/edge node detects a new release and prompts within 15 minutes
  of being online, without disrupting an open bill.
- The full MVP runs with **zero paid services**; only the VPS is paid.

## Constraints

- **Connectivity:** assume intermittent or absent internet during service.
- **Hardware:** mixed Android tablets, USB/network thermal printers, cash
  drawers, USB barcode scanners, card terminals.
- **Payments:** Safaricom Daraja (M-Pesa) availability and rate limits; card
  terminals vary by provider.
- **Compliance:** stay out of PCI scope by delegating card capture to terminals;
  protect M-Pesa credentials per tenant; retain an audit trail for money
  movements.
- **Currency/tax:** KES, VAT 16% by default (configurable per venue).
- **Hosting:** the public demo link is static (GitHub Pages) and therefore has no
  server/hardware; full POS features require the self-hosted edge bundle (Docker).
  The cloud control plane runs on a **VPS** (Docker) with Postgres or MySQL; the
  current PHP-only shared host is not a cloud target.
- **Cost:** the MVP requires **no paid service** to run. All libraries, engines and
  sync are free/OSS; the VPS is the only expected recurring cost (ADR-016).

## Glossary

- **Tenant** — a business account (may own multiple venues).
- **Venue** — a physical location with its own menu prices, staff, devices.
- **Edge node** — the on-prem LAN server for a venue (local DB + device bridge).
- **Outbox** — durable queue of local mutations awaiting cloud sync.
- **KDS** — kitchen display system.
- **Daraja** — Safaricom's M-Pesa developer API.
