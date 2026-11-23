# Tasks

Phased roadmap. Check items off as they land. Each phase has an exit criterion.
Order is a guide, not a straitjacket — but offline-first foundations must come
before features that depend on them.

Legend: `P0` must-have for MVP · `P1` should-have · `P2` later.

**Tracking:** this is the living checklist. Tick items in the **same commit**
that completes them, and commit one small milestone at a time (see `AGENT.md`).

---

## Phase 0 — Foundation (P0)

**Exit:** `pnpm dev` boots web + edge + cloud locally; CI green; a tenant exists
and a staff member can log in.

- [x] Init pnpm workspace + Turborepo; TS strict, ESLint, Prettier, Vitest.
- [x] Create packages: `domain`, `contracts`, `db`, `ui`, `config`.
- [x] Create apps: `web` (Vite PWA shell), `edge` (Hono + Kysely + SQLite),
      `cloud` (Hono + Kysely + Postgres/MySQL).
- [x] `packages/db`: Kysely `Database` interface + `createDb()` dialect factory
      (`DB_DIALECT=postgres|mysql`) + code-based migrations.
- [x] Define core schema: tenant, venue, user, membership, role (portable types:
      ULID `char(26)`, `bigint` money, `text` JSON, UTC timestamps).
- [x] Auth: PIN (POS) with scrypt hashes, revocable tenant-scoped sessions
      (ADR-019); cloud admin email/OTP still planned.
- [x] Tenant-scoping middleware + isolation tests on SQLite (`apps/edge`).
- [ ] Run the same isolation suite on Postgres **and** MySQL in the CI matrix.
- [ ] PIN login hardening: rate limiting, CSRF review, security review.
- [ ] Docker Compose for edge; Dockerfile for cloud; GitHub Actions CI.
- [ ] CI matrix: migrations + isolation/sync tests on Postgres **and** MySQL/MariaDB;
      edge tests on SQLite.
- [x] Edge serves the built web PWA at `/` with SPA fallback; launcher builds it
      on first run and resolves pnpm from a minimal desktop `PATH`.
- [x] Seed script: one tenant, one venue, sample roles.
- [ ] Zero-cost audit: all deps OSS/self-hostable; no paid service required.
- [x] `docs/AGENT.md` commands verified against real scripts.

---

## Phase 0b — Distribution, updates and lifecycle (P0)

**Exit:** The hosted demo is live on GitHub Pages and installs as a PWA; an edge
bundle from Releases starts with one command and serves the PWA on the LAN; an
installed app detects a new version and prompts safely; splash shows on cold
start; Settings → Danger Zone can restart/shut down the edge.

- [ ] Configurable Vite `base` for GitHub Pages subpaths; router basename +
      `import.meta.env.BASE_URL`; correct service-worker scope.
- [ ] Mode detection (`VITE_APP_MODE` + `/api/health` probe) and feature flags;
      hide edge-only UI (printers, KDS, lifecycle) in hosted mode.
- [ ] Data-layer repository interface with IndexedDB adapter (hosted) and edge
      API adapter (edge).
- [ ] Inject `__APP_VERSION__` (semver + git SHA + build time); serve
      `/version.json` and `/api/version` (`{ app, edge, schema, build }`).
- [ ] Manifest + icons (192/512/maskable) + `theme_color`/`background_color`;
      iOS `apple-touch-startup-image` pipeline.
- [ ] In-app splash: logo, version, status ("Starting…"/"Offline"/"Connecting"),
      min ~600 ms, precached, fades to app; offline retry state.
- [ ] SW update flow (`registerType: 'prompt'`): poll on interval + focus,
      non-blocking "Update available" banner with changelog, defer reload while
      a bill is open, "Check for updates" in Settings.
- [ ] Edge updater: check signed image tags, notify admins, configurable update
      window, rollback on failed health check.
- [ ] Settings → Danger Zone: Restart / Shut down server with role + PIN
      re-auth + typed confirmation + open-bill/shift guard + audit.
- [ ] `POST /api/system/restart` and `/shutdown`: graceful drain, flush outbox,
      close printers, checkpoint SQLite, exit; Docker restart policy `no`.
- [ ] "Server stopped" screen + restart instructions; hide lifecycle in hosted.
- [ ] CI: publish hosted build to Pages; build edge image; create GitHub Release
      with hosted zip, edge bundle, checksums, changelog.
