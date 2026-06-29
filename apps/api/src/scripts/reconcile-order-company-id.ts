/**
 * reconcile-order-company-id.ts
 *
 * Data repair sekali-jalan: menyelaraskan (reconcile) company_id pada
 * shopee_orders & shopee_order_items dari sumber kebenaran
 * shopee_credentials (via shop_id).
 *
 * Latar belakang:
 *   Sebagian baris shopee_orders sempat ter-insert tanpa company_id eksplisit
 *   (jatuh ke DEFAULT 1). Script ini menyembuhkan baris yang company_id-nya
 *   TIDAK cocok dengan company_id pemilik toko-nya (via shopee_credentials),
 *   lalu merembetkannya ke shopee_order_items (via order_sn).
 *
 *   Idempotent — hanya menyentuh baris yang mismatch; aman dijalankan berkali-kali.
 *   No-op di lingkungan single-company (semua sudah company_id = 1).
 *
 *   Asal-usul: dulu berupa file SQL orphan apps/api/drizzle/0002_fix_order_company_id.sql
 *   yang TIDAK pernah masuk journal drizzle (jadi tidak pernah dijalankan db:migrate),
 *   dan prefix 0002_-nya menabrak 0002_oval_garia.sql. Dipindah ke sini sebagai
 *   script sekali-jalan supaya rapi & tidak membingungkan penomoran migration.
 *
 * MODE --dry-run (DEFAULT):
 *   Hanya MENGHITUNG berapa baris mismatch (yang akan diperbaiki). TIDAK mengubah data.
 *
 * MODE --apply:
 *   Menjalankan UPDATE perbaikan dan melaporkan jumlah baris yang berubah.
 *
 * Usage:
 *   # Dry-run (default — aman, tidak mengubah data)
 *   bun run apps/api/src/scripts/reconcile-order-company-id.ts
 *   bun run apps/api/src/scripts/reconcile-order-company-id.ts --dry-run
 *
 *   # Apply (mengeksekusi perbaikan)
 *   bun run apps/api/src/scripts/reconcile-order-company-id.ts --apply
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env dari monorepo root (4 level ke atas dari file ini)
config({ path: resolve(import.meta.dir, "../../../..", ".env") });
config(); // fallback: .env di cwd

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

// ─── Argument Parsing ─────────────────────────────────────────
const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isDryRun = !isApply; // dry-run is DEFAULT

// ─── SQL: hitung mismatch (dry-run) ───────────────────────────
const COUNT_ORDERS = `
  SELECT COUNT(*) AS cnt
  FROM \`shopee_orders\` o
  JOIN \`shopee_credentials\` c ON o.shop_id = c.shop_id
  WHERE o.company_id <> c.company_id
`;
const COUNT_ITEMS = `
  SELECT COUNT(*) AS cnt
  FROM \`shopee_order_items\` oi
  JOIN \`shopee_orders\` o ON oi.order_sn = o.order_sn
  WHERE oi.company_id <> o.company_id
`;

// ─── SQL: perbaikan (apply) — PERSIS seperti 0002_fix_order_company_id.sql ──
const FIX_ORDERS = `
  UPDATE \`shopee_orders\` o
    JOIN \`shopee_credentials\` c ON o.shop_id = c.shop_id
  SET o.company_id = c.company_id
  WHERE o.company_id <> c.company_id
`;
const FIX_ITEMS = `
  UPDATE \`shopee_order_items\` oi
    JOIN \`shopee_orders\` o ON oi.order_sn = o.order_sn
  SET oi.company_id = o.company_id
  WHERE oi.company_id <> o.company_id
`;

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

  console.log("[reconcile-order-company-id] ════════════════════════════════════════");
  console.log("[reconcile-order-company-id] Reconcile company_id orders & order_items");
  console.log("[reconcile-order-company-id] ════════════════════════════════════════");
  console.log(`[reconcile-order-company-id] Mode : ${mode}`);
  console.log("");

  try {
    if (isDryRun) {
      const ordersRes = await db.execute(sql.raw(COUNT_ORDERS));
      const itemsRes = await db.execute(sql.raw(COUNT_ITEMS));
      const ordersCnt = Number((ordersRes[0] as unknown as Array<{ cnt: number | string }>)[0]?.cnt ?? 0);
      const itemsCnt = Number((itemsRes[0] as unknown as Array<{ cnt: number | string }>)[0]?.cnt ?? 0);

      console.log(`[reconcile-order-company-id] shopee_orders mismatch      : ${ordersCnt.toLocaleString("id-ID")} baris`);
      console.log(`[reconcile-order-company-id] shopee_order_items mismatch : ${itemsCnt.toLocaleString("id-ID")} baris`);
      console.log("");
      console.log("[reconcile-order-company-id] ℹ️  Dry-run selesai — TIDAK ada data yang diubah.");
      console.log("[reconcile-order-company-id]    Jalanin dengan --apply untuk mengeksekusi perbaikan.");
    } else {
      // Urutan WAJIB: orders dulu (dari credentials), baru items (dari orders yang sudah benar).
      const ordersRes = await db.execute(sql.raw(FIX_ORDERS));
      const itemsRes = await db.execute(sql.raw(FIX_ITEMS));
      const ordersAffected = Number((ordersRes[0] as { affectedRows?: number }).affectedRows ?? 0);
      const itemsAffected = Number((itemsRes[0] as { affectedRows?: number }).affectedRows ?? 0);

      console.log(`[reconcile-order-company-id] shopee_orders diperbaiki      : ${ordersAffected.toLocaleString("id-ID")} baris`);
      console.log(`[reconcile-order-company-id] shopee_order_items diperbaiki : ${itemsAffected.toLocaleString("id-ID")} baris`);
      console.log("");
      console.log("[reconcile-order-company-id] ✅ Apply selesai.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[reconcile-order-company-id] ❌ Fatal error: ${message}`);
  process.exit(1);
});
