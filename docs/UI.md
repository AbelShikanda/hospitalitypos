# UI / Layout Guide

What to build, and what to hand the agent. This is a **recommended default**, not
a lock-in — replace it with your own design and the agent follows yours.

Colour, depth, type and neon accents are defined in
[`VISUAL-IDENTITY.md`](./VISUAL-IDENTITY.md) as semantic tokens (dark default +
light theme). This file covers layout, screens and interaction.

## Device targets

| Target | Assumption |
| --- | --- |
| **Tablet (primary)** | Landscape 1024×768 / 1280×800; portrait fallback |
| KDS | Landscape 720p/1080p, always-on |
| Back office | Desktop browser |
| Hosted demo | Responsive down to phone |
| Touch | Targets ≥ 44px, no hover-only actions |

## Design principles

- **Fast, glanceable, touch-first.** One-tap add; long-press for modifiers/void.
- **Money is loud.** Totals, tax and change are large and unambiguous.
- **State is always visible.** Online/offline, sync pending, printer status,
  shift state, update available.
- **Never block on the network.** Optimistic UI + a sync badge; no spinners on
  the selling path.
- **Guard destructive actions.** Voids, refunds, discounts, shift close, server
  shutdown require confirmation (and role/PIN where applicable).
- **Works with keyboard/scanner.** Barcode scanner is keyboard-wedge.

## App shell (edge + hosted)

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar: venue · staff · shift · sync/offline · update banner │
├──────────┬───────────────────────────────────────────────────┤
│ Nav rail │  Content area                                     │
│ Tables   │                                                   │
│ Orders   │                                                   │
│ Menu     │                                                   │
│ KDS      │                                                   │
│ Stock    │                                                   │
│ Reports  │                                                   │
│ Settings │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

- **Top bar** always shows: venue name, logged-in staff, shift status,
  online/offline + sync state, and a non-blocking update banner.
- **Left nav rail** on tablet landscape; **bottom nav** on portrait/phone.
- **Right panel** used for the cart/order context on wide screens.

## Screen inventory

| # | Screen | Layout pattern | Primary actions |
| --- | --- | --- | --- |
| 1 | Splash | Centered logo + version + status | (auto) |
| 2 | PIN login / staff select | Avatar grid + keypad | Select staff, enter PIN |
| 3 | Tables / floor plan | Area tabs + table grid (status colors) | Open table, move/merge |
| 4 | Order taking | 3-pane: category rail · item grid · cart | Add item, modifiers, send |
| 5 | Bill & split | Bill list + split controls + totals | Split, discount, tip, void |
| 6 | Payment | Method tiles + keypad | Cash, M-Pesa ref, STK, PDQ card |
| 7 | Receipt | Preview + print status | Print, reprint, done |
| 8 | KDS board | Columns or card queue, aging colors | Bump: preparing/ready/served |
| 9 | Shift open/close | Summary + cash count + Z-report | Open/close shift, export |
| 10 | Inventory | Table + detail drawer | Adjust, count, reorder level |
| 11 | Reports | KPI cards + charts + table | Date range, export CSV |
| 12 | Settings | Two-column sections | Devices, menu, staff, payments, danger zone |

### Key layouts

- **Order taking (screen 4):** left category rail → center item grid (large
  tiles) → right cart with line items, qty steppers, notes, totals, and a single
  prominent **Send / Charge** button.
- **Tables (screen 3):** grid of table cards showing number, seats, status, and
  open total. Status: free (neutral), occupied (blue), reserved (amber),
  attention (red), paid (green).
- **Payment (screen 6):** big method tiles; M-Pesa shows reference input and a
  "waiting for confirmation" state; PDQ card shows terminal status, approval
  code and last4.
- **KDS (screen 8):** tickets as cards with items, table, age timer; swipe/tap to
  advance status; sound/visual alert on new ticket.
- **Settings (screen 12):** grouped sections; **Danger Zone** at the bottom with
  restart/shutdown, behind confirmation.

## Overlays

- **Modals** for modifier selection, discounts, payment method, confirmations.
- **Bottom sheets** on portrait for cart and modifiers.
- **Toasts** for success/failure (print failed, sync pending, payment confirmed).
- **Full-screen states** for splash, PIN, and "Server stopped".

## Design tokens

Colour, depth, type and neon accents are defined in
[`VISUAL-IDENTITY.md`](./VISUAL-IDENTITY.md) as semantic tokens (dark default +
light theme). Components must consume those tokens — no hardcoded hex.

- **Spacing:** 4px base scale (4, 8, 12, 16, 24, 32, 48).
- **Radius:** `sm 6px`, `md 10px`, `lg 16px`.
- **Type:** UI 14–16px, headings 20–28px, **money/totals 28–40px tabular**.
- **Status:** use the status tokens (not brand green) for table/order/payment
  state; always pair with an icon or label.
- **Neon:** dark-theme-only accent for active/alert moments; never a status.
- **Currency:** KES, thousands separators; hide `.00` where sensible.

## Interaction rules

- One tap adds an item; long-press opens modifiers/void.
- Optimistic updates with a visible **pending** marker until the edge confirms.
- Update banner is non-blocking; **never reload with an open bill** — offer
  "Update & reload" when idle.
- Offline: keep working, show queued-sync count, never fake success.
- Print: show per-job status; surface failures with retry.
- Hosted mode: hide hardware, KDS, and server lifecycle controls; show a demo
  banner.

## Accessibility

- WCAG AA contrast; visible focus rings; labelled controls.
- Respect reduced motion; avoid motion on the money path.
- Large-text friendly; do not rely on color alone (pair with icons/labels).

## What to hand me (checklist)

Minimum viable handoff — any of these work:

- [ ] **Brand:** logo (SVG), primary/accent colors, font (or "use defaults").
- [ ] **Wireframes/sketches** for the 5 critical flows:
      1. PIN login → table
      2. Table → build order → send
      3. Bill → split → pay (M-Pesa/cash)
      4. KDS ticket lifecycle
      5. Shift close / Z-report
- [ ] **Screen list** — confirm the 12 above or add/remove.
- [ ] **Reference products** you like (screenshots/links).
- [ ] **Devices/orientation** and receipt width (58mm/80mm).
- [ ] **Language/currency** (default: English/KES).
- [ ] **Dark mode?** (default: light, dark-ready tokens).
- [ ] **Any must-have interactions** (e.g. specific split behavior).
- [ ] **States** you care about: empty, loading, error, offline, permission-denied.

### Handoff formats

- Figma link, exported images, or ASCII wireframes — all fine.
- Per screen, include: **purpose, layout, components, actions, states**.
- Drop assets in `docs/design/` (or tell me where); shared components go in
  `packages/ui`.

## If you have no design yet

Say **"use recommended defaults"** and I'll scaffold:

- Tablet-landscape shell with left nav rail.
- 3-pane order screen (categories · items · cart).
- shadcn/ui + Tailwind, Inter, **luxury dark green** identity from
  [`VISUAL-IDENTITY.md`](./VISUAL-IDENTITY.md) (dark default, light theme,
  optional neon accent).
- 44px touch targets, status colors, bottom-sheet modals on portrait.
- Splash, PIN login, offline/sync indicators, and the update banner wired in.

You can refine from there screen by screen.