- [ ] Edge one-command launcher (`start.sh`/`start.bat`/`start.ps1`): Docker
      check, `.env` bootstrap, seed, start, print LAN URL + QR.
- [ ] Hosted-mode demo banner (seeded data, not for real money, no hardware).
- [x] Desktop launchers: Linux `.desktop` (`Terminal=false`), Windows `wscript` + hidden PowerShell, macOS `.app` bundle — no console windows.
- [x] Shortcut installers create Desktop + app-menu entries on all three OSes.
- [x] Launcher starts edge or preview, waits for health, opens Chrome/Edge
      app-mode window, logs to file.
- [ ] **Every release includes a desktop shortcut** (release checklist item).
- [x] `docs/DESKTOP.md` documents the shortcuts and the no-console rule.

---

## Phase 1 — Menu, tables and order taking (P0)

**Exit:** A waiter can open a table, build an order with modifiers, and send it;
data survives an edge-node restart.

- [x] Menu schema: categories, items, modifier groups, availability.
- [x] Per-venue pricing + tax rate per item (VAT-inclusive prices, ADR-020).
- [x] Floor plan: areas and tables; table status (free/occupied/reserved).
- [x] Order state machine in `domain` (open → sent → preparing → served → closed)
      with unit tests.
- [x] Order taking UI: fast touch grid, modifiers, quantity; send to kitchen.
- [x] Order notes on creation and appended rounds.
- [x] Courses: menu item course and per-course firing.
- [x] Open tabs: reopen, append rounds and send new items.
- [x] Move/merge tables with table-status updates and audit events.
- [x] Local persistence on edge (SQLite) + restart survival.
- [x] Optimistic UI in PWA with queued-write indicator.
- [x] Idempotency keys on order creation and safe transition retries.
- [x] Outbox write on every mutation with retry on reconnect.
- [x] Audit log for order events.

---

## Phase 2 — Billing, splits and printing (P0)

**Exit:** Split a bill three ways, apply VAT, print a receipt, kick the drawer —
all with the internet unplugged.

- [ ] Money/tax engine in `domain`: line totals, discounts, tips, VAT, rounding;
      exhaustive unit tests.
- [ ] Bill view: subtotal, tax, discount, tip, total.
- [ ] Split by item / by seat / by amount with deterministic remainder handling.
- [ ] Void/comp with reason + role check + audit entry.
- [ ] Receipt model + 80mm ESC/POS layout (header, items, tax, totals, footer).
- [ ] Edge device bridge: printer connect, test print, print queue with retry.
- [ ] Cash drawer kick via printer pulse.
- [ ] Print routing: receipt printer vs kitchen/bar station.
- [ ] Failed-print surfacing in UI (never silent).

---

## Phase 3 — Payments (P0)

**Exit:** Take cash, manual M-Pesa reference, Daraja STK Push and a PDQ card
payment; all reconcile in reports; all idempotent.

- [x] Payment state machine (pending/confirmed/failed/reversed) in `domain`.
- [ ] Cash payment + change calculation.
- [ ] Manual M-Pesa reference capture (works offline at venue).
- [ ] Daraja integration: OAuth, STK Push, callback validation, retries, timeouts.
- [ ] Per-tenant Daraja credentials, encrypted at rest, server-only.
- [ ] PDQ card terminal via edge device bridge (integrated/semi-integrated/
      standalone; vendor TBD — see Open decisions).
- [ ] PDQ capture: terminal ID, approval code, RRN/STAN, card brand, last4;
      reconcile against the terminal/bank settlement.
- [ ] Payment audit trail + provider refs.
- [ ] Reconciliation report: expected vs captured vs pending.

---

## Phase 4 — Kitchen display and order routing (P0)

**Exit:** Sent orders appear on KDS in <2s on LAN; status flows back to the floor.

- [ ] Station config (kitchen, bar) and item→station routing.
- [ ] Edge WebSocket channel for live tickets.
- [ ] KDS UI: ticket queue, aging colors, bump/preparing/ready.
- [ ] Status changes propagate to waiter view.
- [ ] Reprint kitchen ticket on demand.

---

## Phase 5 — Staff, roles and shifts (P0)

**Exit:** Staff clock in, sell under their PIN, and a manager closes a shift with a
Z-report that balances.

- [ ] RBAC enforcement on sensitive actions (voids, discounts, refunds, close).
- [ ] Clock-in/out; active shift per staff per venue.
- [ ] Per-staff sales attribution.
- [ ] Shift close: cash counted vs expected, payment breakdown, Z-report.
- [ ] Shift history + export.

