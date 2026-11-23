# Decisions

Architecture Decision Records (ADRs). Append-only: never delete, supersede.
Format: **Context → Decision → Consequences**. Status is one of
`Proposed`, `Accepted`, `Superseded by ADR-XXX`, `Deprecated`.

---

## ADR-001 — Stack overview

**Status:** Accepted

**Context:** We need one team (small, TypeScript-leaning) to ship a PWA, a
per-venue local server, a cloud API, device integrations and payments, while
keeping shared types and fast iteration.

**Decision:**

| Layer         | Choice                                                                 | Why                                                 |
| ------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Language      | TypeScript (strict)                                                    | One language across PWA, edge node, cloud           |
| Monorepo      | pnpm workspaces + Turborepo                                            | Shared types/UI, cached CI                          |
| Web app       | React 19 + Vite + TanStack Router + TanStack Query                     | SPA fits offline PWA; no SSR needed                 |
| UI            | Tailwind CSS + shadcn/ui                                               | Touch-first, fast to build                          |
| PWA/offline   | vite-plugin-pwa (Workbox) + Dexie (IndexedDB)                          | Installable, local cache, optimistic UI             |
| Edge server   | Node.js + Hono + Kysely + SQLite                                       | Small footprint, runs on venue hardware             |
| Cloud API     | Hono + Kysely + Postgres or MySQL                                      | Multi-tenant control plane; dialect via env         |
| DB drivers    | `pg`, `mysql2`, `better-sqlite3`                                       | Pure-JS cloud drivers; no native builds on host     |
| Contracts     | Zod + OpenAPI                                                          | Typed boundaries; webhook validation                |
| Auth          | Better Auth (PIN for POS, email/OTP for admin)                         | Fast terminal login + secure admin                  |
| Jobs          | DB-backed queue + cron (cloud); in-process queue (edge)                | No Redis required on VPS/shared hosts               |
| Payments      | Daraja STK Push + manual M-Pesa ref + PDQ card-terminal bridge         | Kenya-first                                         |
| Printing      | ESC/POS via edge device bridge                                         | Browsers cannot print raw ESC/POS                   |
| Barcode       | Keyboard-wedge scanner                                                 | No driver needed                                    |
| Testing       | Vitest (unit) + Playwright (e2e) + MSW                                 | Confidence on critical money paths                  |
| Observability | Pino + Sentry + append-only audit log                                  | Debugging and money traceability                    |
| CI/CD         | GitHub Actions + Docker                                                | Reproducible builds                                 |
| Hosting       | Cloud: VPS (Docker) with Postgres/MySQL; Edge: Docker on venue mini PC | Offline-capable, cloud-optional, no paid dependency |

**Consequences:** Single language simplifies hiring and sharing. Node on the
edge is heavier than Go/Rust but keeps one toolchain. We accept running Docker
on venue hardware as an operational cost.

---

## ADR-002 — Local-first architecture with a per-venue edge node

**Status:** Accepted

**Context:** Venues lose internet during service. We must keep taking orders,
printing and settling payments. A pure browser PWA stores data per-device
(IndexedDB), which breaks shared tables/orders across multiple tablets, and it
cannot drive USB/network ESC/POS printers, cash drawers or card terminals.

**Decision:** Every venue runs an **edge node** — a small always-on machine on
the venue LAN (mini PC such as Intel N100, or Raspberry Pi 5 with SSD, on a UPS).
The edge node:

1. **Serves the PWA** (same build as the cloud) over the LAN, so tablets load it
   from `http://pos.local` and install it as a PWA.
2. **Owns the local source of truth** — SQLite database for the venue.
3. **Exposes the local API** consumed by tablets/KDS (relative `/api`).
4. **Bridges hardware** — ESC/POS printers, cash drawer kick, card terminal.
5. **Runs a sync worker** that pushes/pulls via an outbox/inbox to the cloud
   whenever internet is available.

The cloud is a **control plane**: tenant/venue management, catalog publishing,
aggregated reporting, backups, remote monitoring. It is never on the critical
path for taking an order or payment.

```
Tablets / KDS ──LAN──▶ Edge node (venue)              ──internet──▶ Cloud (optional)
 (browser PWA)         • serves PWA assets               • multi-tenant control plane
                       • local API + SQLite              • sync, backups, remote reports
                       • device bridge (printer,
                         drawer, card terminal)
                       • sync worker (outbox)
```

**Consequences:**

