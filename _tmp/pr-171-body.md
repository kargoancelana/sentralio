Closes #171

## File berubah
- `apps/api/src/modules/auth/subscription-guard.middleware.ts` (baru) — Elysia plugin `subscription-guard`, onBeforeHandle global, lazy-expire + cek active sub, exempt `/auth`, `/health`, `/subscription`, return 402 `subscription_required`
- `apps/api/src/modules/platform/platform-subscriptions.service.ts` — tambah `getActiveSubscription(companyId, now)`: lazy-expire row active yang ends_at <= now → UPDATE status='expired', lalu SELECT 1 row active valid, return SubscriptionItem | null
- `apps/api/src/modules/subscription/subscription.route.ts` (baru) — `GET /subscription/status` → `{ ok, active, subscription }`, always 200, exempt dari guard
- `apps/api/src/index.ts` — import + mount: `subscriptionRoutes` lalu `subscriptionGuardMiddleware` persis setelah `authProtectedRoutes`, sebelum `permissionsRoutes`
- `apps/web/src/lib/api.ts` — intercept 402 `subscription_required` → dispatch `wms.subscription-blocked` event (sejajar pola 401)
- `apps/web/src/context/AuthContext.tsx` — state `subscriptionBlocked: boolean`, listener `wms.subscription-blocked` → set true; reset false saat login/refreshMe sukses
- `apps/web/src/components/subscription/SubscriptionBanner.tsx` (baru) — banner merah sticky + overlay hard-block + tombol Logout; fetch `/subscription/status` saat mount untuk detail planName/endsAt
- `apps/web/src/components/layout/Layout.tsx` — render `<SubscriptionBanner />` di atas `<div className="wms-shell">`

## Posisi mount (index.ts)
```
.use(authMiddleware)
.use(authProtectedRoutes)        // /auth/* tetap bisa diakses
.use(subscriptionRoutes)         // GET /subscription/status (exempt)
.use(subscriptionGuardMiddleware) // 402 enforcement
.use(permissionsRoutes)
.use(featureGuardMiddleware)
... feature routes ...
```

## Edge cases yang diverifikasi
- `/auth/me`, `/auth/logout`, `/subscription/status` → selalu lolos (exempt + mount sebelum guard)
- Platform `/platform/*` tidak terpengaruh (dimount sebelum authMiddleware tenant)
- Lazy-expire idempoten: row `cancelled`/`expired` tidak disentuh
- `subscriptionBlocked` direset saat login/refreshMe → banner ilang setelah assign + reload

## Verifikasi build
- `tsc --noEmit`: 0 diagnostics di semua 8 file
- `bun run --filter web build`: ✅ 2299 modules, built in 2.17s, 0 error

## ⚠️ Pre-deploy WAJIB
Assign langganan aktif ke semua company yang masih dipakai di portal Super Admin (`/platform/companies/:id` → Langganan → Assign) SEBELUM deploy PR ini. Tanpa itu semua user tenant langsung keblokir saat enforcement live.
