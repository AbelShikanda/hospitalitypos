# Visual Identity — Luxury Dark Green

**Status:** Proposed starting direction. **Not locked.** Treat every value here as
an adjustable default; components consume semantic tokens, so the palette can
evolve without touching screens.

This document is the **theme layer** for the system:
- [`UI.md`](./UI.md) defines screens, layout and interaction.
- [`STACK.md`](./STACK.md) defines the tools (Tailwind + shadcn/ui).
- This file defines colour, depth, type and motion tokens.
- [`DECISIONS.md`](./DECISIONS.md) ADR-017 records the direction.

## 1. Intent

A refined, natural, futuristic hospitality operating system: five-star hotels,
private members' clubs, contemporary architecture. **Dark, refined, natural,
powerful, futuristic, luxurious** — never a gaming UI, generic Bootstrap green,
or purple/violet/magenta branding.

It must still serve the product principles: fast, glanceable, money loud, state
always visible, and usable offline.

## 2. Token architecture

Three layers; components only ever use the **semantic** layer.

1. **Primitive** — raw values (`--green-500`, `--stone-950`).
2. **Semantic** — meaning (`--bg`, `--surface-card`, `--text-muted`, `--brand-interactive`).
3. **Component** — shadcn aliases (`--background`, `--foreground`, `--primary`).

Rules:
- No hardcoded hex in components; only semantic tokens.
- Two themes: **dark (default)** and **light** (deliberate, not an inverted dark).
- Neon is an **optional dark-only accent token**, never a status colour.
- Status colours are independent of brand green.

## 3. Dark theme (default)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#080D0B` | App background |
| `--bg-secondary` | `#0D1511` | Secondary regions |
| `--sidebar` | `#0A110E` | Nav rail |
| `--surface-elevated` | `#121C16` | Modals, popovers |
| `--surface-card` | `#17231B` | Cards, panels |
| `--surface-hover` | `#1D2D22` | Hover |
| `--surface-hover-strong` | `#233629` | Active/pressed |
| `--border-subtle` | `#26372C` | Separation without boxes |
| `--border` | `#314638` | Standard divider |
| `--border-strong` | `#405B47` | Emphasis |
| `--text` | `#F2F4EF` | Primary (warm ivory) |
| `--text-secondary` | `#C0CBBF` | Secondary |
| `--text-muted` | `#89978A` | Muted |
| `--text-disabled` | `#59665C` | Disabled |

Depth comes from layered surfaces + subtle borders + restrained shadows — not
from boxing every element.

## 4. Light theme

Deliberate warm luxury, not a reversed dark theme.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F4F6F1` | App background |
| `--bg-secondary` | `#EAEFE8` | Secondary regions |
| `--sidebar` | `#F8FAF6` | Nav rail |
| `--surface-elevated` | `#FFFFFF` | Modals, popovers |
| `--surface-card` | `#FFFFFF` | Cards, panels |
| `--surface-hover` | `#EAEFE8` | Hover |
| `--surface-hover-strong` | `#DCE4DA` | Active/pressed |
| `--border-subtle` | `#E6ECE3` *(derived)* | Decorative separation |
| `--border` | `#DCE4DA` | Standard divider |
| `--border-strong` | `#C9D4C7` *(derived)* | Decorative emphasis |
| `--text` | `#17231B` | Primary |
| `--text-secondary` | `#526256` | Secondary |
| `--text-muted` | `#7C8B7E` | Muted (see contrast note) |
| `--text-disabled` | `#A7B3A9` *(derived)* | Disabled |

Derived values are starting points; validate before shipping.

## 5. Brand greens

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--brand` | `#3F8058` | `#286844` | Brand fills, identity |
| `--brand-interactive` | `#4F9668` | `#327C51` | Interactive fills, links |
| `--brand-bright` | `#70B486` | `#4C9167` | Active indicators, focus |
| `--brand-soft` | `#A3BCA6` | `#E4F0E7` | Secondary accents |
| `--brand-deep` | `#20563B` | `#1F5A3B` *(derived)* | Selected surfaces, gradients |
| `--brand-tint` | `#172E21` | `#E4F0E7` | Selected rows/items |

**Button contrast guidance (measured):**
- Light text on `--brand-interactive` is **3.22:1** → not for normal text.
- Preferred: **`--brand-deep` fill with light text (7.72:1)**, or
  `--brand-interactive` fill with **dark text** (5.50:1).
- `--brand` with light text is 4.27:1 → large text / UI components only.
- Interactive **text/links**: `--brand-bright` on dark (7.98:1); light theme
  `--brand-interactive` on bg (4.66:1).

