# Stack

Practical reference. Rationale and tradeoffs live in [`DECISIONS.md`](./DECISIONS.md).

## At a glance

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) | One language across web, edge, cloud |
| Runtime | Node.js 24 LTS | Edge + cloud; pure-JS drivers on cloud |
| Package manager | pnpm 10 | Workspaces |
| Monorepo | Turborepo | Cached builds/tests |
| Web | React 19 + Vite + TanStack Router + TanStack Query | SPA, PWA |
| UI | Tailwind CSS + shadcn/ui | Touch-first; see [`UI.md`](./UI.md) |
| PWA | vite-plugin-pwa (Workbox) + Dexie | Hosted mode / cache |
| Edge API | Hono + Kysely + SQLite (`better-sqlite3`) | Venue LAN server |
| Cloud API | Hono + Kysely + Postgres (`pg`) or MySQL (`mysql2`) | `DB_DIALECT` |
| Migrations | Kysely `Migrator` (code-based) | One set, all dialects |
| Contracts | Zod + OpenAPI | Typed boundaries |
| Auth | Better Auth (PIN + email/OTP) | Device-bound PIN sessions |
| Jobs | DB-backed queue + cron (cloud); in-process (edge) | No Redis required |
| Payments | Daraja STK Push, manual M-Pesa ref, PDQ card-terminal bridge | Kenya-first; see [`PAYMENTS.md`](./PAYMENTS.md) |
| Printing | ESC/POS via edge device bridge | USB/serial/TCP 9100 |
| Testing | Vitest + Playwright + MSW | Money/sync/tenant isolation |
| Observability | Pino + Sentry + audit log | Append-only money trail |
| CI/CD | GitHub Actions + Docker | Dual-dialect matrix |
| Hosting | Pages (demo) · Docker edge · VPS cloud | Zero paid dependency |

## Runtime topology

```
Tablets / KDS ──LAN──▶ Edge node (venue)                 ──HTTPS──▶ Cloud (VPS, optional)
 (browser PWA)         • serves PWA assets                  • tenant/venue control
                       • Hono API + SQLite                  • sync inbox/outbox
                       • device bridge (printer/drawer)     • aggregated reports
                       • sync worker (outbox)               • backups, heartbeat
                       • in-process jobs                    • cron-driven jobs
```

Modes: **hosted** (static PWA, IndexedDB, demo) · **edge** (full POS on LAN).

## Repo layout (target)

```
apps/
  web/       React 19 + Vite PWA
  edge/      Hono + Kysely + SQLite + device bridge + sync
  cloud/     Hono + Kysely + Postgres/MySQL (control plane)
packages/
  domain/    pure money/tax/order/payment logic
  contracts/ Zod schemas + OpenAPI
  db/        Kysely interface + dialect factory + migrations
  ui/        shared React components (Tailwind + shadcn)
  config/    tsconfig, eslint, shared config
docs/        product/decision/task/stack/UI docs
docker/      Dockerfiles + compose (edge/cloud)
packaging/   desktop shortcuts, icons, launchers (Linux/Windows/macOS)
scripts/     launch + install helpers
```

## Local ports

| Service | Port |
| --- | --- |
| Web dev server | 5173 |
| Edge API | 4000 |
| Cloud API | 4001 |
| Postgres (docker) | 5432 |
| MySQL (docker) | 3306 |

## Environment variables

| Key | Where | Purpose |
| --- | --- | --- |
| `VITE_APP_MODE` | web build | `hosted` \| `edge` |
| `VITE_BASE_PATH` | web build | GitHub Pages subpath |
| `VITE_API_BASE` | web build | Optional cloud API base (hosted) |
| `PORT` | edge/cloud | Listen port |
| `DB_DIALECT` | cloud | `postgres` \| `mysql` |
| `DATABASE_URL` | edge/cloud | SQLite file / PG / MySQL URL |
| `SESSION_SECRET` | cloud | Session signing |
| `ENCRYPTION_KEY` | cloud | Encrypt per-tenant Daraja creds |
| `CRON_SECRET` | cloud | Auth for cron-triggered jobs |
| `CLOUD_SYNC_URL` | edge | Cloud endpoint (optional) |
| `CLOUD_TOKEN` | edge | Edge→cloud auth |
| `DEVICE_BRIDGE_TOKEN` | edge | Local bridge auth |
| `LOG_LEVEL` | all | Pino level |

Secrets never committed. Daraja credentials are **per tenant**, encrypted at
rest in the DB — not global env.

## Commands (planned; verify after scaffold)

```bash
pnpm install
pnpm dev            # web + edge + cloud
pnpm dev:web
pnpm dev:edge
pnpm dev:cloud
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:migrate     # Kysely migrations
pnpm db:generate    # optional kysely-codegen types
pnpm license:check  # zero-cost/OSS audit
pnpm docker:edge    # build/run edge image
```

## Deployment profiles

- **Hosted demo** — static build → GitHub Pages. IndexedDB, seeded data, no
  hardware, no lifecycle controls.
- **Edge** — Docker Compose on a venue mini PC (N100 / Pi 5 + SSD + UPS). Serves
  the PWA on the LAN; one-command launcher prints LAN URL + QR.
- **Cloud** — Docker on a VPS; Postgres or MySQL; cron for jobs; Let's Encrypt.
  Optional until the VPS exists.
- **Desktop** — every release ships a no-console launcher + desktop shortcut for
  Linux (`.desktop`, `Terminal=false`), Windows (`wscript` + hidden PowerShell)
  and macOS (`.app` bundle). See `docs/DESKTOP.md`.

## Version pins

Pin exact versions at scaffold time; these are the intended majors:

| Tool | Major |
| --- | --- |
| Node | 24 (LTS) |
| pnpm | 10 |
| React | 19 |
| Vite | 7 |
| TypeScript | 5 |
| Hono | 4 |
| Kysely | 0.28 |
| Zod | 4 |
| TanStack Query | 5 |
| Tailwind CSS | 4 |
| Vitest | 3 |

## Cost profile

Everything above is free/OSS. Recurring cost = **VPS only** (when cloud is on).
Optional domain/status page use free/OSS options (ADR-016).