- Offline-first and shared multi-device state both work.
- Hardware integration is reliable (native libs on the edge, not WebUSB).
- Adds per-venue hardware cost, provisioning, updates and backups — mitigated by
  Docker images, auto-update, and cloud backup on reconnect.
- The PWA must be built to talk to a **relative** `/api` so the same bundle works
  on LAN and (for admin views) in the cloud.
- A venue can operate with **zero cloud** if needed; cloud sync is additive.

---

## ADR-003 — TypeScript monorepo

**Status:** Accepted

**Context:** PWA, edge node and cloud share domain logic (money, tax, order
state machine, validation) and types.

**Decision:** pnpm workspaces + Turborepo with packages:
`apps/web`, `apps/edge`, `apps/cloud`, `packages/db` (Kysely interface +
migrations), `packages/domain` (pure logic), `packages/contracts` (Zod/OpenAPI),
`packages/ui`, `packages/config`.

**Consequences:** Shared code must stay environment-agnostic in `domain`/
`contracts`. Enforce package boundaries with lint rules. Turborepo caching
keeps CI fast.

---

## ADR-004 — PWA frontend

**Status:** Accepted

**Context:** Primary device is a tablet; we want installability and no app-store
friction.

**Decision:** React 19 + Vite SPA, `vite-plugin-pwa` for service worker and
install, TanStack Router for routing, TanStack Query with IndexedDB persistence
(Dexie) for optimistic/local caching. Offline shell served by the edge node.
WebUSB considered only as an optional Android fallback, never the primary path.

**Consequences:** No SSR (not needed for POS). Must design explicit offline/online
and sync-status UI. Cache invalidation and optimistic updates need care on money
flows.

---

## ADR-005 — Data model and sync

**Status:** Accepted

**Context:** Local-first with eventual cloud sync; must avoid lost orders and
double-charged payments across outages.

**Decision:**

- IDs are **ULIDs** generated on the edge (sortable, offline-safe).
- Orders/payments are **append-only event streams** (state transitions recorded,
  not overwritten). Catalog/config is server-authoritative with LWW on sync.
- All mutating endpoints accept an **idempotency key**; payments are idempotent
  by design.
- Edge keeps an **outbox** of local mutations; cloud applies them idempotently
  and returns an **inbox** of server changes. Track sync cursors per device/venue.
- Money stored as **integer minor units** (KES cents) — never floats.
- Every row is **tenant-scoped** (`tenant_id`), venues scoped under tenant.
- Types are **portable across SQLite/Postgres/MySQL**: ULID `char(26)`, `bigint`
  money, `text` JSON, UTC timestamps; no reliance on `RETURNING` or native enums;
  upserts via Kysely `onConflict`.
- Start with a custom outbox/inbox sync; only evaluate **self-hostable OSS**
  engines if conflict volume justifies it (no paid sync service).

**Consequences:** More upfront work than a CRUD app, but correctness under
outage is the core promise. Requires disciplined migrations across SQLite,
Postgres and MySQL/MariaDB (ADR-015). Conflict rules must be documented per
entity.

---

## ADR-006 — Money, tax and rounding

**Status:** Accepted

**Context:** Financial correctness across splits, discounts, tips and VAT.

**Decision:** Integer minor units everywhere. VAT default 16% (Kenya),
configurable per venue and per item. Tax computed at bill/line level with a
documented rounding policy (round half up at the smallest unit, aggregated per
tax group). Splits allocate rounding remainder deterministically so the sum of
parts equals the whole. Tips and discounts are explicit line/bill adjustments
with audit entries.

**Consequences:** Domain package owns all arithmetic and is heavily unit-tested.
No money math in UI components.

---

## ADR-007 — Devices: printing, drawer, scanner, KDS

**Status:** Accepted

**Context:** Browsers cannot send raw ESC/POS or kick a cash drawer reliably.

**Decision:** The edge node exposes a **device bridge** (local HTTP + WebSocket):

- **Receipt printer:** ESC/POS via `node-thermal-printer` (USB/serial/network
  TCP 9100); 80mm receipts, 58mm fallback.
- **Cash drawer:** kick via printer ESC/POS pulse command.
- **Barcode scanner:** keyboard-wedge; the PWA captures keystrokes, no driver.
- **KDS:** another browser client on the LAN subscribed to the edge (WebSocket)
  for live tickets and status changes.
- **PDQ card terminal:** vendor SDK/HTTP hosted on the edge; PWA calls the bridge.

Print jobs are queued on the edge and retried; a failed print is surfaced, never
silently dropped.

