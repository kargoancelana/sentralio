Kerjakan issue #41 di repo kargoancelana/sentralio, branch feat/auto-boost.
Issue: https://github.com/kargoancelana/sentralio/issues/41
("[Auto Boost] Fix menyeluruh: CSRF port mismatch, error tertelan di frontend, & kejelasan UI/UX")

KONTEKS REPO:
- Monorepo Bun. Backend apps/api (ElysiaJS + Drizzle + MySQL2, port 3000).
  Frontend apps/web (React 19 + Vite). Timezone WIB (UTC+7).
- Checkout & kerja di branch feat/auto-boost. Baca isi issue #41 dulu sebelum coding.

KERJAKAN URUT DARI CRITICAL → MINOR. Per poin, lakukan persis seperti yang ditulis di issue:

[CRITICAL]
1. Port/CSRF 403:
   - apps/web/vite.config.ts → tambahkan `strictPort: true` di blok `server`.
   - apps/api/.env dan .env.example → pastikan AUTH_ALLOWED_ORIGINS memuat origin dev
     yang dipakai (mis. http://localhost:5175), konsisten dgn port Vite & daftar CORS.
2. apps/web/src/hooks/useApi.ts → di catch `useApiMutation.execute`, tetap setError(err.message)
   lalu `throw err` (JANGAN `return null`).

[SHOULD-FIX] (apps/web/src/pages/AutoBoost.tsx)
3. Handler tab "Pengaturan" (Mode Rotasi, Jam Aktif Mulai/Selesai) bungkus pakai useApiMutation
   + toast sukses/gagal (ikut pola toggleMut/handleToggle). Tambah loading state.
4. Toggle visual (knob + warna track) harus reaktif ke `config?.data?.enabled === 1`.
   Tambah label teks Aktif/Nonaktif di samping toggle.
5. Tab "Pengaturan": tambah fallback/empty-state kalau config.data gak ada
   (mis. "Gagal memuat pengaturan, coba refresh").

[UI/UX]
6. Perbaiki copy subtitle header → "Rotasi produk otomatis tiap ~5 menit, dengan cooldown 4 jam per produk (maks. 5 slot)."
7. Tambah indikator scheduler hidup (mis. timestamp "terakhir dijalankan" dari riwayat boost terbaru).
8. Banner jelas saat enabled !== 1: "Auto Boost nonaktif — rotasi tidak berjalan. Aktifkan toggle di kanan atas."
9. Konfirmasi sebelum hapus antrian (pakai komponen Modal yang sudah ada).
10. Tab Status: tambah keterangan slot terpakai (mis. "3/5 slot terpakai").

[MINOR]
11. apps/api/src/services/auto-boost.scheduler.ts → ubah `queueQuery = queueQuery.orderBy(...)`
    jadi pakai `.$dynamic()` biar bebas error type Drizzle.
12. Bersihkan double-cast `as unknown as { success, data }` di AutoBoost.tsx, pakai tipe
    dari apps/web/src/lib/api.ts (AutoBoostConfig, AutoBoostQueueItem, dst).

JANGAN UBAH (sudah benar): getConfig default + upsertConfig merge, PUT /config body optional,
logika scheduler (active hour inklusif/cross-midnight/rotasi NULLs-first/cooldown 4 jam),
shopee-boost.service.ts, permission matrix (auto_boost admin=true staff=false).

SETELAH SELESAI:
- Jalankan `bun run build` di apps/api dan apps/web; pastikan lolos.
- Verifikasi acceptance criteria di issue #41 (toggle persist & gerak, hapus antrian beneran hilang,
  tambah/reorder jalan, toast error muncul saat gagal, banner OFF tampil, copy akurat).
- Commit ke branch feat/auto-boost dengan pesan: "fix(auto-boost): resolve #41 - CSRF port, error handling, UI/UX".
- Tulis ringkasan singkat (walkthrough) per poin yang diubah + file yang disentuh.