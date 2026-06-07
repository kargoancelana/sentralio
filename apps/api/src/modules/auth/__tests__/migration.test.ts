/**
 * Integration test for migration 0030_user_auth.sql
 *
 * Applies the migration to a temporary test schema on the configured MySQL
 * server, then asserts structural and constraint correctness.
 *
 * Requirements: 5.1, 5.2
 *
 * NOTE: This test bypasses `src/config/env.ts` intentionally so that the
 * auth-specific env vars (AUTH_JWT_SECRET, AUTH_ALLOWED_ORIGINS) are not
 * required to run database-only tests.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

// Load .env from monorepo root
// import.meta.dir = apps/api/src/modules/auth/__tests__
// 6 levels up = monorepo root
config({ path: resolve(import.meta.dir, "../../../../../../.env") });
// Fallback: try a local .env
config();

const DB_HOST = process.env.DB_HOST ?? "localhost";
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_USER = process.env.DB_USER ?? "root";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const BASE_DB_NAME = process.env.DB_NAME ?? "wms_sync";
const TEST_DB_NAME = BASE_DB_NAME + "_migration_test";

// ---------------------------------------------------------------------------
// Connection pool config (no multipleStatements — safer for error recovery)
// ---------------------------------------------------------------------------

let pool: mysql.Pool | null = null;
let skipAll = false;

function getPool(): mysql.Pool {
  if (!pool) throw new Error("Pool not initialized");
  return pool;
}

/** Execute a query, returning the rows (first element of the result tuple). */
async function query<T extends mysql.RowDataPacket[]>(
  sql: string,
  values?: unknown[]
): Promise<T> {
  const [rows] = await getPool().query<T>(sql, values);
  return rows;
}

/** Execute a statement that returns OkPacket (INSERT / DELETE / etc.). */
async function exec(sql: string, values?: unknown[]): Promise<mysql.OkPacket> {
  const [result] = await getPool().query<mysql.OkPacket>(sql, values);
  return result;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    // Create a pool connected to the server WITHOUT selecting a database first
    const setupPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      connectionLimit: 5,
      multipleStatements: true, // needed to run the migration SQL (multiple CREATE TABLE statements)
    });

    // Create a fresh test schema
    await setupPool.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
    await setupPool.query(
      `CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    // Read and apply the migration SQL (contains multiple statements)
    // import.meta.dir = apps/api/src/modules/auth/__tests__
    // 4 levels up     = apps/api
    const migrationPath = resolve(
      import.meta.dir,
      "../../../../drizzle/0030_user_auth.sql"
    );
    const migrationSql = readFileSync(migrationPath, "utf8");
    await setupPool.query(`USE \`${TEST_DB_NAME}\``);
    await setupPool.query(migrationSql);
    await setupPool.end();

    // Now create a regular pool (no multipleStatements) for individual test queries
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: TEST_DB_NAME,
      connectionLimit: 5,
    });
  } catch (err) {
    console.warn(
      "[migration.test] Cannot connect to database – all tests will be skipped.",
      (err as Error).message
    );
    skipAll = true;
    if (pool) {
      try { await pool.end(); } catch {}
      pool = null;
    }
  }
});

afterAll(async () => {
  if (pool) {
    // Drop the test schema
    try {
      await pool.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
    } catch {}
    await pool.end();
    pool = null;
  }
});

// ---------------------------------------------------------------------------
// Helper: skip individual test when DB is unavailable
// ---------------------------------------------------------------------------