Do not use green for every status just because it is the brand colour.

## 6. Optional neon layer (dark theme only)

Restrained, purposeful, never decorative wallpaper.

| Token | Value | Contrast on `--bg` |
| --- | --- | --- |
| `--neon` | `#6EE7A8` | 12.73:1 |
| `--neon-bright` | `#7CFFB2` | 15.66:1 |
| `--neon-emerald` | `#5CF2A0` | 13.67:1 |

**Allowed uses:** active/focused element edges, live KDS new-ticket alert,
online/sync pulse, one highlighted chart series, selected item indicator.

**Effect recipe (subtle):**
```css
--neon-glow: 0 0 0 1px rgba(110,231,168,.35), 0 0 18px -6px rgba(110,231,168,.35);
```

**Not allowed:** large glowing panels, neon body text backgrounds, neon in the
light theme (1.41:1 on light bg), neon as a status colour, constant pulsing
(except critical alerts). Respect `prefers-reduced-motion`.

## 7. Status colours (independent of brand)

| Token | Dark | Light *(derived)* | Meaning |
| --- | --- | --- | --- |
| `--status-success` | `#55A879` | `#2F7D55` | Paid, confirmed, ready |
| `--status-warning` | `#E5B765` | `#8A5A12` | Pending, reserved, aging |
| `--status-danger` | `#D97777` | `#B23A3A` | Failed, attention, void |
| `--status-info` | `#83AFC0` | `#2F6B80` | Occupied, neutral info |
| `--status-neutral` | `#89978A` | `#7C8B7E` | Free, inactive |

Rules:
- Always pair colour with an **icon or label**; never colour alone.
- Table status: free `neutral` · occupied `info` · reserved `warning` ·
  attention `danger` · paid `success`.
- KDS aging: `warning` → `danger`; new-ticket alert may use `--neon`.
- Payments: pending `warning` · confirmed `success` · failed `danger` ·
  manual-reference `warning` until reconciled.
- Danger Zone uses `danger`, never brand green or neon.

## 8. Gradients and depth

Use selectively — summary cards, active navigation, selected dashboard
highlights, a few informational sections. Not every card or button.

Example recipes:
```css
/* hero / summary */
background: linear-gradient(135deg, #0D1511 0%, #080D0B 55%, #172E21 100%);
/* selected surface */
background: linear-gradient(135deg, #17231B 0%, #121C16 100%);
/* neon edge (selected only) */
box-shadow: var(--neon-glow);
```

Depth: layered surfaces, subtle borders, restrained shadows. Any glow stays
extremely subtle and limited to active elements.

## 9. Typography

- Warm ivory text, not pure white; tabular numerals for all money.
- Font: **Inter** by default (or a supplied brand font); optional display face.
- Scale: UI 14–16px, headings 20–28px, **money/totals 28–40px tabular**.
- Currency: KES, thousands separators, hide `.00` where sensible.

## 10. Screen mapping (the 12 core screens)

| Screen | Identity notes |
| --- | --- |
| Splash | `--bg`, logo, subtle emerald gradient; no neon unless updating |
| PIN login | `--surface-elevated`, large keypad, `--brand-bright` focus |
| Tables / floor | Table cards on `--surface-card`; **status colours**, not brand |
| Order taking | 3-pane surfaces; selected item `--brand-tint` + neon edge optional |
| Bill & split | Summary card with restrained gradient; totals in ivory |
| Payment | Large method tiles; status colours for pending/confirmed/failed |
| Receipt | Print preview on elevated surface; monospace/tabular numerals |
| KDS | Dark, high contrast; aging `warning→danger`; neon only for new ticket |
| Shift / Z-report | Summary gradient card; success/danger for balance variance |
| Inventory | Table + status dots; low stock `warning`, out `danger` |
| Reports | Brand ramp + status semantics; one neon-highlighted series max |
| Settings | Grouped sections; **Danger Zone** with `danger` accent |

## 11. Component rules

- **Buttons:** primary = `--brand-deep`/`--brand-interactive` per contrast guide;
  secondary = bordered surface; destructive = `--status-danger`.
- **Nav:** active = `--brand-tint` surface + `--brand-bright` indicator; optional
  subtle neon edge on the active item only.
- **Cards:** `--surface-card` + `--border-subtle`; elevated cards for summaries.
- **Forms:** control borders must reach ≥3:1 where the border is the only
  affordance; use focus ring (`--focus-ring`). `--border` is decorative.
