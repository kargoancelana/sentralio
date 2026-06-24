/**
 * reconcile-baseline.ts
 *
 * Marks the 0000_baseline migration as "already applied" in __drizzle_migrations
 * WITHOUT executing any DDL. Safe to run against any DB that already has the
 * full prod schema (sentralio_prodclone, prod itself, etc.).
 *
 * Usage:
 *   DB_NAME=sentralio_prodclone bun run apps/api/src/scripts/reconcile-baseline.ts
 *
 * Idempotent: if the hash is already present, this is a no-op.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import mysql from "mysql2/promise";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from repo root
config({ path: resolve(__dirname, "../../../../.env") });
config();

const DB_HOST     = process.env.DB_HOST     ?? "localhost";
const DB_PORT     = Number(process.env.DB_PORT ?? 3306);
const DB_USER     = process.env.DB_USER     ?? "root";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const DB_NAME     = process.env.DB_NAME     ?? "sentralio";

// Path to the baseline SQL file (relative to this script's location)
// __dirname = apps/api/src/scripts → naik 2 level ke apps/api/drizzle
const BASELINE_SQL_PATH = join(__dirname, "../../drizzle/0000_baseline.sql");

// Journal entry `when` value (milliseconds) from meta/_journal.json
// This is used as created_at in __drizzle_migrations.
const BASELINE_WHEN = 1782286054038;

async function main() {
  console.log(`[reconcile-baseline] Connecting to ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_USER}`);

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });

  try {
    // ── Step 1: Ensure __drizzle_migrations table exists ──────────────────
    console.log("[reconcile-baseline] Step 1: ensuring __drizzle_migrations table exists...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`hash\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        \`created_at\` bigint DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`id\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[reconcile-baseline] __drizzle_migrations table: OK");

    // ── Step 2: Compute SHA-256 hash of baseline SQL (same as drizzle) ────
    console.log("[reconcile-baseline] Step 2: computing hash of 0000_baseline.sql...");
    let baselineContent: string;
    try {
      baselineContent = readFileSync(BASELINE_SQL_PATH, "utf8");
    } catch (e) {
      throw new Error(`Cannot read baseline file at ${BASELINE_SQL_PATH}: ${e}`);
    }
    const hash = createHash("sha256").update(baselineContent).digest("hex");
    console.log(`[reconcile-baseline] Hash: ${hash}`);

    // ── Step 3: Check current state ────────────────────────────────────────
    console.log("[reconcile-baseline] Step 3: checking current state...");
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY id"
    );
    console.log(`[reconcile-baseline] Current rows in __drizzle_migrations: ${rows.length}`);
    if (rows.length > 0) {
      rows.forEach(r => console.log(`  id=${r.id} hash=${String(r.hash).slice(0, 16)}... created_at=${r.created_at}`));
    }

    // ── Step 4: Insert if not present ──────────────────────────────────────
    const alreadyPresent = rows.some(r => r.hash === hash);
    if (alreadyPresent) {
      console.log("[reconcile-baseline] ✅ Baseline hash already present — no-op.");
    } else {
      console.log("[reconcile-baseline] Hash not found. Inserting baseline record (no DDL executed)...");
      await conn.execute(
        "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        [hash, BASELINE_WHEN]
      );
      console.log("[reconcile-baseline] ✅ Baseline record inserted.");
    }

    // ── Step 5: Print final state ──────────────────────────────────────────
    const [finalRows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY id"
    );
    console.log(`[reconcile-baseline] Final state (${finalRows.length} row(s)):`);
    finalRows.forEach(r => console.log(`  id=${r.id} hash=${String(r.hash).slice(0, 16)}... created_at=${r.created_at}`));
    console.log("[reconcile-baseline] Done.");

  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("[reconcile-baseline] FATAL:", err);
  process.exit(1);
});
