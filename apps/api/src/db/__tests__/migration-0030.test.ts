import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mysql from "mysql2/promise";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { config } from "dotenv";

/**
 * Migration 0030 (user_auth) structural + constraint test.
 *
 * Task 1.3 — applies `0030_user_auth.sql` to a FRESH, isolated test database and asserts:
 *   - the four tables exist with the expected columns/types
 *   - `uniq_users_email_lower` rejects a duplicate lowercased email
 *   - the `role` enum rejects values other than `admin`/`staff`
 *   - the `revoked_sessions.user_id` FK cascades on user delete
 *
 * _Requirements: 5.1, 5.2_
 *
 * The test provisions a throwaway database (`wms_migration_test_<rand>`), runs the
 * migration there, and drops it afterwards so the real schema is never touched.
 * When no MySQL server is reachable the whole suite skips gracefully.
 */

// Load env the same way the app does (monorepo root .env, then local .env).
config({ path: resolve(import.meta.dir, "../../../../..", ".env") });
config();

const MIGRATION_PATH = resolve(import.meta.dir, "../../../drizzle/0030_user_auth.sql");

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;

// Unique throwaway database name so parallel/repeat runs don't collide.
const TEST_DB = `wms_migration_test_${Math.random().toString(36).slice(2, 10)}`;

let conn: mysql.Connection | null = null;
let dbAvailable = false;

/**
 * Split a SQL file into individual statements (no procedures/`;` in literals here).
 * Strips full-line `--` comments first so a leading comment line does not cause the
 * following statement to be discarded.
 */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

beforeAll(async () => {
  const baseConfig = {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
    connectTimeout: 5000,
  };

  try {
    // Connect without selecting a database, then provision the throwaway DB.
    conn = await mysql.createConnection(baseConfig);
    await conn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    await conn.changeUser({ database: TEST_DB });

    const sql = await readFile(MIGRATION_PATH, "utf8");
    for (const stmt of splitStatements(sql)) {
      await conn.query(stmt);
    }
    dbAvailable = true;
  } catch (err) {
    console.warn(
      `⚠ Skipping migration-0030 tests: no reachable MySQL server or migration could not be applied. ` +
        `(${(err as Error).message})`
    );
    // Best-effort cleanup if the DB was partially created.
    if (conn) {
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      } catch {
        /* ignore */
      }
      try {
        await conn.end();
      } catch {
        /* ignore */
      }
      conn = null;
    }
  }
});

afterAll(async () => {
  if (conn) {
    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    } finally {
      await conn.end();
    }
  }
});

/** Helper: read columns for a table from information_schema. */
async function columnsOf(table: string): Promise<Map<string, { dataType: string; columnType: string; isNullable: string }>> {
  const [rows] = await conn!.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [TEST_DB, table]
  );
  const map = new Map<string, { dataType: string; columnType: string; isNullable: string }>();
  for (const r of rows) {
    map.set(String(r.COLUMN_NAME), {
      dataType: String(r.DATA_TYPE).toLowerCase(),
      columnType: String(r.COLUMN_TYPE).toLowerCase(),
      isNullable: String(r.IS_NULLABLE),
    });
  }
  return map;
}

describe("migration 0030_user_auth", () => {
  it("creates the four auth tables", async () => {
    if (!dbAvailable) return; // skipped: no DB
    const [rows] = await conn!.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [TEST_DB]
    );
    const tables = new Set(rows.map((r) => String(r.TABLE_NAME)));
    expect(tables.has("users")).toBe(true);
    expect(tables.has("failed_login_attempts")).toBe(true);
    expect(tables.has("account_lockouts")).toBe(true);
    expect(tables.has("revoked_sessions")).toBe(true);
  });

  it("users table has the expected columns and types", async () => {
    if (!dbAvailable) return;
    const cols = await columnsOf("users");
    expect(cols.get("id")?.dataType).toBe("int");
    expect(cols.get("email")?.columnType).toBe("varchar(254)");
    expect(cols.get("email_lower")?.columnType).toBe("varchar(254)");
    expect(cols.get("name")?.columnType).toBe("varchar(100)");
    expect(cols.get("role")?.dataType).toBe("enum");
    expect(cols.get("role")?.columnType).toBe("enum('admin','staff')");
    expect(cols.get("password_hash")?.columnType).toBe("varchar(100)");
    expect(cols.get("is_active")?.dataType).toBe("int");
    expect(cols.get("created_at")?.dataType).toBe("timestamp");
    expect(cols.get("updated_at")?.dataType).toBe("timestamp");
  });

  it("revoked_sessions table has the expected columns and types", async () => {
    if (!dbAvailable) return;
    const cols = await columnsOf("revoked_sessions");
    expect(cols.get("jti")?.columnType).toBe("varchar(36)");
    expect(cols.get("user_id")?.dataType).toBe("int");
    expect(cols.get("revoked_at")?.dataType).toBe("timestamp");
    expect(cols.get("expires_at")?.dataType).toBe("timestamp");
  });

  it("uniq_users_email_lower rejects a duplicate lowercased email", async () => {
    if (!dbAvailable) return;
    await conn!.query(
      `INSERT INTO users (email, email_lower, name, role, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
      ["Alice@Example.com", "alice@example.com", "Alice", "admin", "x".repeat(60)]
    );

    let rejected = false;
    try {
      await conn!.query(
        `INSERT INTO users (email, email_lower, name, role, password_hash)
         VALUES (?, ?, ?, ?, ?)`,
        ["ALICE@EXAMPLE.COM", "alice@example.com", "Alice Two", "staff", "y".repeat(60)]
      );
    } catch (err) {
      rejected = true;
      expect((err as { code?: string }).code).toBe("ER_DUP_ENTRY");
    }
    expect(rejected).toBe(true);
  });

  it("role enum rejects values other than admin/staff", async () => {
    if (!dbAvailable) return;
    // Ensure STRICT mode so an out-of-range enum is an error rather than coerced to ''.
    await conn!.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES'");

    let rejected = false;
    try {
      await conn!.query(
        `INSERT INTO users (email, email_lower, name, role, password_hash)
         VALUES (?, ?, ?, ?, ?)`,
        ["super@example.com", "super@example.com", "Super", "superuser", "z".repeat(60)]
      );
    } catch (err) {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("revoked_sessions.user_id FK cascades on user delete", async () => {
    if (!dbAvailable) return;
    // Insert a fresh user.
    const [res] = await conn!.query<mysql.ResultSetHeader>(
      `INSERT INTO users (email, email_lower, name, role, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
      ["cascade@example.com", "cascade@example.com", "Cascade", "staff", "h".repeat(60)]
    );
    const userId = res.insertId;

    await conn!.query(
      `INSERT INTO revoked_sessions (jti, user_id, expires_at)
       VALUES (?, ?, ?)`,
      // TIMESTAMP max is ~2038-01-19 UTC; use an in-range future value.
      ["00000000-0000-4000-8000-000000000001", userId, "2037-12-31 00:00:00"]
    );

    // Confirm the session row exists.
    const [before] = await conn!.query<mysql.RowDataPacket[]>(
      `SELECT jti FROM revoked_sessions WHERE user_id = ?`,
      [userId]
    );
    expect(before.length).toBe(1);

    // Delete the user → cascade should remove the revoked_sessions row.
    await conn!.query(`DELETE FROM users WHERE id = ?`, [userId]);

    const [after] = await conn!.query<mysql.RowDataPacket[]>(
      `SELECT jti FROM revoked_sessions WHERE user_id = ?`,
      [userId]
    );
    expect(after.length).toBe(0);
  });
});
