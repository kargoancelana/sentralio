/**
 * Tenant Test DB Harness — PR 8.1.1
 *
 * Provisions a throwaway MySQL database for integration tests, applies the full
 * schema (all migrations), and provides seed helpers for multi-tenant scenarios.
 *
 * Usage:
 *   const testDb = await createTenantTestDb();
 *   if (!testDb) {
 *     console.warn('Skipping: no MySQL available');
 *     return;
 *   }
 *   const { companyA, companyB } = await seedTwoTenants(testDb.db);
 *   // ... run tests ...
 *   await testDb.cleanup();
 *
 * Skip-graceful: returns null if MySQL unreachable (no throw).
 */

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { readFile, readdir } from "fs/promises";
import { resolve } from "path";
import { config } from "dotenv";
import * as schema from "../../../db/schema";
import { encrypt } from "../../../utils/crypto";

// Load env (monorepo root + local)
config({ path: resolve(import.meta.dir, "../../../../../..", ".env") });
config();

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;

export interface TenantTestDb {
  /** Drizzle instance tied to test DB */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Raw mysql2 connection */
  rawConn: mysql.Connection;
  /** Name of throwaway database */
  dbName: string;
  /** Cleanup: drop DB + close connection */
  cleanup: () => Promise<void>;
}

export interface SeededCompany {
  id: number;
  name: string;
  slug: string;
  adminUserId: number;
  adminEmail: string;
}

export interface TwoTenantsSeed {
  companyA: SeededCompany;
  companyB: SeededCompany;
}

/**
 * Split SQL file into statements.
 * Drizzle uses `--> statement-breakpoint` as separator (not a comment).
 * Also strips regular `--` comments.
 */
function splitStatements(sql: string): string[] {
  // First, split by Drizzle's statement-breakpoint
  const statements = sql.split(/\s*--> statement-breakpoint\s*/);
  
  // For each statement, strip `--` comments and clean up
  return statements
    .map((stmt) => {
      const withoutComments = stmt
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return withoutComments;
    })
    .filter((s) => s.length > 0);
}

/**
 * Read migration journal to get ordered list of migration tags.
 */
async function getMigrationTags(): Promise<string[]> {
  const journalPath = resolve(import.meta.dir, "../../../../drizzle/meta/_journal.json");
  try {
    const content = await readFile(journalPath, "utf8");
    const journal = JSON.parse(content) as { entries: Array<{ tag: string; idx: number }> };
    // Sort by idx to ensure correct order
    const sorted = journal.entries.sort((a, b) => a.idx - b.idx);
    return sorted.map((e) => e.tag);
  } catch {
    // Fallback: read .sql files and sort lexicographically
    const drizzleDir = resolve(import.meta.dir, "../../../../drizzle");
    const files = await readdir(drizzleDir);
    return files
      .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
      .sort()
      .map((f) => f.replace(".sql", ""));
  }
}

/**
 * Create a throwaway test database, apply all migrations, return drizzle instance.
 * Returns null (skip-graceful) if MySQL unreachable or migrations fail.
 */
