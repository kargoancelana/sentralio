Closes #142

## Ringkasan

Rekonsiliasi baseline migration Drizzle agar `bun run db:migrate` bisa dipakai normal ke depannya.

## Perubahan

- `apps/api/drizzle/0000_baseline.sql` — satu migration baseline yang merepresentasikan seluruh skema prod aktual (squash dari 0000-0048)
- `apps/api/drizzle/meta/_journal.json` — satu entry: `0000_baseline`
- `apps/api/drizzle/meta/0000_snapshot.json` — snapshot drizzle terbaru
- `apps/api/drizzle/_archive/` — semua migration lama 0000-0048 diarsipkan (tidak dihapus permanen)
- `apps/api/src/scripts/reconcile-baseline.ts` — script idempoten untuk menandai baseline sebagai sudah applied di `__drizzle_migrations` TANPA menjalankan DDL
- `docs/baseline/prod-actual-schema.sql` — referensi kanonik nama objek asli prod (nama index/FK legacy dari migration manual)

## Catatan: Index/FK naming drift (residual, terdokumentasi)

Baseline dibangun dari schema.ts sehingga nama FK/index menggunakan auto-naming drizzle (misal `idx_hpp_entries_company`), sedangkan prod fisiknya punya nama legacy dari migration manual (misal `hpp_entries_company_id_companies_id_fk`). Semua kolom, tipe data, dan key semantically identik — hanya namanya berbeda.

**Aturan wajib untuk migration ke depan:** Migration yang men-DROP atau RENAME FK/index yang dibuat sebelum baseline WAJIB dicek manual namanya ke `docs/baseline/prod-actual-schema.sql` — jangan percaya nama auto-generated drizzle. Migration add-only (tambah kolom/tabel/index baru) tidak terpengaruh.

## Hasil Verifikasi

### Fase 4 — Drift check: LULUS

`drizzle-kit generate` terhadap `sentralio_baseline_test` (DB kosong yang diisi dari baseline):

```
No schema changes, nothing to migrate
```

mysqldump diff analysis: 0 structural drift — semua kolom, tipe data, UNIQUE KEY, PRIMARY KEY identik antara baseline-built dan prod-actual.

### Fase 6 — Idempotensi di clone: LULUS

```
# Run 1 di sentralio_prodclone
[reconcile-baseline] Hash not found. Inserting baseline record (no DDL executed)...
[reconcile-baseline] Baseline record inserted.

# db:migrate setelah reconcile
migrations applied successfully!   <- no-op, tidak ada DDL baru

# Run 2 (idempoten)
[reconcile-baseline] Baseline hash already present — no-op.
```

## Fase 7 — Runbook Cutover Prod (JANGAN dieksekusi tanpa review)

Prasyarat: PR sudah di-review dan di-approve. Lakukan saat traffic rendah.

### Langkah-langkah

1. **Backup prod dulu (WAJIB)**

```bash
mysqldump -u <user> -p<pass> --no-tablespaces sentralio > backup_prod_before_baseline.sql
```

2. **Deploy kode terbaru** (branch ini sudah di-merge ke main dan di-deploy ke server)

3. **Jalankan reconcile-baseline.ts terhadap prod**

```bash
DB_NAME=sentralio bun run apps/api/src/scripts/reconcile-baseline.ts
```

Output yang diharapkan: `Baseline record inserted.` (atau `no-op` jika sudah pernah dijalankan). Tidak ada DDL yang dieksekusi.

4. **Verify db:migrate = no-op**

```bash
DB_NAME=sentralio bun run --filter api db:migrate
```

Output yang diharapkan: `migrations applied successfully!` dengan tidak ada tabel baru dibuat.

5. **Catatan untuk bootstrap environment baru (DB kosong):**

Setelah `db:migrate`, jalankan seed untuk membuat `companies(id=1)` agar FK `company_id DEFAULT 1` valid:

```bash
DB_NAME=<db_baru> bun run --filter api db:seed
```

Tanpa seed ini, app tidak bisa boot di environment fresh karena semua tabel tenant punya `company_id DEFAULT 1` yang merujuk ke `companies(1)` yang belum ada.

6. **Rollback plan** jika ada masalah:
   - Script reconcile hanya INSERT ke `__drizzle_migrations`, tidak menyentuh skema.
   - Untuk rollback: `DELETE FROM __drizzle_migrations WHERE hash = '83a7fff3ccfdd747703669c2af0717335220ff2b4aa7ddd852617e2852402fc4';`
   - Restore dari backup jika diperlukan.
