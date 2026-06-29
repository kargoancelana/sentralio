Closes #173

## File berubah
- `apps/api/src/db/schema.ts` — append `subscriptionOrderStatusEnum` + `subscriptionOrders` di bawah blok Fase 3
- `apps/api/drizzle/0003_chubby_lockjaw.sql` (baru) — CREATE TABLE `subscription_orders` + FK (companies, plans, platform_admins) + 3 index; add-only
- `apps/api/drizzle/meta/0003_snapshot.json` + `_journal.json` — diupdate otomatis drizzle-kit
- `apps/api/src/config/env.ts` — tambah 5 var S3 (`s3Endpoint`, `s3Region`, `s3Bucket`, `s3AccessKeyId`, `s3SecretAccessKey`) dengan default string kosong; **TIDAK masuk `requiredEnv`**
- `apps/api/src/services/storage.service.ts` (baru) — lazy S3Client init, `isStorageConfigured()`, `uploadProof()`, `getProofPresignedUrl()`
- `.env.example` — tambah placeholder S3 vars dengan komentar

## Scope 4.1 (tidak ada endpoint HTTP)
- ✅ Schema + migration
- ✅ Storage service (lazy init, no boot crash)
- ✅ Env vars opsional
- ❌ Endpoint submit/upload (→ 4.2)
- ❌ Endpoint approve/reject portal (→ 4.3)

## Migration isi
```sql
CREATE TABLE `subscription_orders` (12 kolom)
ALTER TABLE ADD CONSTRAINT FK → companies, plans, platform_admins
CREATE INDEX idx_subscription_orders_company
CREATE INDEX idx_subscription_orders_status
CREATE INDEX idx_subscription_orders_company_status
```
Tidak ada DROP/ALTER tabel lain.

## Boot-safety verifikasi
- `isStorageConfigured()` return `false` saat env S3 kosong → import tidak throw
- `getClient()` hanya dipanggil dari `uploadProof()` / `getProofPresignedUrl()` (belum ada yang memanggil di 4.1)

## Gate smoke-boot
```
Server running at http://localhost:3000
[CRON] Token auto-refresh scheduled every 3h
[queue] Redis connected
[STARTUP] Staff permissions cache loaded
```
Server start tanpa throw TANPA env S3 di-set. Background sync berjalan normal (Shopee order-sync, escrow-sync terlihat di log).

## tsc --noEmit
0 diagnostics di semua file yang diubah/dibuat.

## ⚠️ Pre-deploy catatan
Env S3 tidak perlu diisi sekarang — belum ada yang memanggil storage. Wajib diisi sebelum Fase 4.2 live.
