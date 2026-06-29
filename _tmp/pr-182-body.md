Closes #182

## File berubah (7)
- `lib/api.ts` — tambah `SubscriptionOrder`, `SubscriptionPlan`, `SubscriptionStatus` interface + 6 method api (register, subscriptionStatus/Plans/Orders/CreateOrder/UploadProof). Upload proof pakai `headers: {}` untuk multipart.
- `context/AuthContext.tsx` — tambah `subscriptionActive: boolean | null` ke `AuthApi` + state; fetch `/subscription/status` setelah login & refreshMe; reset di logout
- `auth/SubscriptionGate.tsx` (baru) — redirect ke `/langganan` kalau `subscriptionActive === false`; null/true = render normal
- `pages/Register.tsx` (baru) — form daftar publik (companyName, name, email, username opsional, password, confirmPassword). Sukses → redirect `/login` setelah 1.5s. Error 409/400 tampil ramah.
- `pages/Langganan.tsx` (baru) — standalone (tanpa Layout), fetch paralel status+orders+plans. State machine: aktif → CTA masuk app; tidak ada order → plan picker; pending tanpa bukti → upload form; pending + bukti → menunggu verifikasi + cek status. Riwayat order selalu tampil.
- `App.tsx` — tambah `/register` publik; restruktur ProtectedRoute: `/langganan` sejajar tanpa gate, sisanya dalam `SubscriptionGate > Layout`
- `pages/Login.tsx` — tambah link "Belum punya akun? Daftar" → `/register`

## Acceptance criteria
- [x] `/register` publik, sukses → redirect `/login`, error 409/400 ramah
- [x] Login page punya link ke `/register`
- [x] Login dengan akun pending → auto-mendarat di `/langganan` (subscriptionActive false → SubscriptionGate redirect)
- [x] `/langganan`: pilih paket → buat order → upload bukti (multipart field `file`) → menunggu verifikasi → cek status
- [x] Login dengan akun aktif → langsung Dashboard, tidak ke-redirect
- [x] `SubscriptionBanner` & listener 402 tidak diubah (tetap sebagai fallback)

## Build
`bun run --filter web build` → ✅ built in 1.99s, 0 error, 0 TS diagnostics