**Consequences:** Device support is per-venue configuration (printer model,
connection, station routing). Need a small admin UI for device setup and test
prints.

---

## ADR-008 — Payments (Kenya-first)

**Status:** Accepted

**Context:** Most customers pay via M-Pesa; card terminals vary; internet may be
down at the venue.

**Decision:** Multiple payment methods with graceful degradation:

1. **Cash** — always works offline.
2. **Manual M-Pesa reference** — cashier records the customer's M-Pesa code;
   verification/reconciliation happens later (cloud or on reconnect). Works when
   the venue has no internet (the customer's phone does).
3. **Daraja STK Push** — Lipa na M-Pesa Online; requires the venue to reach
   Safaricom. Initiated via edge→cloud or edge→Daraja; callbacks validated and
   idempotent. Degrades to manual reference on failure.
4. **PDQ card terminal** — integrated through the edge device bridge; the
   terminal owns card capture so we stay out of PCI scope. Terminal connectivity
   is its own. Support three modes so any client terminal works: **integrated**
   (POS drives the terminal), **semi-integrated** (POS sends amount, terminal
   captures, result confirmed), and **standalone** (cashier records terminal ID,
   approval code, RRN/STAN and last4).

M-Pesa and PDQ are additive: cash and M-Pesa must keep working if the PDQ
terminal or its network is down, and vice versa. Daraja credentials and PDQ
credentials are stored per tenant, encrypted at rest, never in the client. All
payment attempts are recorded with provider refs, status and an audit trail. See
[`PAYMENTS.md`](./PAYMENTS.md) for the full method matrix and data model.

**Consequences:** Payment state machine must model pending/confirmed/failed/
cancelled/reversed. Reconciliation reports are essential. Daraja sandbox + rate
limits shape testing; PDQ settlement batches shape card reconciliation.

---

## ADR-009 — Multi-tenancy, auth and RBAC

**Status:** Accepted

**Context:** One SaaS serving many businesses, each with venues and staff.

**Decision:** Tenant → Venue → Membership model. Every query is tenant-scoped in
**app code** (mandatory) — this is the primary control. Postgres RLS is an optional
PG-only extra; MySQL has no equivalent, so never depend on it. Auth via Better
Auth: **PIN** login on POS terminals (fast), email/OTP for admins. Roles: Owner,
Manager, Cashier/Waiter, Kitchen, Platform Admin. Sensitive actions (voids,
discounts, refunds, shift close) require elevated roles and are audited.

**Consequences:** Tenant isolation must be tested explicitly on both dialects.
PIN sessions are device-bound and short-lived. Audit log is append-only.

---

## ADR-010 — Deployment, updates and backups

**Status:** Accepted

**Context:** Venues are non-technical environments; edge nodes need to be
maintained remotely.

**Decision:** Everything ships as **Docker images**. Edge node runs Docker
Compose (app + SQLite volume + watchdog). Auto-update via signed image tags with
rollback. Cloud runs on a **VPS via Docker** with Postgres or MySQL (both free);
PHP-only shared hosting is **not** a cloud target. Background work uses a
DB-backed queue triggered by cron — no Redis or WebSockets required in cloud.
Backups: local snapshot + encrypted upload to cloud on reconnect. Health/heartbeat
telemetry to cloud with venue consent. Recovery runbook documented before launch.

**Consequences:** Requires image signing, migration safety, and a remote-support
path. Edge devices must survive power loss (UPS) and reboot unattended. The only
expected recurring cost is the VPS (ADR-016).

---

## ADR-011 — Distribution: hosted demo + self-hosted edge, shippable from day one

**Status:** Accepted

**Context:** We want a public link people can try instantly, _and_ a
download-and-run bundle that works out of the box on real venue hardware. GitHub
Pages is static-only, so it cannot host the edge server, drive printers, or hold
shared multi-device state. Shipping must be a first-class concern, not a
post-launch chore.

**Decision:** One codebase, **two first-class modes**, selected at build/runtime:

1. **Hosted mode** — static build published to GitHub Pages (and any static
   host). Client-only: IndexedDB (Dexie) persistence, optional cloud API via
   config, seeded demo data. No printers, no shared LAN state, no server
   lifecycle controls — edge-only UI is feature-detected and hidden. Clearly
   labelled as a demo/standalone mode.
2. **Edge mode** — the same bundle served by the venue edge node over LAN. Full
   features (printers, drawer, KDS, shared tables, server lifecycle).

Mode detection: build-time `VITE_APP_MODE`, confirmed at runtime by probing
`/api/health` (present ⇒ edge). Data access goes through a **repository
interface** with two adapters (IndexedDB vs edge API); feature flags gate
edge-only capabilities.

**Releases (GitHub Releases) publish:**

- Hosted static zip + deployed Pages site.
- Edge bundle: Docker Compose + `start.sh` / `start.bat` / `start.ps1` launcher
  (checks Docker, bootstraps `.env`, seeds, starts, prints LAN URL + QR),
  `.env.example`, checksums, changelog.
- Optional future: single-binary edge (Bun/Node SEA) for non-Docker venues.

**Consequences:** Requires a storage abstraction and a feature-flag layer from
Phase 0. Base path must be configurable for Pages subpaths (router basename,
`import.meta.env.BASE_URL`, correct service-worker scope). Hosted mode must never
imply hardware or server controls. Test matrix covers both modes.

---

## ADR-012 — Version awareness and remote updates

**Status:** Accepted

**Context:** Installed PWAs and edge nodes go stale silently. Users must learn
about improvements and apply them safely without losing an open bill.

**Decision:**

- **Version injection:** build injects `__APP_VERSION__` = semver + git SHA +
  build time. Served at `/version.json` (static) and `/api/version`
  (`{ app, edge, schema, build }`).
- **PWA updates:** `vite-plugin-pwa` with `registerType: 'prompt'`. Poll for
  updates on an interval (default 15 min) and on focus/visibility. Show a
  **non-blocking banner** ("Update available — what's new"). **Never force a
  reload while a bill/order is open**; defer until idle, then offer
  "Update & reload". Manual "Check for updates" in Settings. Service worker
  precache keeps the splash/offline shell current.
- **Edge updates:** edge checks a signed image registry for newer tags; notifies
  admins and can auto-update in a configurable window (default: outside service
  hours) with automatic rollback on failed health checks.
- **Cloud:** signed releases, staged rollout, rollback.
- **Changelog** surfaced in the update prompt.

**Consequences:** Needs safe-reload logic tied to open orders/shifts, schema
compatibility checks between edge and app versions, and version telemetry. Update
UI must be testable in both hosted and edge modes.

---

## ADR-013 — Startup and splash experience

**Status:** Accepted

**Context:** First paint on a tablet should feel intentional and work offline,
including on cold start from the installed icon.

**Decision:**

- **OS-level splash:** web app manifest with name, icons (192/512/maskable),
  `theme_color`, `background_color`; iOS `apple-touch-startup-image` set per
  resolution plus `apple-mobile-web-app-capable`.
- **In-app splash:** logo, app version, and live status ("Starting…", "Offline",
  "Connecting to server"). Shown until local DB opens, auth is restored and the
  shell is ready; minimum ~600 ms to avoid a flash; fades out.
- Splash assets are **precached** so they render offline. If the edge is
  unreachable in edge mode, splash transitions to a retry/offline state rather
  than hanging (network probe has a timeout).

**Consequences:** Need an asset pipeline for many splash sizes; keep the splash
tiny and fast; never block startup on a network call.

---

## ADR-014 — Server lifecycle controls (restart / shut down)

**Status:** Accepted

**Context:** Operators need to stop the venue edge server deliberately (maintenance,
relocation, power-down) without exposing a dangerous control in normal UI.

**Decision:**

- Located in **Settings → Danger Zone** (deliberately out of the way), hidden in
  hosted mode: **Restart service** and **Shut down server**.
- Backed by `POST /api/system/restart` and `POST /api/system/shutdown`, which
  require an elevated role (Owner/Manager), **PIN re-authentication**, and a
  typed confirmation phrase.
- Blocked (or explicitly forced with an audit entry) when there are open bills or
  an active shift.
- Shutdown is **graceful**: stop accepting work, flush the sync outbox, close
  printer connections, checkpoint SQLite, then exit.
- Docker restart policy is `no` for the app service so shutdown stays down;
  restarting requires a power cycle or `docker compose up -d`. The UI shows a
  **"Server stopped"** screen with restart instructions afterwards.
- Every lifecycle action is written to the audit log.
- Endpoint is LAN/loopback-only and rate-limited.

**Consequences:** The PWA loses its backend after shutdown (expected). Remote
restart needs out-of-band access; cloud "wake" is not guaranteed. A maintenance
mode (soft stop, no process exit) may be added later.

---

## ADR-015 — Multi-dialect cloud DB (Kysely; Postgres or MySQL)

**Status:** Accepted

**Context:** A deployment may have Postgres or only MySQL/MariaDB (shared hosts
commonly ship MySQL; a VPS may run either). The edge runs SQLite. Drizzle schemas
are dialect-specific, so supporting all three would mean three schema trees and
three migration sets.

**Decision:**

- Standardize on **Kysely** for the data layer across edge (SQLite), cloud
  (Postgres) and cloud (MySQL/MariaDB).
- Cloud dialect is selected at runtime by `DB_DIALECT=postgres|mysql`; one
  `Database` interface and one set of code-based migrations.
- Drivers: `better-sqlite3` (edge), `pg` and `mysql2` (cloud) — pure-JS cloud
  drivers, no native builds on the host.
- Target **MySQL 8+ / MariaDB 10.6+**.
- **Portability rules:** ULID PKs as `char(26)` with binary/ASCII collation (or
  always uppercase); money `bigint`; JSON as `text`; UTC timestamps; no reliance
  on `RETURNING` or auto-increment; no native enums; no partial indexes; no
  `jsonb` operators; upserts via `onConflict`; normalize driver return types.
- CI runs migrations and isolation/sync tests against **both** Postgres and
  MySQL/MariaDB; edge tests on SQLite. `kysely-codegen` checks interface drift.

**Consequences:** True runtime portability with one query layer and no schema
duplication. We give up Drizzle's schema-as-code DX and must hand-maintain (or
generate) the DB types. Some PG-only niceties (RLS, `jsonb` queries) are off the
table for portable code.

