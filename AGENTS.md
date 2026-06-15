# AGENTS.md — Working rules for AI agents & contributors

## Project

Sentralio — Bun monorepo. `apps/api` (Bun + ElysiaJS + Drizzle + MySQL),
`apps/web` (React 19 + Vite + TS). See README.md for setup.

---

## Golden rules

1. **NEVER push files that contain inline styles via remote tooling / GitHub API.**
   Inline styles get masked/corrupted when read by tools. Edit these locally only:
   - `apps/web/src/components/hpp/HppSection.tsx`
   - `apps/web/src/components/hpp/HppAuditHistory.tsx`
   - `apps/web/src/components/hpp/HppHistory.tsx`
   - `apps/web/src/components/hpp/HppEntryForm.tsx`
   - `apps/web/src/components/master-packing-cost/MasterPackingCostHistory.tsx`

2. **Read-only inspection of any file is always safe.**

3. **Keep new files under ~500 lines.** If a change makes a file much bigger, split it.

4. **Match existing patterns; don't introduce new libraries without a reason.**

---

## Where things go (backend)

| Concern | Location |
|---------|----------|
| HTTP routes | `apps/api/src/modules/<domain>/<domain>.route.ts` |
| Business logic | `apps/api/src/modules/<domain>/<domain>.service.ts` |
| DB schema | `apps/api/src/db/schema.ts` (single source of truth) |
| Migrations | `apps/api/src/drizzle/` (generated via `bun run db:generate`) |
| CLI scripts | `apps/api/src/scripts/` |

---

## Where things go (frontend)

| Concern | Location |
|---------|----------|
| Page-level screens | `apps/web/src/pages/` |
| Feature components | `apps/web/src/components/<feature>/` |
| Reusable UI | `apps/web/src/components/ui/` |
| API calls | `apps/web/src/lib/api.ts` (base path `/api`, `credentials: 'include'`) |

---

## Commands

```bash
# Dev (all)
bun run dev

# API only  →  http://localhost:3000
bun run dev:api

# Web only  →  http://localhost:5175
bun run dev:web

# Run API tests
cd apps/api && bun run test

# Generate + apply migrations
bun run --filter api db:generate
bun run --filter api db:migrate
```

---

## Before opening a PR

- Run the test suite for the app you touched.
- Keep diffs focused — **one concern per PR**.
- Don't commit `.env` or SQL dumps (already gitignored).
- Write a conventional commit message: `fix(hpp): ...`, `feat(order): ...`, `docs: ...`
