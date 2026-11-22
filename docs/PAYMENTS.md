# Payments Architecture

Kenya-first, offline-first. Cash, **M-Pesa**, and **PDQ card terminals** coexist;
none replaces another. A venue can take any of them on day one, even with no
internet.

Related: ADR-008 (`DECISIONS.md`), Phase 3 (`TASKS.md`), money rules
(`AGENT.md`, `packages/domain`).

## Principles

- **Money is sacred.** Integer minor units, append-only attempts/events,
  idempotency keys, no silent failures.
- **Delegate card capture.** The PDQ terminal owns PAN/CVV; the POS never sees
  card data, keeping us out of PCI scope.
- **Degrade, never block.** Every online method has an offline/manual fallback.
- **Reconcile.** Expected vs captured vs pending is a first-class report, not an
  afterthought.
- **Per-tenant credentials.** Daraja and PDQ credentials are tenant-scoped,
  encrypted at rest, server-side only.

## Methods

| Code | Method | Works with no internet | Provider reference |
| --- | --- | --- | --- |
| `cash` | Cash | Yes | None |
| `mpesa_manual` | Customer pays, cashier records M-Pesa code | Yes | M-Pesa receipt code |
| `mpesa_stk` | Daraja STK Push (Lipa na M-Pesa Online) | No | Checkout/merchant request IDs |
| `pdq_card` | PDQ card terminal (integrated/semi-integrated/standalone) | Yes* | Approval code, RRN/STAN, terminal ID |

\* The PDQ terminal has its own connectivity; the venue LAN/internet is not
required for the card to be captured. Integrated modes still need the edge
bridge (LAN), not the internet.

Future (not MVP): M-Pesa C2B Paybill/Till validation, bank transfer, wallets,
store credit.

## M-Pesa

1. **Manual reference (default fallback).** Customer pays to the venue's
   Till/Paybill. Cashier enters the M-Pesa receipt code (and optional phone).
   Status starts `pending`; a manager confirms after checking the SMS/statement.
   This is the offline path and the fallback when Daraja is unreachable.
2. **Daraja STK Push.** Edge requests a push for the amount and phone; the
   customer enters their PIN. Status stays `pending` until the callback/query
   confirms it. Callbacks are validated, idempotent, and tied to the attempt.
   On timeout/failure, offer manual reference.

Per-tenant config: shortcode, passkey, consumer key/secret, callback URL,
environment (sandbox/production). Secrets never reach the browser.

## PDQ card terminals

"PDQ" is the card terminal used by the client's bank/acquirer. Vendors and
protocols vary, so support three modes behind one edge bridge:

1. **Integrated** — POS sends the amount to the terminal (LAN/SDK/HTTP); the
   terminal captures the card and returns an approval. Best UX, vendor-specific.
2. **Semi-integrated** — POS sends the amount, the cashier completes the card on
   the terminal, and the result is returned or confirmed in the POS.
3. **Standalone** — the cashier runs the PDQ independently and records the
   terminal ID, approval code, RRN/STAN, card brand and last4 in the POS.

Ship **standalone first** (works with any PDQ), then add integrated modes for the
client's specific vendor. The bridge reports terminal health and never blocks
cash/M-Pesa if the terminal is offline.

Store only non-sensitive references: terminal ID, approval code, RRN, STAN,
card brand, last4, amount. Never store PAN, CVV, track data, or PIN blocks.

## State machine

```
pending ──▶ confirmed ──▶ reversed
   │
   ├──▶ failed
   └──▶ cancelled
```

- `pending` — attempt recorded, awaiting cashier/provider/terminal.
- `confirmed` — money received (cash counted, M-Pesa code verified, PDQ approved).
- `failed` — provider/terminal declined or timed out.
- `cancelled` — abandoned before completion.
- `reversed` — refund/chargeback after confirmation.

Confirmed payments are never deleted or edited; reversals are new events.
Partial refunds are a later extension.

## Idempotency and offline behaviour

- Every attempt carries a client-generated `idempotency_key`, unique per tenant.
  Retries return the same attempt; the terminal is never charged twice.
- Cash, manual M-Pesa, and standalone PDQ are recorded locally on the edge and
  sync later. STK Push and integrated PDQ are attempted immediately and queued
  for reconciliation if the provider is unreachable.
- The edge outbox syncs attempts/events to the cloud; the cloud never initiates a
  charge on its own.

## Data model (intended)

| Field | Notes |
| --- | --- |
| `id`, `tenant_id`, `venue_id`, `order_id` | ULIDs; tenant-scoped |
| `method` | `cash` · `mpesa_manual` · `mpesa_stk` · `pdq_card` |
| `amount_minor`, `currency` | Integer minor units; `KES` |
| `status` | `pending` · `confirmed` · `failed` · `cancelled` · `reversed` |
| `idempotency_key` | Unique per tenant |
| `provider_ref` | M-Pesa receipt or PDQ approval/RRN |
| `details` | JSON: M-Pesa phone/checkout IDs or PDQ mode/terminal/STAN/last4 |
| `created_at`, `confirmed_at`, `created_by` | UTC timestamps + staff |
| `payment_events` | Append-only transitions with actor and reason |

## Reconciliation

- **PDQ:** compare POS attempts with the terminal/bank settlement batch; flag
  missing or mismatched approval codes.
- **M-Pesa:** compare manual codes and STK results with the M-Pesa statement.
- **Shift close:** payment mix (cash / M-Pesa manual / STK / PDQ), expected vs
  counted cash, and a Z-report.

## Security

- Daraja and PDQ credentials per tenant, encrypted at rest, server-only.
- Validate callback signatures/source and match to the attempt; reject replays.
- Audit every attempt, transition, reversal, and credential change.
- Never log full provider payloads containing secrets or card data.

## Open decisions

- Client's PDQ vendor/bank and protocol (LAN/SDK/HTTP) — determines whether
  integrated mode is feasible.
- M-Pesa shortcode type (Till vs Paybill) and whether C2B validation is needed.
- Auto-confirm manual M-Pesa via statement import vs manager confirmation.
- Refund flow: POS-initiated reversal vs record-only against the terminal.
