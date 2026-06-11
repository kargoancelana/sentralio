# Sentralio

Warehouse Management & Shopee integration system. A monorepo that syncs Shopee orders, manages product master data, prints shipping labels, and reports per-order profit & loss for a multi-store seller operation.

## Features

- **Shopee integration** — OAuth authorization, order sync, escrow/settlement sync, automatic token refresh
- **Soft connect/disconnect** — disconnecting a shop hides all of its data (orders, channel products, reports) and pauses sync without deleting anything; reconnecting via OAuth restores the data and resumes sync automatically
- **Order management** — order list with shop filtering, batch shipment (dropoff/pickup), batch label printing, detection of Shopee "tertunda" (held) orders that can't be processed yet
- **Shipping labels** — generate, cache, and batch-print Shopee shipping labels with custom sender info
- **Product master** — master products, channel listings, SKU/model mapping, stock propagation across listings in a group
- **Profit & loss reporting** — per-order and per-product profit analytics including HPP (cost of goods), packing cost, marketplace fees, and Shopee Ads expense (auto-refreshed so it tracks Shopee's retroactive adjustments)
- **Authentication & roles** — session-based login (JWT in HttpOnly cookie), `admin` / `staff` role matrix, brute-force lockout, user management, change password
- **Picking list** — aggregated pick quantities derived from synced order items

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend (`apps/api`) | Bun, ElysiaJS, Drizzle ORM, MySQL, jose (JWT), bcryptjs |
| Frontend (`apps/web`) | React 19, Vite, React Router, TypeScript |
| Testing | `bun test` (API), Vitest (web), fast-check (property-based testing) |

## Requirements

- [Bun](https://bun.sh) v1.3+ (the whole project runs on Bun — Node.js is **not** required to run it)
- MySQL 8.0+ (or MariaDB) with an empty database created for the app
- [Git](https://git-scm.com) to clone the repository
- A Shopee Open Platform partner account — only needed if you want the live Shopee integration (order sync, labels, profit reports). The app boots and you can log in without it; Shopee-backed screens will just be empty until credentials are configured.

## Installing Prerequisites

You need three things installed before setup: **Git**, **Bun**, and **MySQL**. Use the commands for your operating system, then verify with `git --version`, `bun --version`, and `mysql --version`.

> After installing Bun, restart your terminal (or follow the printed instructions) so the `bun` command is on your `PATH`.

### Windows 10/11

Run these in **PowerShell** (not CMD):

```powershell
# Git
winget install --id Git.Git -e

# Bun (requires Windows 10 v1809 or newer)
powershell -c "irm bun.sh/install.ps1 | iex"

# MySQL 8.0+ (or use the MySQL Installer: https://dev.mysql.com/downloads/installer/)
winget install --id Oracle.MySQL -e
```

Make sure the MySQL server service is started (Services app, or `net start MySQL80`) before continuing.

### macOS

Using [Homebrew](https://brew.sh):

```bash
brew install git mysql
curl -fsSL https://bun.sh/install | bash   # or: brew install oven-sh/bun/bun
brew services start mysql                   # start the MySQL server
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y git mysql-server
curl -fsSL https://bun.sh/install | bash
sudo systemctl start mysql                  # start the MySQL server
```

On other distributions, install `git` and a MySQL/MariaDB server with your package manager (e.g. `dnf install mariadb-server`, `pacman -S mariadb`), then install Bun with the same `curl` command above.

## Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/kargoancelana/sentralio.git
   cd sentralio
   ```

2. **Install dependencies** (from repo root — this installs both `apps/web` and `apps/api` via Bun workspaces):

   ```bash
   bun install
   ```

3. **Create the database.** In MySQL, create an empty schema matching `DB_NAME` (default `sentralio`):

   ```sql
   CREATE DATABASE sentralio;
   ```

4. **Create `.env`** from the example and fill in your values:

   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env

   # macOS/Linux
   cp .env.example .env
   ```

   > **Where does `.env` live?** The backend loads it from the **repo root** first (`config/env.ts` resolves the root `.env`), then falls back to a local `.env` in `apps/api`. Keeping a single `.env` at the repo root is the recommended setup. See [Environment Variables](#environment-variables) below for what each value means.

5. **Apply database migrations** (committed SQL lives in `apps/api/drizzle`):

   ```bash
   bun run --filter api db:migrate
   ```

6. **Create the first admin user** (there is no default user; logins are checked against the DB):

   ```bash
   cd apps/api
   bun run src/scripts/create-admin.ts --email admin@example.com --name "Admin" --password "YourStrongPass1!"
   ```

   The password must satisfy the policy: at least 8 characters, with one uppercase letter and one special character. This script connects using only your `DB_*` settings, so it works on a fresh install even before the Shopee/auth secrets are filled in. To create more users later, an existing admin can manage them in the app, or you can re-run this script (add `--role staff` for a staff account).

7. **Run both apps in development:**

   ```bash
   # from repo root — runs api + web together
   bun run dev
   ```

   Or run them separately:

   ```bash
   bun run dev:api   # backend on http://localhost:3000
   bun run dev:web   # frontend on http://localhost:5175
   ```

   The frontend talks to the API through the relative path `/api`. In development, Vite proxies `/api` to `http://localhost:3000` (see `apps/web/vite.config.ts`), so you don't need to configure an API base URL — just make sure both apps are running.

## Environment Variables

All secrets live in `.env` (never committed). Key groups:

- **App** — `APP_PORT` (backend HTTP port, default `3000`), `NODE_ENV` (`development` or `production`)
- **Database** — `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Shopee partner app** — `PARTNER_ID`, `PARTNER_KEY`, `SHOPEE_REDIRECT_URL` (your Shopee Open Platform partner-app identity; needed to start the OAuth "connect shop" flow, obtained from your own Shopee Open Platform partner account)
- **Shopee per-shop tokens** (optional) — `SHOP_ID`, `ACCESS_TOKEN`, `REFRESH_TOKEN`. Leave blank on a fresh install: you obtain them automatically by authorizing a shop in the web app (Settings → Integrasi Toko), and they are stored & auto-refreshed in the database. Only set them if you want `bun run db:seed` to preseed a shop manually.
- **Encryption** — `TOKEN_SECRET_KEY` (exactly 32 bytes / 64 hex chars; encrypts Shopee credentials at rest)
- **Authentication** — `AUTH_JWT_SECRET` (≥32 UTF-8 bytes), `AUTH_ALLOWED_ORIGINS` (comma-separated CORS/CSRF allowlist — **must include the origin your frontend runs on**, e.g. `http://localhost:5175`, or login will be blocked)
- **Label sender info** — `SHOP_NAME`, `SHOP_PHONE`, `SHOP_CITY`
- **Production only** — `FRONTEND_URL` (used for CORS when `NODE_ENV=production`)

> The server validates env on startup and **exits immediately** if `AUTH_JWT_SECRET` is missing/too short or `AUTH_ALLOWED_ORIGINS` has no valid origin. `DB_*`, `PARTNER_ID`, `PARTNER_KEY`, and `TOKEN_SECRET_KEY` are also required to boot. `SHOP_ID`, `ACCESS_TOKEN`, and `REFRESH_TOKEN` are **not** required — the app boots and you can log in without them; you fill those in automatically through the web OAuth flow.

Generate strong secrets with Bun (no Node.js required):

```bash
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # TOKEN_SECRET_KEY (64 hex chars)
bun -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # AUTH_JWT_SECRET
```

Or with OpenSSL (preinstalled on macOS/Linux; on Windows it ships with Git in Git Bash):

```bash
openssl rand -hex 32   # TOKEN_SECRET_KEY (64 hex chars)
openssl rand -hex 48   # AUTH_JWT_SECRET
```

## Scripts

Run backend scripts from `apps/api`:

- `bun run dev` — API in watch mode
- `bun run start` — API once
- `bun run test` — run API test suite
- `bun run db:generate` — generate Drizzle migration files from the schema
- `bun run db:migrate` — apply migrations
- `bun run db:studio` — open Drizzle Studio
- `bun run db:seed` — seed Shopee API credentials from your `.env` into the `shopee_credentials` table (optional; only useful for the live Shopee integration, and safe to re-run — skipped automatically if `SHOP_ID`/`ACCESS_TOKEN`/`REFRESH_TOKEN` are blank)
- `bun run create-admin` — create a user, default role `admin` (`--email`, `--name`, `--password`, optional `--role admin|staff`); use this to bootstrap the first admin on a fresh install

Operational helper scripts (in `apps/api/src/scripts`):

- `create-admin.ts` — create a user, default role `admin` (`--email`, `--name`, `--password`, optional `--role admin|staff`); the way to bootstrap the first admin on a fresh install
- `reset-password.ts` — reset an existing user's password (`--email`, `--password`)
- `reactivate-user.ts` — reactivate a deactivated user
- `backfill-ads-expense.ts` — backfill/refresh Shopee Ads daily expense cache (`[days]`, optional `--force` to overwrite cached values with fresh data from Shopee)

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

## Troubleshooting

- **Server exits on startup with `[FATAL] AUTH_JWT_SECRET ...` or `AUTH_ALLOWED_ORIGINS ...`** — your `.env` is missing those values or the JWT secret is shorter than 32 bytes. Fill them in (see [Environment Variables](#environment-variables)).
- **`Missing required environment variable: ...`** — one of `DB_*`, `PARTNER_ID`, `PARTNER_KEY`, or `TOKEN_SECRET_KEY` is unset. These are required to boot (use placeholder values for the Shopee partner keys if you aren't using Shopee yet). `SHOP_ID`, `ACCESS_TOKEN`, and `REFRESH_TOKEN` are optional and can be left blank — you obtain them via the web OAuth flow.
- **Login returns 401 / requests blocked by CORS** — make sure the exact origin of your frontend (e.g. `http://localhost:5175`) is listed in `AUTH_ALLOWED_ORIGINS`.
- **Frontend loads but every API call fails** — confirm the API is running on port 3000; the Vite dev proxy forwards `/api` there.
- **`bun` is not recognized / command not found** — restart your terminal after installing Bun so it is added to your `PATH` (on Windows, open a fresh PowerShell window).
- **Wrong dates / off-by-hours timestamps** — the app assumes WIB (UTC+7). The DB pool sets the session time zone to `+07:00` automatically; make sure your MySQL server allows that.

## Security Notes

- `.env` and generated SQL dumps are gitignored and must never be committed.
- Shopee `partner_key`, `access_token`, and `refresh_token` are encrypted at rest using `TOKEN_SECRET_KEY`.
- Auth sessions are JWTs stored in HttpOnly cookies with origin/CSRF checks.
- If you fork or clone, rotate all secrets before deploying.