---

## ADR-016 — Zero-cost baseline (no paid dependency to start)

**Status:** Accepted

**Context:** The project must not require a paid database, ORM, sync service or
status product to run. Drizzle and Kysely are both MIT-licensed and free; the
paid question is hosting, not the ORM.

**Decision:**

- The MVP runs with **no paid service**: OSS libraries, free DB engines
  (SQLite/Postgres/MySQL), free GitHub Pages demo, free Let's Encrypt TLS, and
  the custom outbox sync.
- No paid managed DB, hosted sync engine, or paid uptime/status service. If a
  free tier is used temporarily as a bridge, it must be documented and
  replaceable.
- The **VPS is the only expected recurring cost** (when cloud is enabled).
  Optional extras (domain, status page) use free/OSS options — e.g. self-hosted
  Uptime Kuma.
- Until the VPS exists, ship **edge-only** at zero cloud cost; cloud sync is
  additive and deferred (ADR-010).

**Consequences:** Cloud launches when the VPS is available rather than relying on
shared hosting (PHP-only hosts cannot run the Node API). Any new paid dependency
requires an ADR and explicit approval. Free-tier usage must not become a hidden
production dependency.

---

## ADR-017 — Visual identity: token-based luxury dark green (Proposed)

**Status:** Proposed (starting direction, not locked)

