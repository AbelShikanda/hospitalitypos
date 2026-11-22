# Agent Guide

Operating rules for AI coding agents (and humans) working in this repo. Read
`GOAL.md` and `DECISIONS.md` first; pick work from `TASKS.md`.

## Non-negotiable rules

1. **Tenant-scope everything.** Every data access path filters by `tenant_id`
   (and `venue_id` where relevant). Add a test proving isolation for new queries.
2. **Money is integer minor units.** No floats, no money math in UI. All
   arithmetic lives in `packages/domain` with unit tests.
3. **Mutations are idempotent.** Anything that touches orders or payments takes an
   idempotency key and is safe to retry.
4. **Offline-first is the default.** A feature must work on the venue LAN with no
   internet, or explicitly document why it can't (e.g. Daraja STK Push).
5. **Never commit secrets.** Daraja keys, PDQ/terminal credentials and DB URLs
   live in env/secret stores, encrypted at rest, server-side only.
6. **Sessions are revocable and tenant-scoped.** Never log raw session tokens or
   PINs. Scoped routes take `tenant_id` from the session, never from the body.
7. **Append-only audit trail** for order and payment events. Never overwrite
   financial history — record transitions.
8. **Docs and code change together.** If you change architecture, update
   `DECISIONS.md`. If you change scope, update `GOAL.md`/`TASKS.md`.

## Target repo layout

```
hospitality-pos/
├─ apps/
│  ├─ web/          # React 19 + Vite PWA (served by edge on LAN)
│  ├─ edge/         # Hono + Kysely + SQLite + device bridge + sync worker
│  └─ cloud/        # Hono + Kysely + Postgres/MySQL (control plane)
├─ packages/
│  ├─ domain/       # pure logic: money, tax, order/payment state machines
│  ├─ contracts/    # Zod schemas + OpenAPI
│  ├─ auth/         # PIN hashing, sessions, roles (edge login)
│  ├─ db/           # Kysely interface + dialect factory + migrations (sqlite/pg/mysql)
│  ├─ ui/           # shared React components (Tailwind + shadcn)
│  └─ config/       # tsconfig, eslint, shared config
├─ docs/            # this folder
├─ docker/          # Dockerfiles + compose for edge/cloud
├─ packaging/       # desktop shortcuts, icons, launchers per OS
└─ scripts/         # launch + install helpers
```

## Commands (expected once Phase 0 lands)

> Verify these match `package.json` scripts before relying on them; fix this list
> if they drift.

```bash
pnpm install
pnpm dev            # run web + edge + cloud locally
pnpm dev:web        # web only
pnpm dev:edge       # edge node only
pnpm dev:cloud      # cloud only
pnpm build
pnpm lint
pnpm format         # prettier --write
pnpm format:check
pnpm typecheck
pnpm test           # Vitest
pnpm db:migrate     # run Kysely migrations
pnpm db:seed        # seed demo tenant/staff/menu/floor
pnpm docker:edge    # start edge via Docker Compose

# Planned, not yet implemented: pnpm test:e2e (Playwright)
```

## Working workflow

1. Read `GOAL.md`, `DECISIONS.md`, then the relevant `TASKS.md` phase.
2. Pick the highest-priority unchecked task; mark it in progress mentally/PR.
3. Check existing patterns in neighbouring packages before adding new libraries.
4. Write/adjust tests alongside code — especially money, tax, splits, sync,
   idempotency and tenant isolation.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` before declaring done.
6. Update `TASKS.md` (check the box) and `DECISIONS.md` if a decision was made.

## Commits and milestones

- Commit **small, complete milestones** as soon as they are done — never batch a
  whole phase into one giant commit.
- Use **Conventional Commits** with a scope: `feat(edge): add health endpoint`,
  `docs: add desktop shortcut guide`, `chore: scaffold pnpm workspace`,
  `test(domain): cover VAT rounding`.
- One logical change per commit. Review `git diff --cached` before committing.
- Tick the matching `TASKS.md` checkbox **in the same commit** that completes it,
  so the checklist always reflects reality.
- Stage specific paths (`git add <paths>`), never `git add -A` by habit.
- Never commit secrets, `.env` files, build output or generated artifacts.

## Conventions

- **Language:** TypeScript strict; no `any` without justification.
- **Validation:** all external input (HTTP, webhooks, env) parsed with Zod at the
  boundary; trust typed data internally.
- **Errors:** typed domain errors mapped to HTTP at the edge/cloud boundary; never
  leak secrets or stack traces to clients.
- **IDs:** ULIDs generated at the edge (`char(26)`, binary/ASCII collation or
  always uppercase); timestamps in UTC ISO-8601. Never rely on auto-increment.
- **Portable SQL:** one Kysely interface across SQLite/Postgres/MySQL; no
  `RETURNING`, native enums, partial indexes, `jsonb` operators or dialect-only
  functions; upserts via `onConflict`; normalize driver return types.
- **Zero-cost:** no paid service/dependency without an ADR (ADR-016).
- **Naming:** `kebab-case` files, `PascalCase` components/types, `camelCase`
  functions/vars, `SCREAMING_SNAKE_CASE` env keys.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`,
  `test:`, `chore:`). Small, focused commits.
- **Comments:** only where intent is non-obvious; no narrating the code.
- **Dual-mode:** access data through the repository interface, never import edge
  APIs into the hosted build; gate edge-only UI behind feature flags.
- **Versioning:** semver; inject version/build metadata at build time; never
  hardcode a version in source.
- **Base path:** use the router basename and `import.meta.env.BASE_URL`; no
  absolute `/` asset URLs (must work under a Pages subpath).
- **Updates:** never force a reload while a bill/order is open — defer until idle.
- **Lifecycle endpoints:** guarded (role + PIN re-auth + typed confirmation),
  audited, LAN/loopback-only, and hidden in hosted mode.
- **Design tokens:** use semantic tokens from `docs/VISUAL-IDENTITY.md`; no
  hardcoded hex in components. Brand green is not a status colour; neon is a
  dark-theme-only accent, never a status.

## Environment

- Local dev via Docker Compose (edge) + `.env.local` (never committed).
- Required services locally: SQLite (edge, file-based) and Postgres **or** MySQL
  (cloud, via Docker). No Redis required — jobs use a DB-backed queue + cron.
- Secrets: `.env.example` lists keys with fake values; real values stay out of git.

## Guardrails

- Do not introduce a new framework or major dependency without an ADR.
- Do not bypass the `domain` package for money/tax/order logic.
- Do not make the cloud a hard dependency for core selling flows.
- Do not store card data — delegate capture to the terminal/bridge.
- Do not "fix" a failing test by weakening the assertion without justification.
- Do not expose hardware or server-lifecycle controls in hosted (GitHub Pages)
  mode; feature-detect them.
- Do not force an update reload during an open bill; queue it until idle.
- Do not ship a release without a version bump, changelog entry and checksums.
- Do not use a paid service, managed DB, hosted sync or paid status product
  without an ADR (zero-cost baseline, ADR-016); prefer self-hostable OSS.
- Do not depend on Postgres-only features (RLS, `jsonb` operators, `RETURNING`);
  cloud must run on MySQL too.
- Do not hardcode colours; consume tokens from `docs/VISUAL-IDENTITY.md`.
- Do not use brand green for status semantics, or neon in the light theme / on
  large surfaces or body text.
- Every release must include a desktop shortcut; launchers must never open a
  console/terminal window (see `docs/DESKTOP.md`).
