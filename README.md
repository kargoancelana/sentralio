# wms-sync

Backend foundation project using Bun, ElysiaJS, Drizzle ORM, and MySQL.

## Requirements

- Bun v1.3+
- MySQL server

## Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create `.env` from `.env.example`, then adjust the values:

   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env

   # macOS/Linux
   cp .env.example .env
   ```

3. Run development server:

   ```bash
   bun run dev
   ```

## Database migrations

After `.env` points to a valid MySQL database:

```bash
bun run db:migrate
```

## Seed (dummy data)

Clears `products` and `product_groups`, then inserts one group with three Shopee listings (dummy IDs). **Use only in development.**

```bash
bun run db:seed
```

## Available Scripts

- `bun run dev` - run API in watch mode
- `bun run start` - run API once
- `bun run db:generate` - generate drizzle migration files
- `bun run db:migrate` - apply migrations
- `bun run db:studio` - open Drizzle Studio
- `bun run db:seed` - insert dummy product groups / listings

## Base Endpoints

- `GET /` - service status message
- `GET /health` - service and database connectivity check

## Product stock sync (Shopee listings, one store)

- `PATCH /products/:id/stock` — body `{ "stock": <number> }` — sets stock from one listing ID and propagates to every listing in the same `product_group`, then calls the dummy Shopee updater per listing.
- `PATCH /products/by-shopee-item/:shopeeItemId/stock` — same as above, keyed by dummy `shopee_item_id`.

Response shape: `{ groupId, updatedCount, shopee: [{ productId, ok }] }`.
