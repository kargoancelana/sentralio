/**
 * Backfill Shopee Ads Daily Expense
 *
 * Mengisi cache `shopee_ads_daily_expense` untuk rentang tanggal yang sudah
 * lewat (default: 180 hari ke belakang sampai kemarin) sehingga Laporan
 * Keuangan bisa menampilkan kolom "Biaya Iklan" untuk periode mana pun
 * tanpa harus menunggu user membuka periode itu dulu.
 *
 * Service `getShopExpense` sudah cache-first + idempotent (upsert), jadi
 * script ini aman di-rerun. Sub-range otomatis di-split ke maksimal 30
 * hari oleh service supaya patuh limit Shopee Ads daily-performance API.
 *
 * Usage:
 *   bun run apps/api/src/scripts/backfill-ads-expense.ts [days] [--force]
 *
 *   - days    : opsional, jumlah hari ke belakang (default: 180)
 *   - --force : opsional, paksa tarik ulang dari Shopee (timpa cache lama).
 *               Gunakan ini untuk mengoreksi data lama yang sudah "beku" di
 *               cache padahal Shopee sudah merevisi angkanya.
 *
 * Catatan:
 *   - Shopee Ads API hanya menyimpan data ~6 bulan (180 hari) ke belakang.
 *   - Tanggal hari ini di-skip (akan di-handle oleh scheduler hot tier).
 *   - Per-shop loop sequential supaya tidak memicu rate-limit lintas toko.
 */

import { db, pool } from "../db/client";
import { shopeeCredentials } from "../db/schema";
import { getShopExpense } from "../services/ads-expense.service";

// ─── WIB Helpers ──────────────────────────────────────────────

const WIB_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayWib(): string {
  return WIB_FORMATTER.format(new Date());
}

/** Returns "YYYY-MM-DD" `daysBack` calendar days before today (WIB). */
function wibDateOffset(daysBack: number): string {
  const ms = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return WIB_FORMATTER.format(new Date(ms));
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const forceRefresh = args.includes("--force");
  const daysArg = args.find((a) => !a.startsWith("--"));
  const argDays = Number.parseInt(daysArg ?? "180", 10);
  if (!Number.isInteger(argDays) || argDays < 1 || argDays > 365) {
    console.error(
      `[backfill-ads] Invalid days argument "${daysArg}" — must be integer 1..365`
    );
    process.exit(1);
  }

  // Range: dari `argDays` hari yang lalu sampai KEMARIN (today di-skip
  // karena Hot tier scheduler yang refresh today setiap 30 menit).
  const startDate = wibDateOffset(argDays);
  const endDate = wibDateOffset(1);
  const today = todayWib();

  console.log("[backfill-ads] ═══════════════════════════════════════");
  console.log("[backfill-ads] Backfill Shopee Ads Daily Expense");
  console.log("[backfill-ads] ═══════════════════════════════════════");
  console.log(`[backfill-ads] Today (WIB)   : ${today}`);
  console.log(`[backfill-ads] Start date    : ${startDate}`);
  console.log(`[backfill-ads] End date      : ${endDate}  (today excluded)`);
  console.log(`[backfill-ads] Days to cover : ${argDays}`);
  console.log(`[backfill-ads] Force refresh : ${forceRefresh ? "YES (overwrite cache)" : "no (cache-first)"}`);
  console.log("");

  // Ambil daftar toko
  const shops = await db
    .select({ shopId: shopeeCredentials.shopId, shopName: shopeeCredentials.shopName })
    .from(shopeeCredentials);

  if (shops.length === 0) {
    console.warn("[backfill-ads] No shops found, nothing to backfill");
    await pool.end();
    return;
  }

  console.log(`[backfill-ads] Found ${shops.length} shop(s) to backfill\n`);

  const totalsPerShop: Array<{
    shopId: number;
    shopName: string;
    totalRupiah: number;
    durationMs: number;
    error?: string;
  }> = [];

  for (const shop of shops) {
    const label = `${shop.shopName ?? "Unknown"} (${shop.shopId})`;
    console.log(`[backfill-ads] ▶ ${label}: fetching ${startDate}..${endDate}`);
    const startedAt = Date.now();

    try {
      const total = await getShopExpense(shop.shopId, startDate, endDate, { forceRefresh });
      const duration = Date.now() - startedAt;
      totalsPerShop.push({
        shopId: shop.shopId,
        shopName: shop.shopName ?? "",
        totalRupiah: total,
        durationMs: duration,
      });
      console.log(
        `[backfill-ads]   ✓ Total Rp ${total.toLocaleString("id-ID")} in ${(duration / 1000).toFixed(1)}s`
      );
    } catch (err: any) {
      const duration = Date.now() - startedAt;
      const code = err?.code ?? "unknown_error";
      const msg = err?.message ?? String(err);
      totalsPerShop.push({
        shopId: shop.shopId,
        shopName: shop.shopName ?? "",
        totalRupiah: 0,
        durationMs: duration,
        error: `${code}: ${msg}`,
      });
      console.warn(`[backfill-ads]   ✗ Failed: ${code} — ${msg}`);
    }

    // Jeda 1 detik antar shop supaya rate-limit per-partner-API kebagi
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Summary
  console.log("\n[backfill-ads] ═══════════════════════════════════════");
  console.log("[backfill-ads] Summary");
  console.log("[backfill-ads] ═══════════════════════════════════════");
  let grandTotal = 0;
  let okCount = 0;
  let failCount = 0;
  for (const row of totalsPerShop) {
    if (row.error) {
      failCount++;
      console.log(
        `  ✗ ${row.shopName} (${row.shopId}): ${row.error}`
      );
    } else {
      okCount++;
      grandTotal += row.totalRupiah;
      console.log(
        `  ✓ ${row.shopName} (${row.shopId}): Rp ${row.totalRupiah.toLocaleString("id-ID")}`
      );
    }
  }
  console.log("[backfill-ads] ───────────────────────────────────────");
  console.log(`[backfill-ads] Shops OK      : ${okCount}`);
  console.log(`[backfill-ads] Shops failed  : ${failCount}`);
  console.log(`[backfill-ads] Grand total   : Rp ${grandTotal.toLocaleString("id-ID")}`);
  console.log("[backfill-ads] ═══════════════════════════════════════");

  await pool.end();

  if (failCount > 0 && okCount === 0) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("[backfill-ads] Fatal error:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
