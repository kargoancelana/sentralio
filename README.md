# WMS-Sync

Warehouse Management & Shopee integration system. A monorepo that syncs Shopee orders, manages product master data, prints shipping labels, and reports per-order profit & loss for a multi-store seller operation.

## Features

- **Shopee integration** — OAuth authorization, order sync, escrow/settlement sync, automatic token refresh
- **Order management** — order list with shop filtering, batch shipment (dropoff/pickup), batch label printing
- **Shipping labels** — generate, cache, and batch-print Shopee shipping labels with custom sender info
- **Product master** — master products, channel listings, SKU/model mapping, stock propagation across listings in a group
- **Profit & loss reporting** — per-order, per-shop, and per-product profit analytics including HPP (cost of goods), packing cost, fees, and Shopee Ads expense
- **Authentication & roles** — session-based login (JWT in HttpOnly cookie), `admin` / `staff` role matrix, brute-force lockout, user management, change password
- **Picking list** — aggregated pick quantities derived from synced order items

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend (`apps/api`) | Bun, ElysiaJS, Drizzle ORM, MySQL, jose (JWT), bcryptjs |
| Frontend (`apps/web`) | React 19, Vite, React Router, TypeScript |
| Testing | `bun test` (API), Vitest (web), fast-check (property-based testing) |

## Requirements

- [Bun](https://bun.sh) v1.3+
- MySQL 8.0+
- A Shopee Open Platform partner account (for live integration)

## Setup

1. Install dependencies (from repo root):

   ```bash
   bun install
   ```

2. Create `.env` from the example and fill in your values:

   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env

   # macOS/Linux
   cp .env.example .env
   ```

   See [Environment Variables](#environment-variables) below for what each value means.

3. Apply database migrations:

   ```bash
   bun run --filter api db:migrate
   ```

4. Create the first admin user:

   ```bash
   cd apps/api
   bun run src/scripts/reset-password.ts --email admin@example.com --password "YourStrongPass1!"
   ```

5. Run both apps in development:

   ```bash
   # from repo root — runs api + web together
   bun run dev
   ```

   Or run them separately:

   ```bash
   bun run dev:api   # backend on http://localhost:3000
   bun run dev:web   # frontend on http://localhost:5173
   ```

## Environment Variables

All secrets live in `.env` (never committed). Key groups:

- **Database** — `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Shopee API** — `PARTNER_ID`, `PARTNER_KEY`, `SHOP_ID`, `ACCESS_TOKEN`, `REFRESH_TOKEN`, `SHOPEE_REDIRECT_URL`
- **Encryption** — `TOKEN_SECRET_KEY` (exactly 32 bytes / 64 hex chars; encrypts Shopee credentials at rest)
- **Authentication** — `AUTH_JWT_SECRET` (≥32 bytes), `AUTH_ALLOWED_ORIGINS` (comma-separated CORS/CSRF allowlist)
- **Label sender info** — `SHOP_NAME`, `SHOP_PHONE`, `SHOP_CITY`

Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # TOKEN_SECRET_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # AUTH_JWT_SECRET
```

## Scripts

Run backend scripts from `apps/api`:

- `bun run dev` — API in watch mode
- `bun run start` — API once
- `bun run test` — run API test suite
- `bun run db:generate` — generate Drizzle migration files
- `bun run db:migrate` — apply migrations
- `bun run db:studio` — open Drizzle Studio
- `bun run db:seed` — insert dummy data (development only)

Operational helper scripts (in `apps/api/src/scripts`):

- `reset-password.ts` — set a user's password (`--email`, `--password`)
- `reactivate-user.ts` — reactivate a deactivated user

## Project Structure

```
apps/
  api/        Bun + Elysia backend
    src/
      modules/   auth, users, order, product, master, profit, hpp, packing-cost, shopee
      services/  shopee sync, escrow, label, batch shipment
      scripts/   operational CLI tools
    drizzle/   SQL migrations
  web/        React + Vite frontend
    src/
      pages/     Dashboard, PesananSaya, MasterProduk, LaporanKeuangan, Pengaturan, ...
      auth/      role matrix, route guards
      context/   AuthContext
```

## Security Notes

- `.env` and generated SQL dumps are gitignored and must never be committed.
- Shopee `partner_key`, `access_token`, and `refresh_token` are encrypted at rest using `TOKEN_SECRET_KEY`.
- Auth sessions are JWTs stored in HttpOnly cookies with origin/CSRF checks.
- If you fork or clone, rotate all secrets before deploying.
