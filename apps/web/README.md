# WMS-Sync — Web

Frontend for WMS-Sync, built with React 19, Vite, and TypeScript. See the [root README](../../README.md) for full project setup.

## Development

```bash
# from repo root (runs api + web together)
bun run dev

# or web only
bun run dev:web
```

Dev server runs on `http://localhost:5173` (falls forward to 5174–5179 if the port is taken). Make sure the matching port is listed in `AUTH_ALLOWED_ORIGINS` in the root `.env`.

## Scripts

- `bun run dev` — start Vite dev server
- `bun run build` — type-check and build for production
- `bun run preview` — preview the production build
- `bun run lint` — run ESLint
- `bun run test` — run the Vitest suite

## Structure

- `src/pages/` — feature pages (Dashboard, PesananSaya, MasterProduk, ProdukChannel, LaporanKeuangan, Pengaturan, IntegrasiShopee, UsersAdmin, Login)
- `src/auth/` — role matrix and route guards (`ProtectedRoute`, `RoleGate`)
- `src/context/` — `AuthContext` for session state
- `src/components/` — shared UI components

## Authentication

The app uses session-based auth (JWT in an HttpOnly cookie). Routes are protected by `ProtectedRoute`, and feature visibility is controlled by a role matrix (`admin` / `staff`) in `src/auth/matrix.ts`.
