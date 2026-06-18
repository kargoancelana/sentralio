/**
 * Backfill Company ID
 *
 * Menyiapkan data untuk migrasi multi-tenant (Issue 0.3) dengan men-set
 * company_id = 1 ke semua baris existing di tabel tenant-scoped.
 *
 * Tabel yang termasuk tenant-scoped:
 *   - users
 *   - shopee_credentials
 *   - shopee_orders
 *   - shopee_order_items
 *   - shopee_order_fees
 *   - sync_state
 *   - product_groups
 *   - products
 *   - label_cache
 *   - shopee_ads_daily_expense
 *   - auto_boost_config
 *   - auto_boost_queue
 *   - auto_boost_log
 *
 * MODE --dry-run (DEFAULT):
 *   Hanya MENGHITUNG dan melaporkan jumlah baris per tabel yang akan
 *   di-set company_id=1. TIDAK mengubah data apapun.
 *
 * MODE --apply:
 *   ⚠️  BELUM AKTIF — kolom company_id belum ada di tabel (ditambah di Issue 0.3).
 *   Flag ini di-guard dan akan keluar dengan pesan informatif.
 *   Implementasi UPDATE akan ditambahkan saat Issue 0.3 dikerjakan.
 *
 * Usage:
 *   # Dry-run (default — aman, tidak mengubah data)
 *   bun run apps/api/src/scripts/backfill-company.ts
 *   bun run apps/api/src/scripts/backfill-company.ts --dry-run
 *
 *   # Apply (belum aktif di Issue 0.2 — akan diaktifkan di Issue 0.3)
 *   bun run apps/api/src/scripts/backfill-company.ts --apply
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env dari monorepo root (4 level ke atas dari file ini)
config({ path: resolve(import.meta.dir, "../../../..", ".env") });
config(); // fallback: .env di cwd

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

// ─── Tabel tenant-scoped yang akan di-backfill di Issue 0.3 ──
//
// Kolom company_id BELUM ada di semua tabel ini — ditambahkan di Issue 0.3.
// Saat ini kita hanya menghitung jumlah baris sebagai verifikasi awal.
//
// Catatan:
//   - master_products, master_product_variants, hpp_entries,
//     master_packing_cost_entries, packing_cost_entries, cost_audit_log
//     → GLOBAL (tidak tenant-scoped), tidak perlu backfill company_id.
//   - staff_permissions, account_lockouts, failed_login_attempts,
//     revoked_sessions → auth/security tables, penanganan di Issue 0.3.
const TENANT_SCOPED_TABLES = [
  "users",
  "shopee_credentials",
  "shopee_orders",
  "shopee_order_items",
  "shopee_order_fees",
  "sync_state",
  "product_groups",
  "products",
  "label_cache",
  "shopee_ads_daily_expense",
  "auto_boost_config",
  "auto_boost_queue",
  "auto_boost_log",
] as const;

type TenantTable = (typeof TENANT_SCOPED_TABLES)[number];

// ─── Argument Parsing ─────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply"); // dry-run is DEFAULT
const isApply = args.includes("--apply");

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 2,
    timezone: "+07:00",
  });

  const db = drizzle(pool, { mode: "default" });

  const mode = isDryRun ? "DRY-RUN" : "APPLY";

  console.log("[backfill-company] ════════════════════════════════════════");
  console.log("[backfill-company] Backfill Company ID — Issue 0.2 / 0.3");
  console.log("[backfill-company] ════════════════════════════════════════");
  console.log(`[backfill-company] Mode        : ${mode}`);
  console.log(`[backfill-company] Target      : company_id = 1 ("Company Utama")`);
  console.log(`[backfill-company] Tables      : ${TENANT_SCOPED_TABLES.length}`);
  console.log("");

  // ─── Guard: --apply belum diimplementasikan (Issue 0.3) ───
  if (isApply) {
    console.warn("[backfill-company] ⚠️  --apply mode is NOT YET ACTIVE.");
    console.warn("[backfill-company]    Kolom company_id belum ada di tabel tenant-scoped.");
    console.warn("[backfill-company]    Kolom company_id akan ditambahkan di Issue 0.3.");
    console.warn("[backfill-company]    Jalanin --dry-run dulu untuk memverifikasi hitungan baris.");
    console.warn("[backfill-company]    --apply akan diaktifkan dan diimplementasikan di Issue 0.3.");
    await pool.end();
    process.exit(0);
  }

  // ─── Dry-run: hitung baris per tabel ──────────────────────
  console.log("[backfill-company] Menghitung baris per tabel (tidak ada data yang diubah)...");
  console.log("");

  const results: Array<{ table: TenantTable; rowCount: number; error?: string }> = [];
  let grandTotal = 0;
  let errorCount = 0;

  for (const table of TENANT_SCOPED_TABLES) {
    try {
      const rows = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM \`${table}\``));
      // drizzle execute returns [rows, fields]; rows is array of row objects
      const rowData = rows[0] as Array<{ cnt: number | string }>;
      const count = Number(rowData[0]?.cnt ?? 0);
      results.push({ table, rowCount: count });
      grandTotal += count;
      console.log(`[backfill-company]   ${table.padEnd(32)} : ${count.toLocaleString("id-ID")} baris`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ table, rowCount: 0, error: message });
      errorCount++;
      console.warn(`[backfill-company]   ${table.padEnd(32)} : ❌ Error — ${message}`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────
  console.log("");
  console.log("[backfill-company] ════════════════════════════════════════");
  console.log("[backfill-company] Ringkasan Dry-Run");
  console.log("[backfill-company] ════════════════════════════════════════");
  for (const r of results) {
    if (r.error) {
      console.log(`  ❌ ${r.table.padEnd(32)} : Error — ${r.error}`);
    } else {
      console.log(`  ✅ ${r.table.padEnd(32)} : ${r.rowCount.toLocaleString("id-ID")} baris`);
    }
  }
  console.log("[backfill-company] ────────────────────────────────────────");
  console.log(`[backfill-company] Total baris yang akan di-backfill : ${grandTotal.toLocaleString("id-ID")}`);
  console.log(`[backfill-company] Tabel berhasil dihitung            : ${results.length - errorCount}/${TENANT_SCOPED_TABLES.length}`);
  if (errorCount > 0) {
    console.warn(`[backfill-company] Tabel gagal                        : ${errorCount}`);
  }
  console.log("[backfill-company] ════════════════════════════════════════");
  console.log("[backfill-company] ℹ️  Dry-run selesai — TIDAK ada data yang diubah.");
  console.log("[backfill-company]    Jalanin dengan --apply setelah Issue 0.3 menambahkan kolom company_id.");
  console.log("[backfill-company] ════════════════════════════════════════");

  await pool.end();

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch(async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[backfill-company] ❌ Fatal error: ${message}`);
  process.exit(1);
});