export async function createTenantTestDb(): Promise<TenantTestDb | null> {
  const dbName = `sentralio_tenant_test_${Math.random().toString(36).slice(2, 10)}`;

  const baseConfig = {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
    connectTimeout: 5000,
  };

  let conn: mysql.Connection;

  try {
    // Connect without DB, create throwaway DB
    conn = await mysql.createConnection(baseConfig);
    await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4`);
    await conn.changeUser({ database: dbName });

    // Apply all migrations in order
    const tags = await getMigrationTags();
    for (const tag of tags) {
      const migrationPath = resolve(import.meta.dir, `../../../../drizzle/${tag}.sql`);
      const sql = await readFile(migrationPath, "utf8");
      for (const stmt of splitStatements(sql)) {
        await conn.query(stmt);
      }
    }

    // Create drizzle instance with schema
    const pool = mysql.createPool({
      ...baseConfig,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 5,
    });

    const db = drizzle(pool, { schema, mode: "default" });

    const cleanup = async () => {
      try {
        await pool.end();
        await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await conn.end();
      } catch (err) {
        console.warn(`⚠ Cleanup warning: ${(err as Error).message}`);
      }
    };

    return { db, rawConn: conn, dbName, cleanup };
  } catch (err) {
    console.warn(
      `⚠ Skipping tenant test DB: MySQL unreachable or migrations failed. ` +
        `(${(err as Error).message})`
    );
    return null;
  }
}

/**
 * Seed two companies with minimal tenant data for isolation tests.
 * Includes scenario for #198/#200: shared shop_id with disconnected + connected rows.
 */
export async function seedTwoTenants(
  db: ReturnType<typeof drizzle<typeof schema>>
): Promise<TwoTenantsSeed> {
  // Insert companies (ID 1 might exist as default, handle gracefully)
  const [companyAResult] = await db.insert(schema.companies).values({
    name: "Company A Test",
    slug: "company-a-test",
    status: "active",
  });

  const [companyBResult] = await db.insert(schema.companies).values({
    name: "Company B Test",
    slug: "company-b-test",
    status: "active",
  });

  const companyAId = companyAResult.insertId;
  const companyBId = companyBResult.insertId;

  // Insert admin users
  const [userAResult] = await db.insert(schema.users).values({
    companyId: companyAId,
    email: "admin-a@test.local",
    emailLower: "admin-a@test.local",
    passwordHash: "dummy-hash-a",
    name: "Admin A",
    role: "admin",
  });

  const [userBResult] = await db.insert(schema.users).values({
    companyId: companyBId,
    email: "admin-b@test.local",
    emailLower: "admin-b@test.local",
    passwordHash: "dummy-hash-b",
    name: "Admin B",
    role: "admin",
  });

  // Encrypt dummy tokens (use dummy plaintext, encrypt with current key)
  const dummyAccessToken = encrypt("dummy_access_token_plaintext");
  const dummyRefreshToken = encrypt("dummy_refresh_token_plaintext");
  const dummyPartnerKey = encrypt("dummy_partner_key_plaintext");

  // Company A: shop 100 connected (with activeShopId) + shop 555 DISCONNECTED (newer updated_at)
  await db.insert(schema.shopeeCredentials).values({
    companyId: companyAId,
    partnerId: 1000,
    partnerKey: dummyPartnerKey,
    shopId: 100,
    shopName: "Shop A 100",
    accessToken: dummyAccessToken,
    refreshToken: dummyRefreshToken,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    status: "connected",
    activeShopId: 100, // Set activeShopId for connected shop (enables uniq_active_shop test)
    updatedAt: new Date(Date.now() - 7200 * 1000), // 2 hours ago
  });

  await db.insert(schema.shopeeCredentials).values({
    companyId: companyAId,
    partnerId: 1000,
    partnerKey: dummyPartnerKey,
    shopId: 555, // shared shop_id
    shopName: "Shop A 555 (old, disconnected)",
    accessToken: "", // cleared on disconnect
    refreshToken: "",
    expiresAt: new Date("1970-01-01T00:00:01Z"), // MySQL TIMESTAMP min (avoid new Date(0))
    status: "disconnected",
    disconnectedAt: new Date(),
    updatedAt: new Date(), // NEWER than company B's row
  });

  // Shop 666: only disconnected (for isShopConnected false test)
  await db.insert(schema.shopeeCredentials).values({
    companyId: companyAId,
    partnerId: 1000,
    partnerKey: dummyPartnerKey,
    shopId: 666,
    shopName: "Shop A 666 (only disconnected)",
    accessToken: "",
    refreshToken: "",
    expiresAt: new Date("1970-01-01T00:00:01Z"),
    status: "disconnected",
    disconnectedAt: new Date(),
    updatedAt: new Date(),
  });

  // Company B: shop 200 connected (with activeShopId) + shop 555 CONNECTED (older updated_at, but CONNECTED wins)
  await db.insert(schema.shopeeCredentials).values({
    companyId: companyBId,
    partnerId: 2000,
    partnerKey: dummyPartnerKey,
    shopId: 200,
    shopName: "Shop B 200",
    accessToken: dummyAccessToken,
    refreshToken: dummyRefreshToken,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    status: "connected",
    activeShopId: 200, // Set activeShopId for connected shop
    updatedAt: new Date(Date.now() - 7200 * 1000),
  });

  await db.insert(schema.shopeeCredentials).values({
    companyId: companyBId,
    partnerId: 2000,
    partnerKey: dummyPartnerKey,
    shopId: 555, // shared shop_id
    shopName: "Shop B 555 (connected, older)",
    accessToken: dummyAccessToken,
    refreshToken: dummyRefreshToken,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    status: "connected",
    activeShopId: 555, // Set activeShopId for connected shop
    updatedAt: new Date(Date.now() - 14400 * 1000), // 4 hours ago (OLDER)
  });

  // Insert some products for isolation tests
  await db.insert(schema.masterProducts).values([
    {
      companyId: companyAId,
      sku: "PROD-A-001",
      name: "Product A1",
      stock: 10,
    },
    {
      companyId: companyAId,
      sku: "PROD-A-002",
      name: "Product A2",
      stock: 20,
    },
    {
      companyId: companyBId,
      sku: "PROD-B-001",
      name: "Product B1",
      stock: 30,
    },
  ]);

  // Insert product groups for orders
  const [groupAResult] = await db.insert(schema.productGroups).values({
    companyId: companyAId,
    shopId: 100,
    name: "Group A",
    stock: 10,
  });

  const [groupBResult] = await db.insert(schema.productGroups).values({
    companyId: companyBId,
    shopId: 200,
    name: "Group B",
    stock: 20,
  });

  // Insert shopee orders for isolation tests
  await db.insert(schema.shopeeOrders).values([
    {
      companyId: companyAId,
      shopId: 100,
      orderSn: "ORDER-A-001",
      orderStatus: "COMPLETED",
      totalAmount: 100000,
      createTime: new Date(),
    },
    {
      companyId: companyBId,
      shopId: 200,
      orderSn: "ORDER-B-001",
      orderStatus: "COMPLETED",
      totalAmount: 200000,
      createTime: new Date(),
    },
  ]);

  return {
    companyA: {
      id: companyAId,
      name: "Company A Test",
      slug: "company-a-test",
      adminUserId: userAResult.insertId,
      adminEmail: "admin-a@test.local",
    },
    companyB: {
      id: companyBId,
      name: "Company B Test",
      slug: "company-b-test",
      adminUserId: userBResult.insertId,
      adminEmail: "admin-b@test.local",
    },
  };
}
