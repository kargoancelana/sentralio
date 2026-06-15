# Architecture

## Apps

| App | Stack | Notes |
|-----|-------|-------|
| `apps/api` | Bun + ElysiaJS + Drizzle ORM + MySQL | Serves `/api/*` on `:3000` |
| `apps/web` | React 19 + Vite + TypeScript | SPA; talks to API via relative `/api` |

In **development**, Vite proxies `/api` → `localhost:3000`.  
In **production**, Caddy strips the `/api` prefix and forwards to the Bun process on `:3000`.

---

## Backend layering

```
HTTP request
  └─ modules/<domain>/<domain>.route.ts   ← thin: parse input, call service, return response
       └─ modules/<domain>/<domain>.service.ts  ← business logic, validation, DB queries
            └─ Drizzle ORM  ←  db/schema.ts (single source of truth)
                 └─ MySQL
```

Cross-cutting / external integrations live in `apps/api/src/services/`:
- Shopee API client (token management, OAuth)
- Label rendering + cache
- Background sync (orders, escrow)
- Escrow/settlement sync

---

## Core domains (glossary)

### Shopee integration
OAuth "connect shop" flow, order sync, escrow/settlement sync, and automatic
token refresh. Tokens are encrypted at rest using `TOKEN_SECRET_KEY` (AES-GCM).

### Soft connect / disconnect
Disconnecting a shop hides its data and pauses sync without deleting anything.
Reconnect restores data access and resumes sync.

### Orders
List + filtering, batch shipment (dropoff / pickup), batch label print,
"tertunda" (held) order detection.

### HPP (Harga Pokok Penjualan)
Per-variation cost of goods, with full audit history per entry.

### Packing cost
Master packing-cost table + per-order packing cost assignment.

### Profit & loss
Per-order / per-product analytics:  
`profit = revenue − HPP − packing − Shopee fees − Shopee Ads expense`  
Ads expense is auto-refreshed to track retroactive adjustments.

### Auth
Session JWT in `HttpOnly` cookie. Admin / staff roles. Brute-force lockout on
the login endpoint.

---

## Key data flows

> Fill in / refine these as the codebase evolves.

- [ ] **Shopee OAuth connect**: Settings → Integrasi Toko → callback → token stored encrypted
- [ ] **Order sync pipeline**: `background-sync.service.ts` → `orders` table → `order_items`
- [ ] **Escrow/settlement sync**: settlement data → profit recalculation per order
- [ ] **Label generation + cache**: on-demand render → cached file → served to client

---

## Deployment

| Component | Detail |
|-----------|--------|
| Server | VPS, single domain `sentralio.my.id` |
| Reverse proxy | Caddy (strips `/api`, serves web from `apps/web/dist`) |
| API process | `sentralio-api` (Bun, port `:3000`) |
| Database | MySQL, local to VPS (not exposed publicly) |

**Frontend deploy steps (after any web change):**

```bash
git pull
bun run --filter web build   # rebuilds apps/web/dist
# then restart sentralio-api (or reload Caddy if only static files changed)
```

For full commands see the Notion "Panduan Deploy Sentralio ke VPS".
