# Sentralio Web

Frontend for Sentralio, built with React 19, Vite, and TypeScript.

See the [root README](../../README.md) for full project setup. This file focuses on frontend-specific development details.

## Development

From the repo root:

```bash
bun run dev      # run api + web together
bun run dev:web  # web only
```

Or from `apps/web`:

```bash
bun run dev
```

The dev server runs on **`http://localhost:5175`** with `strictPort: true`.

Important implications:

- the API must be running on `http://localhost:3000`
- `AUTH_ALLOWED_ORIGINS` in the root `.env` must include `http://localhost:5175`
- if you intentionally change the Vite port, update both `vite.config.ts` and `AUTH_ALLOWED_ORIGINS`

## API proxy behavior

During development, Vite proxies frontend requests from `/api` to `http://localhost:3000` and strips the `/api` prefix before forwarding.

That means frontend code should call the backend through relative paths such as:

```ts
fetch('/api/auth/login', { credentials: 'include' })
```

The API helper layer lives in `src/lib/api.ts`.

## Scripts

Run these from `apps/web`:

- `bun run dev` — start the Vite dev server
- `bun run build` — type-check and build for production
- `bun run lint` — run ESLint
- `bun run preview` — preview the production build
- `bunx vitest run` — run frontend tests directly via Vitest
- `bunx vitest` — run Vitest in watch mode

## Structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Route-level screens |
| `src/components/` | Feature and shared UI components |
| `src/auth/` | Route guards and role matrix |
| `src/context/` | Session/auth state |
| `src/lib/` | API helpers and shared client utilities |

## UX areas worth knowing

- The Shopee integration screen shows sync status, progress labels, and retry actions for onboarding/backfill flows.
- Session auth is cookie-based, so requests must keep `credentials: 'include'`.
- Route access is controlled by `ProtectedRoute` and the `admin` / `staff` role matrix.

## Build output

Production assets are emitted into `apps/web/dist`. In production, Caddy serves the built frontend and forwards API traffic to the Bun backend.

## Troubleshooting

### Requests fail even though the page loads

Usually one of these is wrong:

1. API server is not running on port `3000`
2. frontend is not running on port `5175`
3. `AUTH_ALLOWED_ORIGINS` does not include the current frontend origin

### Login works in one tab but not another device/browser

Session auth is based on cookies, so browser cookie policy, domain, and origin configuration all matter.

### Production build fails

Run these first to narrow it down:

```bash
bun run lint
bun run build
bunx vitest run
```
