# Deploy Guide

## Deploy ke VPS (one-shot)

```bash
./deploy.sh
```

Step urutan:

1. `git pull origin main`
2. `bun install`
3. `bun run --filter api db:migrate` ← **migration WAJIB sebelum restart**
4. `bun run --filter web build`
5. `sudo systemctl restart sentralio-api`

`set -euo pipefail` — jika ada step gagal, script berhenti dan API **tidak** di-restart.

---

## Satu kali: reconcile-baseline.ts (DB baru / fresh clone)

Untuk DB dari skema prod lama (sebelum PR #144), jalankan **sekali saja** sebelum `db:migrate` pertama:

```bash
bun run apps/api/src/scripts/reconcile-baseline.ts
```

---

## Catatan MySQL di VPS (auth_socket)

```bash
sudo mysql        # bukan mysql -p
```

---

## Aturan: setiap ubah schema.ts WAJIB generate migration

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
