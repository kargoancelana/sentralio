# Sentralio

Warehouse Management & Shopee integration system. Sentralio is a Bun monorepo that syncs Shopee orders, manages product master data, prints shipping labels, and reports per-order profit & loss for a multi-store seller operation.

## Features

- **Shopee integration** — OAuth authorization, order sync, escrow/settlement sync, automatic token refresh
- **Automatic sync orchestration** — BullMQ + Redis power onboarding backfill for new shops, reconnect gap-sync, recurring product sync, and retryable sync jobs
- **Soft connect/disconnect** — disconnecting a shop hides all of its data (orders, channel products, reports) and pauses sync without deleting anything; reconnecting via OAuth restores the data and resumes sync automatically
- **Order management** — order list with shop filtering, batch shipment (dropoff/pickup), batch label printing, detection of Shopee "tertunda" (held) orders that can't be processed yet
- **Shipping labels** — generate, cache, and batch-print Shopee shipping labels with custom sender info
- **Product master** — master products, channel listings, SKU/model mapping, stock propagation across listings in a group
- **Profit & loss reporting** — per-order and per-product profit analytics including HPP (cost of goods), packing cost, marketplace fees, and Shopee Ads expense (auto-refreshed so it tracks Shopee's retroactive adjustments)
- **Authentication & roles** — session-based login (JWT in HttpOnly cookie), `admin` / `staff` role matrix, brute-force lockout, user management, change password
- **Picking list** — aggregated pick quantities derived from synced order items

## Repo guide

Start here depending on what you need:

- [CONTRIBUTING.md](./CONTRIBUTING.md) — contributor conventions and PR hygiene
- [docs/architecture.md](./docs/architecture.md) — system architecture, sync model, deployment shape
- [apps/api/README.md](./apps/api/README.md) — backend setup, queue behavior, operational notes
- [apps/web/README.md](./apps/web/README.md) — frontend dev workflow and API proxy behavior
- [AGENTS.md](./AGENTS.md) — working rules for AI agents and remote edits

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend (`apps/api`) | Bun, ElysiaJS, Drizzle ORM, MySQL, BullMQ, ioredis, jose (JWT), bcryptjs |
| Frontend (`apps/web`) | React 19, Vite, React Router, TypeScript |
| Infra | MySQL, Redis, Caddy, systemd |
| Testing | `bun test` (API), Vitest tooling (web), fast-check |

## Requirements

- [Bun](https://bun.sh) v1.3+
- MySQL 8.0+ (or MariaDB) with an empty database created for the app
- Redis 7+ for queue-backed sync flows (`REDIS_URL`, default `redis://127.0.0.1:6379`)
- [Git](https://git-scm.com) to clone the repository
- A Shopee Open Platform partner account — only needed if you want the live Shopee integration (order sync, labels, profit reports). The app boots and you can log in without it; Shopee-backed screens will just be empty until credentials are configured.

## Installing prerequisites

You need four things installed before setup: **Git**, **Bun**, **MySQL**, and **Redis**. Verify with `git --version`, `bun --version`, `mysql --version`, and `redis-cli --version` (or confirm your Docker-based Redis container is running).

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

For Redis on Windows, the easiest option is Docker Desktop:

```powershell
docker run -d --name sentralio-redis -p 6379:6379 redis:7-alpine
```

If you prefer a native service, use a Redis-compatible Windows service such as Memurai. Make sure MySQL and Redis are both running before continuing.

### macOS

Using [Homebrew](https://brew.sh):

```bash
brew install git mysql redis
curl -fsSL https://bun.sh/install | bash
brew services start mysql
brew services start redis
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y git mysql-server redis-server
curl -fsSL https://bun.sh/install | bash
sudo systemctl start mysql
sudo systemctl start redis-server
```

On other distributions, install `git`, a MySQL/MariaDB server, and Redis with your package manager, then install Bun with the same `curl` command above.

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

   The backend loads `.env` from the **repo root** first, then falls back to `apps/api/.env`. Keeping a single root `.env` is the recommended setup.

5. **Start Redis** before running the backend. The default local connection string is already configured in `.env.example`:

   ```bash
   REDIS_URL=redis://127.0.0.1:6379
   ```

   Quick Docker option:

   ```bash
   docker run -d --name sentralio-redis -p 6379:6379 redis:7-alpine
   # next time:
   docker start sentralio-redis
   ```

   Health check:

   ```bash
   redis-cli ping
   # expected: PONG
   ```

6. **Apply database migrations** (committed SQL lives in `apps/api/drizzle`):

   ```bash
   bun run --filter api db:migrate
   ```

7. **Create the first admin user** (there is no default user; logins are checked against the DB):

   ```bash
   cd apps/api
   bun run src/scripts/create-admin.ts --email admin@example.com --name "Admin" --password "YourStrongPass1!"
   ```

   The password must satisfy the policy: at least 8 characters, with one uppercase letter and one special character.

8. **Run both apps in development:**

   ```bash
   # from repo root — runs api + web together
   bun run dev
   ```

   Or run them separately:

   ```bash
   bun run dev:api   # backend on http://localhost:3000
   bun run dev:web   # frontend on http://localhost:5175
   ```

9. **Verify the stack is healthy.** Helpful checks:

   ```bash
   bun run --filter api build
   bun run --filter web build
   cd apps/api && bun run test
   cd apps/web && bun run lint
   ```

   Optional frontend test run if you want to exercise Vitest directly:

   ```bash
   cd apps/web && bunx vitest run
   ```

## Environment variables

All secrets live in `.env` (never committed). Key groups:

- **App** — `APP_PORT` (backend HTTP port, default `3000`), `NODE_ENV` (`development` or `production`)
- **Database** — `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Shopee partner app** — `PARTNER_ID`, `PARTNER_KEY`, `SHOPEE_REDIRECT_URL`
- **Shopee per-shop tokens** (optional) — `SHOP_ID`, `ACCESS_TOKEN`, `REFRESH_TOKEN`
- **Encryption** — `TOKEN_SECRET_KEY` (exactly 32 bytes / 64 hex chars; encrypts Shopee credentials at rest)
- **Authentication** — `AUTH_JWT_SECRET` (≥32 UTF-8 bytes), `AUTH_ALLOWED_ORIGINS` (comma-separated CORS/CSRF allowlist — must include the frontend origin you actually use)
- **Queue / Redis** — `REDIS_URL` (BullMQ worker connection string; queue-backed sync flows will error if Redis is unavailable)
- **Label sender info** — `SHOP_NAME`, `SHOP_PHONE`, `SHOP_CITY`
- **Production only** — `FRONTEND_URL`

> The server validates env on startup and exits immediately if required auth, DB, Shopee partner, or encryption variables are missing. Queue-backed flows also expect Redis to be reachable.

Generate strong secrets with Bun:

```bash
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # TOKEN_SECRET_KEY
bun -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # AUTH_JWT_SECRET
```

## Scripts

### Repo root

- `bun run dev` — run API + web together
- `bun run dev:api` — backend only
- `bun run dev:web` — frontend only

### Backend (`apps/api`)

- `bun run build` — compile Bun server into `dist/`
- `bun run dev` — API in watch mode
- `bun run start` — run API once
- `bun run test` — run API test suite
- `bun run db:generate` — generate Drizzle migration files from schema changes
- `bun run db:migrate` — apply migrations
- `bun run db:studio` — open Drizzle Studio
- `bun run db:seed` — optionally seed Shopee credentials from `.env`
- `bun run create-admin` — create an admin/staff user

### Frontend (`apps/web`)

- `bun run dev` — start Vite dev server
- `bun run build` — type-check and build production assets
- `bun run lint` — run ESLint
- `bun run preview` — preview the production build locally
- `bunx vitest run` — run frontend tests directly via Vitest

## Project structure

```text
apps/
  api/
    drizzle/              committed SQL migrations
    src/
      modules/            thin HTTP modules by domain
      services/           cross-cutting services and integrations
      queue/              BullMQ queues and workers
      scripts/            operational CLI tools
  web/
    src/
      pages/              route-level screens
      components/         feature and shared UI
      auth/               route guards and role matrix
      context/            auth/session state
      lib/                frontend API helpers

docs/
  architecture.md         high-level architecture and deployment notes
```

## Troubleshooting

- **`[queue] Redis error: connect ECONNREFUSED 127.0.0.1:6379`** — Redis is not running or `REDIS_URL` is wrong. Start Redis and retry.
- **Server exits on startup with `[FATAL] AUTH_JWT_SECRET ...` or `AUTH_ALLOWED_ORIGINS ...`** — your `.env` is missing those values or the JWT secret is shorter than 32 bytes.
- **`Missing required environment variable: ...`** — one of `DB_*`, `PARTNER_ID`, `PARTNER_KEY`, or `TOKEN_SECRET_KEY` is unset.
- **Login returns 401 / requests blocked by CORS** — make sure the exact frontend origin (typically `http://localhost:5175`) is listed in `AUTH_ALLOWED_ORIGINS`.
- **Frontend loads but every API call fails** — confirm the API is running on port 3000; the Vite dev proxy forwards `/api` there.
- **Wrong dates / off-by-hours timestamps** — the app assumes WIB (UTC+7). The DB pool sets the session time zone to `+07:00` automatically.

## Security notes

- `.env` and generated SQL dumps are gitignored and must never be committed.
- Shopee `partner_key`, `access_token`, and `refresh_token` are encrypted at rest using `TOKEN_SECRET_KEY`.
- Auth sessions are JWTs stored in HttpOnly cookies with origin/CSRF checks.
- If you fork or clone, rotate all secrets before deploying.
