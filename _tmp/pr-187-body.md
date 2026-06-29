Closes #187

## File berubah (5)
- `lib/platformApi.ts` — tambah `PlatformOrder`, `PlatformOrderStatus` interface + `platformOrderApi` wrapper (list, pendingCount, proofUrl, approve, reject)
- `pages/platform/PlatformOrders.tsx` (baru) — tabel antrian order lintas company, filter status (Pending/Approved/Rejected/Semua), modal preview bukti (gambar inline / PDF embed + fallback link), modal approve (konfirmasi), modal reject (textarea alasan wajib)
- `components/platform/PlatformLayout.tsx` — tambah NavLink `/platform/orders` antara Companies & Plans; badge merah angka pending (fetch mount, sembunyi saat 0)
- `pages/platform/PlatformDashboard.tsx` — kartu "Order menunggu review: N" dengan link ke /platform/orders; highlight merah kalau N > 0
- `App.tsx` — tambah `<Route path="/platform/orders" element={<PlatformOrders />} />`

## Fitur
- Filter status default ke Pending (antrian kerja)
- Lihat bukti: jpg/png → `<img>` inline; pdf → `<embed>` + link fallback; 404 → pesan ramah; 503 → pesan storage belum set
- Approve: modal konfirmasi → toast sukses → refetch list
- Reject: textarea alasan wajib, disabled kalau kosong, 400 dari server ditangkap → refetch list
- Badge angka pending di sidebar selalu visible selama di portal

## Build
`bun run --filter web build` → ✅ built in 2.68s, 0 error, 0 TS diagnostics

## Tidak diubah
- Backend (PR #186/188)
- `PlatformCompanyDetail.tsx` form assign manual tetap ada
- Flow tenant, AuthContext, SubscriptionBanner