- **Tables:** zebra via `--surface-hover`; status as dot + text.
- **Modals:** `--surface-elevated` + subtle backdrop blur.
- **Charts:** brand ramp + status colours; no rainbow; neon for one series max.
- **Payment tiles:** large, clear, status-driven; never neon.
- **Danger Zone:** separated, `danger`, confirmation required.

## 12. Accessibility gates (measured)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Primary text / bg (dark) | 17.68 | Pass |
| Secondary text / bg (dark) | 11.69 | Pass |
| Muted text / bg (dark) | 6.39 | Pass |
| Muted text / card (dark) | 5.30 | Pass |
| Interactive green text / bg (dark) | 5.50 | Pass |
| Bright accent text / bg (dark) | 7.98 | Pass |
| Light text / brand-interactive | 3.22 | **Fail** for normal text |
| Light text / brand-deep | 7.72 | Pass |
| Light text / brand | 4.27 | Large text / UI only |
| Light primary / bg | 14.93 | Pass |
| Light secondary / bg | 5.96 | Pass |
| Light muted / bg | 3.30 | **Non-essential/large only** |
| Light interactive text / bg | 4.66 | Pass |
| Neon mint / dark bg | 12.73 | Pass |
| Neon mint / light bg | 1.41 | **Avoid** |

Also required:
- Do not rely on colour alone (icons/labels with status).
- Visible focus rings; reduced-motion support; ≥44px touch targets.
- Add a token contrast check to CI (optional but recommended).

## 13. Implementation

- Tokens live in `packages/ui/src/styles/tokens.css`, scoped by
  `:root[data-theme="dark"]` / `[data-theme="light"]`.
- Tailwind maps semantic tokens to utility classes; shadcn variables alias them.
- Default theme: dark; optionally follow `prefers-color-scheme`.
- No hex in components; review/lint against raw colour literals.
- Optional `/design` route or Storybook to preview tokens and key screens.

Starting CSS:
```css
:root[data-theme="dark"] {
  --bg:#080D0B; --bg-secondary:#0D1511; --sidebar:#0A110E;
  --surface-elevated:#121C16; --surface-card:#17231B;
  --surface-hover:#1D2D22; --surface-hover-strong:#233629;
  --border-subtle:#26372C; --border:#314638; --border-strong:#405B47;
  --text:#F2F4EF; --text-secondary:#C0CBBF; --text-muted:#89978A; --text-disabled:#59665C;
  --brand:#3F8058; --brand-interactive:#4F9668; --brand-bright:#70B486;
  --brand-soft:#A3BCA6; --brand-deep:#20563B; --brand-tint:#172E21;
  --status-success:#55A879; --status-warning:#E5B765; --status-danger:#D97777;
  --status-info:#83AFC0; --status-neutral:#89978A;
  --neon:#6EE7A8; --neon-bright:#7CFFB2; --neon-emerald:#5CF2A0;
  --neon-glow:0 0 0 1px rgba(110,231,168,.35), 0 0 18px -6px rgba(110,231,168,.35);
  --focus-ring:#70B486;
  --radius-sm:6px; --radius-md:10px; --radius-lg:16px;
}
:root[data-theme="light"] {
  --bg:#F4F6F1; --bg-secondary:#EAEFE8; --sidebar:#F8FAF6;
  --surface-elevated:#FFFFFF; --surface-card:#FFFFFF;
  --surface-hover:#EAEFE8; --surface-hover-strong:#DCE4DA;
  --border-subtle:#E6ECE3; --border:#DCE4DA; --border-strong:#C9D4C7;
  --text:#17231B; --text-secondary:#526256; --text-muted:#7C8B7E; --text-disabled:#A7B3A9;
  --brand:#286844; --brand-interactive:#327C51; --brand-bright:#4C9167;
  --brand-soft:#E4F0E7; --brand-deep:#1F5A3B; --brand-tint:#E4F0E7;
  --status-success:#2F7D55; --status-warning:#8A5A12; --status-danger:#B23A3A;
  --status-info:#2F6B80; --status-neutral:#7C8B7E;
  --focus-ring:#327C51;
}
```

## 14. Flexibility and governance

- **Proposed, not locked.** Adjust token values freely; screens inherit.
- Avoid over-specifying per-component colours now — use semantic tokens.
- A brand-direction change updates this doc + ADR; a token tweak needs only a
  PR with before/after contrast.
- Open items: final logo, brand font, gradient recipes, chart palette, and the
  derived light-theme values.

## 15. Handoff

- If you provide brand assets, map them into **primitives**; components stay on
  semantic tokens.
- If you provide no design, these defaults are used: dark default, light theme,
  optional neon accent, tablet-landscape shell from [`UI.md`](./UI.md).