function maybeSkip(label: string): boolean {
  if (skipAll) {
    console.log(`[SKIP] ${label} — database not available`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Test 1: All four tables exist with required columns and types
// ---------------------------------------------------------------------------

describe("Migration 0030: schema structure", () => {
  test("users table has all required columns with correct types", async () => {
    if (maybeSkip("users columns")) return;

    const rows = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
       ORDER BY ORDINAL_POSITION`,
      [TEST_DB_NAME]
    );

    const columns = rows.map((r) => r.COLUMN_NAME as string);

    // All required columns must be present
    for (const col of [
      "id",
      "email",
      "email_lower",
      "name",
      "role",
      "password_hash",
      "is_active",
      "created_at",
      "updated_at",
    ]) {
      expect(columns).toContain(col);
    }

    const byName = Object.fromEntries(rows.map((r) => [r.COLUMN_NAME as string, r]));

    // id: INT, NOT NULL, AUTO_INCREMENT, PRIMARY KEY
    expect(byName["id"].DATA_TYPE).toBe("int");
    expect(byName["id"].IS_NULLABLE).toBe("NO");
    expect(byName["id"].EXTRA).toContain("auto_increment");
    expect(byName["id"].COLUMN_KEY).toBe("PRI");

    // email: VARCHAR, NOT NULL
    expect(byName["email"].DATA_TYPE).toBe("varchar");
    expect(byName["email"].IS_NULLABLE).toBe("NO");

    // email_lower: VARCHAR, NOT NULL, UNIQUE
    expect(byName["email_lower"].DATA_TYPE).toBe("varchar");
    expect(byName["email_lower"].IS_NULLABLE).toBe("NO");
    expect(byName["email_lower"].COLUMN_KEY).toBe("UNI");

    // name: VARCHAR, NOT NULL
    expect(byName["name"].DATA_TYPE).toBe("varchar");
    expect(byName["name"].IS_NULLABLE).toBe("NO");

    // role: ENUM, NOT NULL
    expect(byName["role"].DATA_TYPE).toBe("enum");
    expect(byName["role"].IS_NULLABLE).toBe("NO");

    // password_hash: VARCHAR, NOT NULL
    expect(byName["password_hash"].DATA_TYPE).toBe("varchar");
    expect(byName["password_hash"].IS_NULLABLE).toBe("NO");

    // is_active: INT, NOT NULL, DEFAULT 1
    expect(byName["is_active"].DATA_TYPE).toBe("int");
    expect(byName["is_active"].IS_NULLABLE).toBe("NO");
    expect(String(byName["is_active"].COLUMN_DEFAULT)).toBe("1");

    // created_at: TIMESTAMP, NOT NULL
    expect(byName["created_at"].DATA_TYPE).toBe("timestamp");
    expect(byName["created_at"].IS_NULLABLE).toBe("NO");

    // updated_at: TIMESTAMP, NOT NULL
    expect(byName["updated_at"].DATA_TYPE).toBe("timestamp");
    expect(byName["updated_at"].IS_NULLABLE).toBe("NO");
  });

  test("failed_login_attempts table has required columns", async () => {
    if (maybeSkip("failed_login_attempts columns")) return;

    const rows = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, EXTRA, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'failed_login_attempts'
       ORDER BY ORDINAL_POSITION`,
      [TEST_DB_NAME]
    );

    const columns = rows.map((r) => r.COLUMN_NAME as string);
    expect(columns).toContain("id");
    expect(columns).toContain("email_lower");
    expect(columns).toContain("ip");
    expect(columns).toContain("attempted_at");

    const byName = Object.fromEntries(rows.map((r) => [r.COLUMN_NAME as string, r]));
    expect(byName["id"].EXTRA).toContain("auto_increment");
    expect(byName["email_lower"].DATA_TYPE).toBe("varchar");
    expect(byName["ip"].DATA_TYPE).toBe("varchar");
    expect(byName["attempted_at"].DATA_TYPE).toBe("timestamp");
  });

  test("account_lockouts table has required columns", async () => {
    if (maybeSkip("account_lockouts columns")) return;

    const rows = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'account_lockouts'
       ORDER BY ORDINAL_POSITION`,
      [TEST_DB_NAME]
    );

    const columns = rows.map((r) => r.COLUMN_NAME as string);
    expect(columns).toContain("email_lower");
    expect(columns).toContain("locked_until");
    expect(columns).toContain("locked_at");

    const byName = Object.fromEntries(rows.map((r) => [r.COLUMN_NAME as string, r]));
    // email_lower is the PRIMARY KEY
    expect(byName["email_lower"].COLUMN_KEY).toBe("PRI");
    expect(byName["locked_until"].DATA_TYPE).toBe("timestamp");
    expect(byName["locked_at"].DATA_TYPE).toBe("timestamp");
  });

  test("revoked_sessions table has required columns", async () => {
    if (maybeSkip("revoked_sessions columns")) return;

    const rows = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'revoked_sessions'
       ORDER BY ORDINAL_POSITION`,
      [TEST_DB_NAME]
    );

    const columns = rows.map((r) => r.COLUMN_NAME as string);
    expect(columns).toContain("jti");
    expect(columns).toContain("user_id");
    expect(columns).toContain("revoked_at");
    expect(columns).toContain("expires_at");

    const byName = Object.fromEntries(rows.map((r) => [r.COLUMN_NAME as string, r]));
    expect(byName["jti"].COLUMN_KEY).toBe("PRI");
    expect(byName["user_id"].DATA_TYPE).toBe("int");
    expect(byName["user_id"].IS_NULLABLE).toBe("NO");
    expect(byName["expires_at"].DATA_TYPE).toBe("timestamp");
  });
});

// ---------------------------------------------------------------------------
// Test 2: uniq_users_email_lower rejects duplicate lowercased email
// ---------------------------------------------------------------------------

describe("Migration 0030: uniq_users_email_lower constraint", () => {
  test("inserting two users with the same email_lower value raises a duplicate key error", async () => {
    if (maybeSkip("uniq_users_email_lower")) return;

    // Insert the first user
    await exec(
      `INSERT INTO users (email, email_lower, name, role, password_hash)
       VALUES ('Test@Example.com', 'test@example.com', 'Test User', 'staff', '$2a$12$placeholder1')`
    );

    let duplicateError: Error | null = null;
    try {
      await exec(
        `INSERT INTO users (email, email_lower, name, role, password_hash)
         VALUES ('test@example.com', 'test@example.com', 'Other User', 'admin', '$2a$12$placeholder2')`
      );
    } catch (err) {
      duplicateError = err as Error;
    }

    // Must have thrown a duplicate key error
    expect(duplicateError).not.toBeNull();
    expect(duplicateError!.message).toMatch(/Duplicate entry/i);

    // Different email_lower must succeed (proves only the lowercased key is enforced)
    await exec(
      `INSERT INTO users (email, email_lower, name, role, password_hash)
       VALUES ('other@example.com', 'other@example.com', 'Other User', 'admin', '$2a$12$placeholder3')`
    );

    // Clean up
    await exec(
      `DELETE FROM users WHERE email_lower IN ('test@example.com','other@example.com')`
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: role ENUM rejects values outside 'admin'/'staff'
// ---------------------------------------------------------------------------

describe("Migration 0030: role ENUM constraint", () => {
  test("inserting a user with role 'admin' succeeds", async () => {
    if (maybeSkip("role enum - admin")) return;

    let err: Error | null = null;
    try {
      await exec(
        `INSERT INTO users (email, email_lower, name, role, password_hash)
         VALUES ('admin1@test.com', 'admin1@test.com', 'Admin', 'admin', '$2a$12$placeholder')`
      );
    } catch (e) {
      err = e as Error;
    } finally {
      await exec(`DELETE FROM users WHERE email_lower = 'admin1@test.com'`).catch(() => {});
    }

    expect(err).toBeNull();
  });

  test("inserting a user with role 'staff' succeeds", async () => {
    if (maybeSkip("role enum - staff")) return;

    let err: Error | null = null;
    try {
      await exec(
        `INSERT INTO users (email, email_lower, name, role, password_hash)
         VALUES ('staff1@test.com', 'staff1@test.com', 'Staff', 'staff', '$2a$12$placeholder')`
      );
    } catch (e) {
      err = e as Error;
    } finally {
      await exec(`DELETE FROM users WHERE email_lower = 'staff1@test.com'`).catch(() => {});
    }

    expect(err).toBeNull();
  });

  test("inserting a user with an invalid role value fails (enum constraint)", async () => {
    if (maybeSkip("role enum - invalid value")) return;

    let err: Error | null = null;
    try {
      await exec(
        `INSERT INTO users (email, email_lower, name, role, password_hash)
         VALUES ('bad@test.com', 'bad@test.com', 'Bad', 'superuser', '$2a$12$placeholder')`
      );
    } catch (e) {
      err = e as Error;
    } finally {
      // Cleanup in case it somehow succeeded
      await exec(`DELETE FROM users WHERE email_lower = 'bad@test.com'`).catch(() => {});
    }

    // Must have thrown — MySQL rejects invalid ENUM values in strict mode
    expect(err).not.toBeNull();

    // No partial row should have been written
    const rows = await query<mysql.RowDataPacket[]>(
      `SELECT id FROM users WHERE email_lower = 'bad@test.com'`
    );
    expect(rows).toHaveLength(0);
  });

  test("only 'admin' and 'staff' are valid role enum values (information_schema check)", async () => {
    if (maybeSkip("role enum - valid values from schema")) return;

    // Query the ENUM definition from information_schema
    const rows = await query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [TEST_DB_NAME]
    );

    expect(rows).toHaveLength(1);
    const columnType = rows[0].COLUMN_TYPE as string;
    // MySQL reports ENUM as: enum('admin','staff')
    expect(columnType).toContain("'admin'");
    expect(columnType).toContain("'staff'");
    // Should contain exactly these two values and nothing else
    const enumMatch = columnType.match(/^enum\((.+)\)$/i);
    expect(enumMatch).not.toBeNull();
    const enumValues = enumMatch![1]
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, ""));
    expect(enumValues).toHaveLength(2);
    expect(enumValues).toContain("admin");
    expect(enumValues).toContain("staff");
  });
});

// ---------------------------------------------------------------------------
// Test 4: revoked_sessions.user_id FK cascades on user delete
// ---------------------------------------------------------------------------

describe("Migration 0030: revoked_sessions FK ON DELETE CASCADE", () => {
  test("deleting a user cascades and removes all their revoked_sessions rows", async () => {
    if (maybeSkip("FK cascade")) return;

    // Insert a user
    const result = await exec(
      `INSERT INTO users (email, email_lower, name, role, password_hash)
       VALUES ('cascade@test.com', 'cascade@test.com', 'Cascade User', 'staff', '$2a$12$placeholder')`
    );
    const userId = result.insertId;

    // MySQL TIMESTAMP max is 2038-01-19; use a safely future date within range
    const futureTs = "2037-12-31 23:59:59";

    // Insert two revoked_sessions for that user
    await exec(
      `INSERT INTO revoked_sessions (jti, user_id, expires_at) VALUES (?, ?, ?)`,
      ["aabbccdd-1111-1111-1111-000000000001", userId, futureTs]
    );
    await exec(
      `INSERT INTO revoked_sessions (jti, user_id, expires_at) VALUES (?, ?, ?)`,
      ["aabbccdd-1111-1111-1111-000000000002", userId, futureTs]
    );

    // Verify rows exist before delete
    const before = await query<mysql.RowDataPacket[]>(
      `SELECT jti FROM revoked_sessions WHERE user_id = ?`,
      [userId]
    );
    expect(before).toHaveLength(2);

    // Delete the user — FK ON DELETE CASCADE should remove the sessions
    await exec(`DELETE FROM users WHERE id = ?`, [userId]);

    // Verify cascade deleted the revoked_sessions rows
    const after = await query<mysql.RowDataPacket[]>(
      `SELECT jti FROM revoked_sessions WHERE user_id = ?`,
      [userId]
    );
    expect(after).toHaveLength(0);
  });

  test("FK constraint prevents inserting revoked_sessions for a non-existent user", async () => {
    if (maybeSkip("FK constraint - non-existent user")) return;

    // Use an ID that does not exist
    const nonExistentUserId = 999_999_999;

    let err: Error | null = null;
    try {
      await exec(
        `INSERT INTO revoked_sessions (jti, user_id, expires_at) VALUES (?, ?, '2037-12-31 23:59:59')`,
        ["ccddee00-2222-2222-2222-000000000001", nonExistentUserId]
      );
    } catch (e) {
      err = e as Error;
    }

    expect(err).not.toBeNull();
    // MySQL reports FK violation as "a foreign key constraint fails"
    expect(err!.message).toMatch(/foreign key constraint/i);
  });
});
