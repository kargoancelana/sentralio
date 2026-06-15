# Contributing to Sentralio

## Prerequisites

See [README.md](./README.md) for full setup (Bun 1.3+, MySQL 8+, Git).
Run `bun install` from the repo root before anything else.

---

## Module vs Service (IMPORTANT — pick & keep one convention)

The backend currently has a mixed layout: some domains keep their service inside
the module folder (e.g. `modules/hpp/hpp.service.ts`), while others live in
`services/` (e.g. `services/order.service.ts` while the route is in
`modules/order/`).

**Convention going forward:**

| Layer | Location |
|-------|----------|
| Thin HTTP layer | `apps/api/src/modules/<domain>/<domain>.route.ts` |
| Domain / business logic | `apps/api/src/modules/<domain>/<domain>.service.ts` |
| Cross-cutting / external integrations | `apps/api/src/services/` only |

`services/` is reserved for: Shopee API client, label rendering, background sync,
escrow sync — things that are used by multiple domains.

When you touch an existing domain, migrate it toward this layout **opportunistically**
(small steps), but **never** in the same PR as a feature/bugfix.

---

## Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Backend files | `kebab-case` | `order-detail.service.ts` |
| React components | `PascalCase.tsx` | `OrderCard.tsx` |
| One component per file | ✅ | — |
| Page files | thin — push logic into components/hooks | — |

---

## Styling

- Prefer **per-component CSS files** (e.g. `Dashboard.css`) over inline styles.
- **Do NOT add new inline styles** to the HPP / packing-cost components listed in
  [AGENTS.md](./AGENTS.md). These files are intentionally kept out of remote edits.

---

## Tests

- Co-locate tests in `__tests__/` next to the code (existing pattern).
- Add or adjust tests when changing business logic (HPP, profit, escrow, sync).
- Run the suite before pushing: `cd apps/api && bun run test`

---

## Commits & PRs

- Use **conventional commits**: `fix(hpp): ...`, `feat(order): ...`, `docs: ...`
- **One concern per PR.** Describe: what changed, why, and how to verify.
- Don't mix layout/style changes with business-logic changes.

---

## Deploy (production)

See [docs/architecture.md](./docs/architecture.md) and the Notion "Panduan Deploy
Sentralio ke VPS" for exact commands.

> **tl;dr for frontend changes:** rebuild on the VPS with
> `bun run --filter web build` then restart `sentralio-api`.
