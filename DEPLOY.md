# Deploy Guide

## Deploy ke VPS (one-shot)

```bash
./deploy.sh
```

<<<<<<< HEAD
Step urutan:

1. `git pull origin main`
2. `bun install`
3. `bun run --filter api db:migrate` ← **migration WAJIB sebelum restart**
4. `bun run --filter web build`
5. `sudo systemctl restart sentralio-api`

`set -euo pipefail` — jika ada step gagal, script berhenti dan API **tidak** di-restart.
=======
Script ini menjalankan urutan berikut secara berurutan:

1. `git pull origin main`
2. `bun install`
3. `bun run --filter api db:migrate` ← **migration WAJIB jalan sebelum restart**
4. `bun run --filter web build`
5. `sudo systemctl restart sentralio-api`

> **Penting:** Script memakai `set -euo pipefail`. Jika salah satu step gagal
> (misalnya `db:migrate` error karena schema drift), script **berhenti dan API
> tidak di-restart**. Ini sengaja — lebih baik API lama tetap jalan daripada
> API baru crash karena DB ketinggalan.
>>>>>>> origin/main

---

## Satu kali: reconcile-baseline.ts (DB baru / fresh clone)

<<<<<<< HEAD
Untuk DB dari skema prod lama (sebelum PR #144), jalankan **sekali saja** sebelum `db:migrate` pertama:
=======
Untuk DB yang dibangun dari skema prod lama (sebelum baseline migration PR #144),
jalankan **sekali saja** sebelum `db:migrate` pertama:
>>>>>>> origin/main

```bash
bun run apps/api/src/scripts/reconcile-baseline.ts
```

<<<<<<< HEAD
=======
Setelah itu `db:migrate` bisa dipakai normal. Jangan masukkan perintah ini ke
`deploy.sh` rutin — sudah dijalankan di prod dan bersifat one-time.

>>>>>>> origin/main
---

## Catatan MySQL di VPS (auth_socket)

<<<<<<< HEAD
```bash
sudo mysql        # bukan mysql -p
```

=======
MySQL di VPS dikonfigurasi dengan `auth_socket`. Login pakai:

```bash
sudo mysql
# atau
sudo mysql -u root
```

**Jangan** pakai `-p` (prompt password) — akan gagal karena auth via socket,
bukan password.

>>>>>>> origin/main
---

## Aturan: setiap ubah schema.ts WAJIB generate migration

<<<<<<< HEAD
```bash
bun run --filter api db:generate
# Commit file migration yang di-generate
```

Jangan jalankan `db:generate` di VPS.

---

## Shopee Push Webhook

### Caddy / reverse proxy

Endpoint webhook: `POST /shopee/webhook`

Pastikan path di-proxy ke API (port 3000), **bukan** frontend SPA. Tambahkan rule berikut **sebelum** catch-all SPA di Caddyfile:

```caddy
handle /api/* {
    uri strip_prefix /api
    reverse_proxy localhost:3000
}
```

URL yang didaftarkan ke Shopee Console: `https://sentralio.my.id/api/shopee/webhook`

### Env yang dibutuhkan

```
# "Live Push Partner Key" dari Shopee Console > Push Mechanism
# Kosongkan jika sama dengan PARTNER_KEY (fallback otomatis).
SHOPEE_PUSH_PARTNER_KEY=

# URL callback persis seperti yang didaftarkan di Shopee Console
SHOPEE_WEBHOOK_CALLBACK_URL=https://sentralio.my.id/api/shopee/webhook
```

### Verifikasi

1. Set callback URL di Shopee Console > Push Mechanism
2. Klik **Verify** — harus dapat 2xx
3. Test push → cek log API: `[shopee-push] Push received: { code: 3, ... }`
=======
Setiap kali menambah kolom, tabel, atau index baru di `apps/api/src/db/schema.ts`:

```bash
bun run --filter api db:generate
# Commit file migration yang di-generate (apps/api/drizzle/XXXX_*.sql)
```

**Jangan** jalankan `db:generate` di VPS — itu hanya untuk development. File
migration di-generate di lokal lalu di-commit bersama perubahan schema, sehingga
`db:migrate` di VPS tinggal apply file yang sudah ada.

Tanpa langkah ini, kode akan merujuk kolom yang belum ada di DB → Unknown column
→ 500 error → UI terlihat kosong (persis bug yang memicu issue ini).
>>>>>>> origin/main
