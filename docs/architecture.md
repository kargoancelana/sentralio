# Architecture

## Apps

| App | Stack | Notes |
|-----|-------|-------|
| `apps/api` | Bun + ElysiaJS + Drizzle ORM + MySQL | Serves the backend on `:3000` |
| `apps/web` | React 19 + Vite + TypeScript | SPA that talks to the API via relative `/api` |

In **development**, Vite proxies `/api` to `http://localhost:3000`.  
In **production**, Caddy strips the `/api` prefix and forwards requests to the Bun process on `:3000`.

## Runtime building blocks

| Concern | Implementation |
|---------|----------------|
| Primary database | MySQL |
| Queue-backed sync | BullMQ + Redis |
| Background recurring sync | In-process intervals plus MySQL sync-state locking |
| Auth | JWT in `HttpOnly` cookie |
| Reverse proxy / static hosting | Caddy |
| Process supervisor | systemd (`sentralio-api`) |

---

## Backend layering

```text
HTTP request
  └─ modules/<domain>/<domain>.route.ts      thin HTTP layer
       └─ modules/<domain>/<domain>.service.ts   business logic and validation
            └─ Drizzle ORM
                 └─ db/schema.ts             single source of truth
                      └─ MySQL
```

Cross-cutting or external integrations live in `apps/api/src/services/`, for example:

- Shopee API client and token management
- Label rendering and cache
- Background sync and sync-state locking
- Escrow/settlement sync
- API call monitoring / rate-limit handling

---

## Sync model

Sentralio currently uses **two complementary sync mechanisms**.

### 1. Queue-backed flows (BullMQ + Redis)

These are the user-visible flows that need durable jobs, retries, and progress tracking:

- **Onboarding backfill** when a new shop connects
- **Reconnect gap-sync** when a previously disconnected shop reconnects
- **Recurring product sync** on a scheduler
- **Manual retry** of failed initial sync from the UI

Relevant files:

- `apps/api/src/queue/connection.ts`
- `apps/api/src/queue/index.ts`
- `apps/api/src/queue/queues.ts`
- `apps/api/src/queue/onboarding.worker.ts`
- `apps/api/src/queue/gap-sync.worker.ts`
- `apps/api/src/queue/products-sync.worker.ts`

Startup signals to expect in logs:

```text
[queue] Redis connected
[queue] N worker(s) started
[queue] Scheduling recurring jobs...
```

### 2. Background recurring sync (process timers + MySQL locks)

Some recurring sync work is still handled in-process without Redis, coordinated via MySQL state/locking:

- active order refresh
- escrow refresh
- ads refresh
- stuck-order checks
- other periodic sync maintenance in `background-sync.service.ts`

This split is intentional: queue-backed flows handle shop lifecycle and retryable long-running jobs, while timer-driven flows continue to cover recurring maintenance work.

---

## Core domains

### Shopee integration
OAuth connect flow, encrypted token storage, order sync, escrow sync, automatic token refresh, reconnect handling.

### Product master
Master products, channel listings, SKU/model mapping, stock propagation, recurring product sync.

### Orders
Order list, filtering, held-order detection, batch shipment flows, label generation.

### HPP (Harga Pokok Penjualan)
Per-variation cost of goods with audit history.

### Packing cost
Master packing-cost table and per-order packing-cost assignment.

### Profit & loss
Per-order and per-product analytics:

```text
profit = revenue - HPP - packing - Shopee fees - Shopee Ads expense
```

Ads expense is refreshed to track Shopee's retroactive adjustments.

### Auth
Session JWT in `HttpOnly` cookie with role-based authorization for `admin` and `staff`.

---

## Key data flows

### Shopee OAuth connect

```text
Frontend Settings / Integrasi Shopee
  -> GET /api/shopee/auth/url
  -> user authorizes in Shopee
  -> POST /api/shopee/auth/exchange
  -> credentials stored encrypted in MySQL
  -> onboarding or reconnect job enqueued when applicable
```

### New shop onboarding backfill

```text
OAuth exchange succeeds
  -> enqueue onboarding job
  -> worker runs products -> orders -> escrow -> ads
  -> sync progress stored on shopee_credentials
  -> frontend polls /api/shopee/sync-status for badge/progress UI
```

### Reconnect gap-sync

```text
Previously disconnected shop reconnects
  -> reconnect handler reads disconnected_at
  -> enqueue gap-sync job for the missing period only
  -> worker syncs the gap window
  -> shop resumes normal recurring sync coverage
```

### Recurring product sync

```text
BullMQ scheduler
  -> enqueue products-sync-all every 8 hours
  -> worker loops active shops
  -> per-shop errors are logged without halting the whole recurring run
```

### Background order / escrow / ads maintenance

```text
background-sync.service.ts intervals
  -> acquire sync-state lock in MySQL
  -> query connected shops
  -> refresh domain-specific data
  -> release / recover stale locks
```

---

## Frontend interaction model

- The SPA uses a relative `/api` base path from `apps/web/src/lib/api.ts`
- Vite proxies `/api` to `http://localhost:3000` during development
- Session auth uses cookies, so frontend requests must keep `credentials: 'include'`
- The Shopee integration screen surfaces sync state with polling, progress labels, and retry actions

---

## Deployment

| Component | Detail |
|-----------|--------|
| Domain | `sentralio.my.id` |
| Reverse proxy | Caddy |
| Static assets | `apps/web/dist` |
| API process | `sentralio-api` on `:3000` |
| Database | MySQL on the VPS |
| Queue backing service | Redis on the VPS |

Typical deploy shape:

```text
git pull
bun install
bun run --filter api db:migrate
bun run --filter web build
systemctl restart sentralio-api
```

If queue-backed sync features are part of the release, Redis must be installed and reachable before the new build is started.

For exact production commands and ops runbooks, see the internal Notion deployment guide.
