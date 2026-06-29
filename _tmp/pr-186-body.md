Closes #186

## File berubah (4)
- `platform-orders.service.ts` (baru) — `listAllOrders`, `getOrderProofKey`, `approveOrder`, `rejectOrder`; semua DB-injectable
- `platform-orders.route.ts` (baru) — guard copy dari platform-companies; 5 endpoint
- `index.ts` — mount `platformOrdersRoutes` sejajar `platformPlansRoutes`
- `platform-orders.service.test.ts` (baru) — **11 tests, 0 fail**

## Endpoint
| Method | Path | Keterangan |
|---|---|---|
| GET | /platform/orders | list order lintas company, filter ?status= |
| GET | /platform/orders/pending-count | count badge dashboard |
| GET | /platform/orders/:id/proof-url | presigned URL bukti (503 kalau S3 belum set) |
| POST | /platform/orders/:id/approve | approve → subscription + company aktif (atomic) |
| POST | /platform/orders/:id/reject | reject + note wajib |

## Approve transaction (atomic)
1. order → approved, reviewedBy + reviewedAt
2. auto-cancel subscriptions active company
3. INSERT subscription baru (endsAt = now + durationDays)
4. company → active

## Verifikasi
- tsc: 0 diagnostics
- bun test: **11 pass, 0 fail**
- Smoke-boot: `Server running at http://localhost:3000` ✅
- NO migration, NO env baru, NO schema change
