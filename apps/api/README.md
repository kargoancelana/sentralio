# Sentralio API

Backend service for Sentralio. Built with Bun, ElysiaJS, Drizzle ORM, MySQL, BullMQ, and Redis.

See the [root README](../../README.md) for full end-to-end project setup. This file focuses on backend-specific development and operations.

## What lives here

- HTTP routes for auth, users, orders, product master, HPP, packing cost, Shopee integration, and reports
- Business logic and DB access through module services
- Queue workers for onboarding backfill, reconnect gap-sync, and recurring product sync
- Background recurring sync services and operational scripts

## Prerequisites

From the repo root you still need:

- Bun
- MySQL
- Redis
- A populated root `.env`

The API expects Redis to be reachable through `REDIS_URL` (default `redis://127.0.0.1:6379`). If Redis is down, queue-backed sync features will fail and the API will log connection errors.

## Common commands

Run these from `apps/api` unless noted otherwise.

```bash
bun run dev          # watch mode
bun run build        # compile into dist/
bun run start        # run once
bun run test         # API test suite
bun run db:generate  # generate Drizzle migrations
bun run db:migrate   # apply migrations
bun run db:studio    # open Drizzle Studio
bun run db:seed      # optionally seed Shopee credentials from .env
bun run create-admin # create a user
```

Repo-root equivalents:

```bash
bun run dev:api
bun run --filter api build
bun run --filter api db:migrate
```

## Important directories

| Path | Purpose |
|------|---------|
| `src/modules/` | Thin HTTP modules plus domain services |
| `src/services/` | Cross-cutting services and integrations |
| `src/queue/` | BullMQ connection, queues, schedulers, workers |
| `src/scripts/` | Operational CLI utilities |
| `drizzle/` | Committed SQL migrations |
| `drizzle.config.ts` | Drizzle configuration |

## Sync architecture

There are two sync styles in the backend:

### Queue-backed sync (needs Redis)

Used for durable, retryable, progress-aware jobs:

- new-shop onboarding backfill
- reconnect gap-sync
- recurring product sync
- manual retry from the sync-status UI

Watch for these logs on startup:

```text
[queue] Redis connected
[queue] 3 worker(s) started
[queue] Scheduling recurring jobs...
```

Key files:

- `src/queue/connection.ts`
- `src/queue/index.ts`
- `src/queue/onboarding.worker.ts`
- `src/queue/gap-sync.worker.ts`
- `src/queue/products-sync.worker.ts`

### Background recurring sync (does not use Redis)

Used for in-process recurring maintenance coordinated through MySQL locks/state:

- active order refresh
- escrow refresh
- ads refresh
- stale lock recovery

Key file:

- `src/services/background-sync.service.ts`

## Operational notes

- Root `.env` is the preferred source of configuration.
- The server assumes WIB (`UTC+7`) for app-level date handling.
- Shopee credentials are encrypted at rest with `TOKEN_SECRET_KEY`.
- For frontend login to work in development, `AUTH_ALLOWED_ORIGINS` must include the exact frontend origin you use.

## Related docs in this folder

- [`CORS_CONFIGURATION.md`](./CORS_CONFIGURATION.md)
- [`RATE_LIMITING.md`](./RATE_LIMITING.md)
- [`RATE_LIMITING_SETUP.md`](./RATE_LIMITING_SETUP.md)
- [`SECURITY_MIGRATION.md`](./SECURITY_MIGRATION.md)

## Troubleshooting

### Redis connection refused

If you see this on boot:

```text
[queue] Redis error: connect ECONNREFUSED 127.0.0.1:6379
```

Start Redis or fix `REDIS_URL`, then restart the API.

### Login blocked by CORS / CSRF

Confirm `AUTH_ALLOWED_ORIGINS` includes the frontend origin, which is `http://localhost:5175` by default.

### Queue jobs are not progressing

Check in order:

1. Redis is running
2. the API boot logs show workers started
3. the shop is connected and credentials are valid
4. the sync-status endpoint is returning progress data