**Context:** The product needs a distinctive luxury hospitality look that still
serves speed, glanceability and offline operation. We want a direction that can
evolve without rewriting screens, and we want to allow restrained neon accents
without drifting into a gaming aesthetic.

**Decision:**

- Adopt a **luxury dark green** visual identity: deep forest green/charcoal
  surfaces, warm ivory text, controlled green accents, independent status
  colours. The light theme is a deliberate warm palette, not an inverted dark.
- Implement as **semantic design tokens** in `packages/ui` (CSS variables →
  Tailwind → shadcn aliases). Components never hardcode hex.
- Allow an **optional neon accent layer, dark theme only**, restricted to
  active/alert moments; never a status colour and never on large surfaces.
- No purple/violet/magenta brand colours.
- Accessibility gates: normal text ≥4.5:1, large ≥3:1, UI components ≥3:1;
  status always paired with icon/text; reduced-motion respected.
- Values are **defaults** and may be tuned; the direction is recorded here, the
  exact palette lives in `docs/VISUAL-IDENTITY.md`.

**Consequences:** Screens stay consistent and rebrandable via tokens. Design
changes need contrast checks and a doc update, not component rewrites. A future
brand overhaul supersedes this ADR.

---

## ADR-018 — Desktop distribution: PWA app window + no-console shortcuts

**Status:** Accepted

**Context:** Users must be able to start the POS from a desktop shortcut without
ever seeing a command prompt or terminal.

**Decision:**

- The desktop app is the PWA running in a Chrome/Edge **app-mode window**, served
  by the local edge. A native Tauri wrapper is optional later.
- Every release ships launchers + installers for:
  - **Linux** — `.desktop` with `Terminal=false`.
  - **Windows** — `wscript.exe` + hidden PowerShell (no console).
  - **macOS** — a `.app` bundle (no Terminal).
