Closes #142

## Ringkasan

Rekonsiliasi baseline migration Drizzle agar `bun run db:migrate` bisa dipakai normal ke depannya.

## Perubahan

- `apps/api/drizzle/0000_baseline.sql` — satu migration baseline yang merepresentasikan seluruh skema prod aktual (squash dari 0000-0048)
- `apps/api/drizzle/meta/_journal.json` — satu entry: `0000_baseline`
- `apps/api/drizzle/meta/0000_snapshot.json` — snapshot drizzle terbaru
- `apps/api/drizzle/_archive/` — semua migration lama 0000-0048 diarsipkan (tidak dihapus permanen)
- `apps/api/src/scripts/reconcile-baseline.ts` — script idempoten untuk menandai baseline sebagai sudah applied di `__drizzle_migrations` TANPA menjalankan DDL

## Hasil Verifikasi

### Fase 4 — Drift check: LULUS

`drizzle-kit generate` terhadap `sentralio_baseline_test` (DB kosong yang diisi dari baseline):

```
No schema changes, nothing to migrate
```

schema.ts == baseline == prod. Zero drift.

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

5. **Rollback plan** jika ada masalah:
   - Script reconcile hanya INSERT ke `__drizzle_migrations`, tidak menyentuh skema.
   - Untuk rollback: `DELETE FROM __drizzle_migrations WHERE hash = '83a7fff3ccfdd747703669c2af0717335220ff2b4aa7ddd852617e2852402fc4';`
   - Restore dari backup jika diperlukan.