---

## Phase 6 — Inventory and stock (P0)

**Exit:** Selling an item depletes linked stock; low stock alerts fire; a stock
count adjusts levels with an audit trail.

- [ ] Stock items, units, par levels.
- [ ] Recipe/depletion links (menu item → stock items).
- [ ] Stock movements on sale, void, and manual adjustment.
- [ ] Low-stock alerts.
- [ ] Stock count / variance workflow.
- [ ] Basic supplier records (P2 depth).

---

## Phase 7 — Reports and analytics (P0)

**Exit:** Owner can see today's sales, payment mix, top items and tax summary.

- [ ] Daily sales summary (gross, net, tax, discounts, tips, voids).
- [ ] Payment mix (cash / M-Pesa manual / Daraja / card).
- [ ] Top items and category performance.
- [ ] Staff performance.
- [ ] Tax (VAT) summary + export (CSV).
- [ ] Date-range filters; per-venue and per-tenant views (cloud).

---

## Phase 8 — Cloud sync and SaaS control plane (P1)

**Depends on:** a VPS (Docker) with Postgres or MySQL. Until then the product
runs edge-only at zero cloud cost.

**Exit:** An edge node syncs to cloud on reconnect with no data loss; platform
admin can onboard a tenant end-to-end; sync verified on **both** Postgres and
MySQL/MariaDB.

- [ ] Sync worker: outbox push, inbox pull, cursors, idempotent apply.
- [ ] Conflict rules per entity (documented and tested).
- [ ] Cloud tenant/venue management + catalog publishing to edge.
- [ ] Aggregated cloud reporting.
- [ ] Encrypted backup upload on reconnect; restore runbook.
- [ ] Heartbeat/health telemetry.
- [ ] DB-backed job queue + cron-triggered worker (no Redis/WebSockets in cloud).
- [ ] Deploy cloud on VPS via Docker; SSL via Let's Encrypt; verify DB engine.
- [ ] Tenant subscription plans/trials (P2 depth).

---

## Phase 9 — Hardening and launch (P0)

**Exit:** A pilot venue runs a full week including an internet outage with no lost
orders or double charges.

- [ ] Chaos test: unplug internet mid-service, verify sync recovery.
- [ ] Chaos test: edge power loss mid-order; verify no corruption.
- [ ] Load test: 10 tablets + KDS + printer on LAN.
- [ ] Security review: tenant isolation, secrets, Daraja callbacks.
- [ ] Backup/restore drill.
- [ ] Device provisioning guide (edge box, printers, drawer, scanner).
- [ ] Remote-support path + update/rollback drill.
- [ ] Pilot with one real venue; collect feedback.
- [ ] Update drill: publish a release; verify PWA prompt, deferred reload with an
      open bill, edge auto-update window, and rollback on failed health check.
- [ ] Lifecycle drill: restart and shut down from Settings; verify graceful
      flush, "Server stopped" screen, and recovery after power cycle.
- [ ] Hosted-mode audit: no edge-only controls exposed; works offline from the
      installed icon; Pages subpath + service-worker scope correct.

---

## Open questions (track in DECISIONS.md too)

- [ ] Card terminal vendor + LAN/SDK bridge feasibility.
- [ ] VPS provider + DB engine (Postgres vs MySQL); confirm MySQL 8+/MariaDB 10.6+.
- [ ] KDS in first sellable release vs phase 2.
- [ ] Tip and service-charge rules.
- [ ] Sync engine: custom outbox vs self-hostable OSS (no paid sync).
- [ ] Multi-currency / multi-language timing.
- [ ] Edge packaging: Docker-only vs optional single binary (Bun/Node SEA) for
      non-technical venues.
- [ ] Hosted demo scope: how much can run with IndexedDB before requiring edge?
- [ ] Optional status page (self-hosted Uptime Kuma) and domain name.

## Definition of done (per task)

- Code + tests pass (`pnpm lint`, `pnpm typecheck`, `pnpm test`).
- Tenant scoping and idempotency verified where money/orders are involved.
- Dialect portability: migrations/queries pass on Postgres and MySQL/MariaDB.
- No paid dependency introduced; all new deps OSS/self-hostable.
- Docs (`DECISIONS.md` / `TASKS.md`) updated in the same change.
- No secrets committed; money math lives in `packages/domain`.