- The launcher starts the edge via Docker Compose, or a branded preview before
  the app exists, waits for `/api/health`, opens the app window, and logs to a
  file. It never opens a console.
- `POS_NO_OPEN=1` allows headless testing of launchers.
- The requirement is documented in `docs/DESKTOP.md` and enforced by a release
  checklist item.

**Consequences:** Users get a familiar double-click experience on every OS.
Packaging adds per-OS assets to every release. A future native wrapper only
replaces the window shell, not the launcher logic.

---

## ADR-019 — Auth: edge PIN sessions first, Better Auth later

**Status:** Accepted

**Context:** Venue staff log in with a short PIN after selecting their name on a
shared tablet. The edge must authenticate with no internet. Better Auth assumes
globally unique usernames/emails and is strongest for email/OAuth flows; staff
codes are only unique **within a tenant**, and PIN login is a tenant-scoped staff
pick, not a global account login.

**Decision:** Ship a small, auditable auth layer in `packages/auth` for the edge:

- PINs hashed with scrypt (per-user salt); 4–8 digit format.
- Login is `tenant_id` + `user_id` + PIN; the user must belong to the tenant.
- Sessions are random 256-bit tokens stored **hashed** (SHA-256) in a `sessions`
  table, with `tenant_id`, `user_id`, optional `device_id`, expiry (12h) and
  revocation. Logout revokes the row.
- Delivery is an `httpOnly`, `SameSite=Lax` cookie (Bearer accepted for API
  clients); roles come from the user's membership and are normalized
  (`owner`/`manager`/`cashier`/`waiter`/`kitchen`).
- Tenant-scoping middleware resolves the session tenant; routes never accept a
  tenant id from the request body for scoped data.

Better Auth remains the plan for **cloud admin** email/OTP and future OAuth. It
is not a dependency of the edge login path.

**Consequences:** We own rate limiting, CSRF and security review for PIN login.
No social/OAuth on the edge. The session table is portable across SQLite,
Postgres and MySQL, and can later be bridged to Better Auth for cloud admins.

---

## ADR-020 — Menu and order prices are VAT-inclusive

**Status:** Accepted

**Context:** Kenyan hospitality prices are normally displayed to the customer as
the amount to pay, including VAT. Order bills also need a subtotal/tax/total
breakdown, and different menu items may carry different tax rates later.

**Decision:**

- Menu items and per-venue price overrides are stored as **VAT-inclusive** minor
  units; each item carries a `tax_rate` (default 16).
- Order line totals and the order total are VAT-inclusive. `orderTotals()` in
  `packages/domain` derives the net and VAT components per line with
  `extractVAT()`.
- The edge stores `subtotal_minor` (net), `tax_minor` and `total_minor`
  (gross) on each order.
- No exclusive-tax display mode ships in Phase 1. If a future market needs it,
  add an explicit tax-basis field rather than reinterpreting prices.

**Consequences:** The price shown on the menu is the price charged; the bill
breakdown is derived and testable. Tax-rate changes must be explicit per item,
and rounding is handled centrally in `packages/domain`.

---

## ADR-021 — Order mutations are idempotent

**Status:** Accepted

**Context:** Tablets retry requests when the LAN drops or a response is lost.
Order creation must not create duplicate orders or double-occupy a table, and
status retries must not fail just because the first response was lost.

**Decision:**

- `POST /api/orders` accepts an optional client-generated `idempotency_key`
  (8–128 chars). The key is stored on the order and is unique per tenant.
- Replaying the same key returns the existing order instead of creating a new
  one. A key reused for another venue returns `409 idempotency_conflict`.
- `POST /api/orders/:id/send` returns the order when it is already at or beyond
  `sent`; repeating a status transition returns the order when it is already in
  that state.
- The PWA generates one key per cart and rotates it whenever the cart changes,
  so a network retry reuses the key while a genuinely new order gets a new one.

**Consequences:** Order creation is safe to retry on flaky venue WiFi. The
outbox worker can later reuse the same keys when replaying queued mutations.
The unique index allows multiple `NULL` keys for older rows and imports.

---

## ADR-022 — Open tabs append rounds; item status drives firing

**Status:** Accepted

**Context:** A table stays open across several rounds. Waiters need to reopen an
occupied table, add drinks or dessert, and fire only the new items without
resending food that is already in the kitchen.

**Decision:**

- `POST /api/orders/:id/items` appends a round to any non-closed, non-voided
  order. New lines start as `pending`.
