# Hospitality POS — Documentation

Working name: **Hospitality POS** (rename freely).

This folder is the source of truth for *what* we are building, *why*, *how* we
decided to build it, and *what to do next*. It is written to be read by both
humans and AI coding agents.

## Doc map

| File | Purpose | Update when |
| --- | --- | --- |
| [`GOAL.md`](./GOAL.md) | Vision, users, MVP scope, success metrics, non-goals | Scope or priorities change |
| [`DECISIONS.md`](./DECISIONS.md) | Architecture Decision Records (ADRs) | Any architectural choice is made or reversed |
| [`STACK.md`](./STACK.md) | Stack sheet: versions, ports, env, commands, deployment | Tooling or versions change |
| [`UI.md`](./UI.md) | UI/layout guide + what to hand the agent | Design direction or screens change |
| [`VISUAL-IDENTITY.md`](./VISUAL-IDENTITY.md) | Colour/type/depth tokens (dark, light, optional neon) | Palette or brand direction changes |
| [`DESKTOP.md`](./DESKTOP.md) | Desktop app + shortcuts, no-console launchers, installers | Shortcut or launcher changes |
| [`TASKS.md`](./TASKS.md) | Phased roadmap and living checklist | Work starts, finishes, or is re-prioritized |
| [`AGENT.md`](./AGENT.md) | Operating rules, conventions and **commit instructions** | Conventions, commands, or guardrails change |

## Reading order

1. `GOAL.md` — understand the product.
2. `DECISIONS.md` — understand the constraints we have locked in.
3. `STACK.md` — know the tools and environment.
4. `UI.md` — know the screens and what to provide.
5. `VISUAL-IDENTITY.md` — know the visual tokens and usage rules.
6. `DESKTOP.md` — every release ships a desktop shortcut.
7. `TASKS.md` — pick the next task.
8. `AGENT.md` — follow the working rules while doing it.

## Ground rules for this folder

- Decisions are **append-only**. Never delete an ADR; supersede it with a new one.
- Tasks use `- [ ]` checkboxes so progress is visible in the repo.
- Commit **small milestones** with Conventional Commit messages; tick the
  matching `TASKS.md` checkbox in the same commit (see `AGENT.md`).
- If code and docs disagree, **stop and fix the docs** in the same change.
- Keep docs short enough to read in one sitting. Detail belongs in code comments
  (sparingly) or in the ADR that introduced it.

## Status

Project is at **Phase 0 — Foundation** (with **Phase 0b — Distribution,
updates and lifecycle** tracked alongside it). No application code exists yet.
See `TASKS.md` for the starting checklist.
