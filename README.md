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

## Available Scripts

- `bun run dev` - run API in watch mode
- `bun run start` - run API once
- `bun run db:generate` - generate drizzle migration files
- `bun run db:migrate` - apply migrations
- `bun run db:studio` - open Drizzle Studio

## Base Endpoints

- `GET /` - service status message
- `GET /health` - service and database connectivity check