- `POST /api/orders/:id/send` fires only `pending` items. From `open` it also
  moves the order to `sent`; from a later state it keeps the order state so a
  kitchen progress state is not regressed.
- Appends carry an optional idempotency key stored on the `items_added` event,
  unique per tenant. Replaying the same append returns the existing order.
- The PWA reopens a tab from the floor or the open-orders list, shows the
  existing bill read-only, and treats the cart as the next round.

**Consequences:** Item-level status is the source of truth for kitchen rounds;
order-level status is the overall tab state. KDS routing can consume pending
items per station without reprinting earlier rounds.

---

## ADR-023 — Courses are item metadata used for firing

**Status:** Accepted

**Context:** Restaurants and bars fire starters before mains and send drinks
separately. The kitchen needs round-level control without splitting the tab.

**Decision:**

- Each menu item has a `course` (`starter`, `main`, `dessert`, `drink`,
  `other`), defaulting to `main`. Order items snapshot it at sale time.
- `POST /api/orders/:id/send` accepts an optional `course`. With a course, only
  pending items of that course are fired; without one, all pending items fire.
- The order state transitions to `sent` on the first firing and keeps its later
  state when additional courses are fired.
- The PWA labels menu and cart items by course and exposes a “Fire course”
  selector.

**Consequences:** Kitchen rounds can be staged from one tab. Item status remains
the source of truth for what has been fired; course is immutable on the order
line so later menu edits do not reshuffle existing tickets.

---

## ADR-024 — Table moves and merges are audited mutations

**Status:** Accepted

**Context:** Guests change tables or ask to combine bills. The floor status must
stay consistent, and a retry after a dropped response must not move a tab twice
or merge it twice.

**Decision:**

- `POST /api/orders/:id/move` accepts a target table (or `null` for takeaway),
  frees the old table, occupies the new one and records a `moved` event.
- `POST /api/orders/:id/merge` moves all source items into the target order,
  recomputes the target total, closes the source order, frees its table and
  records `merged_out` / `merged_in` events.
- Both endpoints accept an optional idempotency key stored on the target event;
  replays return the resulting order.
- The PWA exposes both actions on an open tab and refreshes the floor on
  completion.

**Consequences:** The floor view can be derived from table status plus active
orders. Merged tabs keep the target order number while both original numbers
remain in the audit trail.

---

## ADR-025 — PWA writes are optimistic and queued locally

**Status:** Accepted

**Context:** Venue WiFi and the edge box can blink mid-service. A waiter must not
lose an order because a fetch failed, and creating an order then firing it in
two calls creates a dependency that is hard to replay safely.

**Decision:**

- Order creation accepts a client-generated `id`; append accepts a combined
  `send` flag plus optional `course`, so one queued mutation can both save and
  fire the right items.
- The PWA writes every order mutation to a localStorage outbox first, then
  flushes sequentially on demand, on `online`, on focus and on a timer.
- Each queued request carries an idempotency key; server replays return the
  original result, so retries never duplicate orders or rounds.
- The UI renders the resulting order optimistically and shows a queued count in
  the top bar. The floor refreshes when the queue drains.

**Consequences:** A dropped LAN response no longer blocks the waiter. The
outbox is edge-only for now; the cloud sync worker can later consume the same
records. Failed requests stay queued and are surfaced through the queued count.

---

## ADR-026 — VAT-inclusive bills, untaxed tips and queued receipts

**Status:** Accepted

**Context:** Bills need discounts, tips and splits without losing the VAT
breakdown, and printers are optional local hardware that can be offline.

**Decision:**

- Discounts are allocated across VAT-inclusive lines by gross value using a
  largest-remainder method; VAT is re-derived per discounted line in
  `packages/domain`.
- Tips are added after tax and are not taxed. Splits use deterministic
  remainder allocation so the parts always sum to the payable amount.
- Receipts are rendered as 80mm text and ESC/POS bytes in `packages/domain`.
- The edge enqueues print jobs in SQLite and sends ESC/POS bytes to a raw TCP
  printer (`PRINTER_HOST`/`PRINTER_PORT`). Drawer kick is an ESC/POS pulse.
- Failed jobs stay visible in the PWA and can be retried without reprinting
  successful jobs.

**Consequences:** Bill math is testable without a printer. A missing printer
does not block selling; it produces a visible failed job. Station routing and
item/seat splits remain open for the KDS milestone.

---

## ADR-027 — Payments are append-only attempts with idempotent transitions

**Status:** Accepted

