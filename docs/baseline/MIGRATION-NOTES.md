# Migration Baseline Notes

Dibuat: 24 Jun 2026 — Issue #142 (Fase B baseline reconciliation)

---

## Konteks

`apps/api/drizzle/0000_baseline.sql` adalah squash dari migration 0000–0048.
Baseline ini dibangun dari `schema.ts` menggunakan `drizzle-kit generate`, sehingga
nama FK/index menggunakan **auto-naming drizzle** — berbeda dari nama legacy di prod
yang dibuat bertahap via migration manual.

Referensi kanonik nama asli prod ada di: `docs/baseline/prod-actual-schema.sql`

---

## ⚠️ Aturan wajib untuk migration ke depan

### DROP / RENAME FK atau index pre-baseline

Migration yang men-**DROP** atau **RENAME** FK/index yang sudah ada **sebelum baseline**
WAJIB dicek nama aslinya di `docs/baseline/prod-actual-schema.sql` — **jangan percaya
nama auto-generated drizzle**.

Contoh bahaya:
- Drizzle generate: `DROP INDEX hpp_entries_company_id_companies_id_fk`
- Nama asli di prod: `idx_hpp_entries_company`
- Akibat: query gagal di prod karena nama tidak ditemukan

**Migration add-only (tambah kolom / tabel / index baru) tidak terpengaruh.**

### Tabel referensi nama legacy (sampel)

| Nama di drizzle-generated baseline | Nama asli di prod |
|------------------------------------|-------------------|
| `hpp_entries_company_id_companies_id_fk` | `idx_hpp_entries_company` |
| `hpp_entries_variant_id_master_product_variants_id_fk` | `idx_hpp_variant` |
| `master_packing_cost_entries_company_id_companies_id_fk` | `idx_master_packing_cost_entries_company` |
| `fk_master_packing_master_product` (sama) | `fk_master_packing_master_product` |
| `auto_boost_config_company_id_companies_id_fk` | `idx_auto_boost_config_company` |

Daftar lengkap: lihat `docs/baseline/prod-actual-schema.sql`.

---

## Bootstrap environment baru (DB kosong)

Setelah `bun run --filter api db:migrate` di DB fresh, **app belum bisa boot** karena
semua tabel tenant punya `company_id DEFAULT 1` yang FK ke `companies(id=1)` yang belum ada.

Wajib jalankan seed setelah migrate:

```bash
DB_NAME=<db_baru> bun run --filter api db:seed
```

Seed ini membuat row `companies(id=1, name='Default', slug='default')` agar FK valid.

Urutan bootstrap environment baru:
1. `db:migrate` — buat semua tabel
2. `db:seed` — isi `companies(id=1)` (dan data seed lain)
3. Jalankan app

---

## Catatan charset residual

Tabel `password_reset_tokens` di prod menggunakan `utf8mb4_0900_ai_ci` (default server saat dibuat),
sedangkan baseline menggunakan `utf8mb4_unicode_ci` (default drizzle dari koneksi).
Keduanya case-insensitive dan kolom token adalah hex hash → behaviour identik.
Drizzle tidak track collation per-kolom di snapshot, jadi tidak akan generate ALTER spurious.
Tidak perlu diubah.