**Context:** Cash, M-Pesa references and PDQ approvals are recorded on a venue
LAN that may lose connectivity. A retry must not charge twice or overwrite
money history.

**Decision:**

- Each attempt is an append-only `payments` row with a tenant-unique
  idempotency key; transitions are separate `payment_events` rows.
- Cash confirms immediately. Manual M-Pesa and PDQ standalone start `pending`
  and are confirmed by an owner/manager. A PDQ attempt with an approval code
  records that reference without storing card data.
- Reversals are new events with a required reason; confirmed attempts are never
  edited or deleted.
- Outstanding is derived from confirmed payments only. Reconciliation groups
  attempts by method into expected, captured, pending and reversed totals.
- The PWA queues payment writes through the same outbox as orders.

**Consequences:** Money history is auditable and retry-safe. Daraja STK and
integrated PDQ remain online-only additions behind the same model.

---

## ADR-028 — Daraja credentials are encrypted per tenant

**Status:** Accepted

**Context:** STK Push needs consumer keys/secrets, a shortcode and a passkey.
These differ per tenant and must never reach the browser or logs.

**Decision:**

- Credentials are stored in `payment_credentials` as AES-256-GCM ciphertext.
  The key comes from `POS_SECRET_KEY`; without it a process-local random key is
  used for development.
- Only metadata (provider, environment, timestamps) is returned by the API.
- STK attempts start `pending`; a validated callback confirms or fails them by
  `CheckoutRequestID`. Unknown callbacks are rejected.
- Pending STK attempts older than two minutes are queried on an interval, with
  idempotent events so a late callback cannot double-confirm.

**Consequences:** A missing or wrong `POS_SECRET_KEY` makes saved credentials
unreadable after restart; production deployments must set it. Callbacks remain
tenant-scoped through the payment attempt rather than a client-supplied tenant.

---

## ADR-029 — Live tickets use SSE instead of WebSockets

**Status:** Accepted

**Context:** KDS tickets and waiter views need sub-second updates on the venue
LAN, but the edge already speaks HTTP and the zero-cost baseline avoids extra
runtime dependencies.

**Decision:**

- The edge publishes in-memory domain events for order mutations.
- `GET /api/kds/events` exposes them as Server-Sent Events, filtered by venue
  and station, with heartbeats and cleanup on disconnect.
- The PWA uses `EventSource` to refresh KDS and floor views. Writes still go
  through the outbox, so a queued change refreshes on flush as well.
- Station routing is snapshotted onto each order item at sale time, so later
  menu edits do not move existing tickets.

**Consequences:** Live updates need no WebSocket package or proxy upgrade.
SSE is one-way, which is sufficient for notifications; mutations continue over
normal HTTP. Multi-process edge deployments would need a shared event bus.

---

## ADR-030 — Shifts scope sales attribution and cash balancing

**Status:** Accepted

**Context:** Owners need to know who sold what and whether the cash drawer
balances at the end of a service, without a cloud service or spreadsheets.

**Decision:**

- A shift is opened by one staff member per venue; the edge rejects a second
  open shift for the same user and venue.
- Orders store `opened_by` and payments store `created_by`; the Z-report scopes
  both to the shift window and the staff member.
- Discounts, order voids, payment reversals and order close are role-gated.
  Discounts persist on the order with a reason and an audit event.
- Cash variance is counted cash minus confirmed cash payments. CSV export
  includes only non-sensitive payment references.

**Consequences:** Shift reports are reproducible from append-only order and
payment history. Multi-staff venues create one shift per staff member; a
manager can close another staff member's shift.

---

## Open decisions (not yet resolved)

- PDQ vendor/bank (e.g. local acquirer, Pesapal, DPO) and protocol (LAN/SDK/
  HTTP); determines whether integrated mode is feasible or standalone ships
  first. M-Pesa shortcode type (Till vs Paybill) and C2B validation.
- VPS provider + DB engine (Postgres vs MySQL); confirm MySQL 8+/MariaDB 10.6+.
- Whether KDS is in the first sellable release or phase 2 (hardware was selected,
  module routing is adjacent to ordering).
- Tip handling: pre-tax vs post-tax, and service-charge rules.
- Multi-currency and multi-language timing.
- Sync engine: custom outbox vs a self-hostable OSS engine once volume is known
  (no paid sync).
- Subscription billing for tenants (plans, trials, dunning) — later phase.
- Optional status page (self-hosted Uptime Kuma) and domain name.
- Final logo, brand font, gradient recipes and chart palette (see
  `VISUAL-IDENTITY.md`).
