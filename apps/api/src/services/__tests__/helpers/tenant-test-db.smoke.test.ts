/**
 * Smoke test for tenant-test-db harness (PR 8.1.1).
 *
 * Verifies that the harness can:
 * - Create a throwaway DB
 * - Apply all migrations
 * - Seed two tenants
 * - Clean up without leaving DB artifacts
 *
 * Skip-graceful: if MySQL unreachable, warns and passes.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTenantTestDb, seedTwoTenants, type TenantTestDb } from "./tenant-test-db";

let testDb: TenantTestDb | null = null;
let dbAvailable = false;

beforeAll(async () => {
  testDb = await createTenantTestDb();
  if (testDb) {
    dbAvailable = true;
  } else {
    console.warn("⚠ Skipping tenant-test-db smoke tests: no MySQL available");
  }
});

afterAll(async () => {
  if (testDb) {
    await testDb.cleanup();
  }
});

describe("tenant-test-db harness smoke test", () => {
  it("creates throwaway DB and applies migrations", async () => {
    if (!dbAvailable) return;

    expect(testDb).not.toBeNull();
    expect(testDb!.dbName).toMatch(/^sentralio_tenant_test_/);

    // Verify DB exists by querying information_schema
    const [rows] = await testDb!.rawConn.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [testDb!.dbName]
    );
    expect((rows as any[]).length).toBe(1);
  });

  it("seeds two tenants with expected data", async () => {
    if (!dbAvailable) return;

    const { companyA, companyB } = await seedTwoTenants(testDb!.db);

    // Verify companies
    expect(companyA.id).toBeGreaterThan(0);
    expect(companyB.id).toBeGreaterThan(0);
    expect(companyA.slug).toBe("company-a-test");
    expect(companyB.slug).toBe("company-b-test");

    // Verify admin users
    expect(companyA.adminUserId).toBeGreaterThan(0);
    expect(companyB.adminUserId).toBeGreaterThan(0);

    // Verify isolation: company A's products should not appear for company B
    const { masterProducts } = await import("../../../db/schema");
    const { eq } = await import("drizzle-orm");

    const productsA = await testDb!.db
      .select()
      .from(masterProducts)
      .where(eq(masterProducts.companyId, companyA.id));

    const productsB = await testDb!.db
      .select()
      .from(masterProducts)
      .where(eq(masterProducts.companyId, companyB.id));

    expect(productsA.length).toBe(2); // PROD-A-001, PROD-A-002
    expect(productsB.length).toBe(1); // PROD-B-001

    // Verify no cross-contamination
    for (const prod of productsA) {
      expect(prod.companyId).toBe(companyA.id);
    }
    for (const prod of productsB) {
      expect(prod.companyId).toBe(companyB.id);
    }
  });

  it("seeds shared shop_id scenario (#198/#200)", async () => {
    if (!dbAvailable) return;

    const { companyA, companyB } = await seedTwoTenants(testDb!.db);

    // Verify shop_id 555 exists for both companies
    const { shopeeCredentials } = await import("../../../db/schema");
    const { eq } = await import("drizzle-orm");

    const shop555Rows = await testDb!.db
      .select()
      .from(shopeeCredentials)
      .where(eq(shopeeCredentials.shopId, 555));

    expect(shop555Rows.length).toBe(2);

    // Company A: disconnected (newer)
    const credA = shop555Rows.find((r) => r.companyId === companyA.id);
    expect(credA).toBeDefined();
    expect(credA!.status).toBe("disconnected");

    // Company B: connected (older updated_at, but connected wins)
    const credB = shop555Rows.find((r) => r.companyId === companyB.id);
    expect(credB).toBeDefined();
    expect(credB!.status).toBe("connected");

    // Verify B's updated_at is older than A's
    expect(credB!.updatedAt.getTime()).toBeLessThan(credA!.updatedAt.getTime());
  });

  it("cleanup removes throwaway DB", async () => {
    if (!dbAvailable) return;

    const dbName = testDb!.dbName;

    // Verify DB exists before cleanup
    const [rowsBefore] = await testDb!.rawConn.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [dbName]
    );
    expect((rowsBefore as any[]).length).toBe(1);

    // Cleanup
    await testDb!.cleanup();

    // Verify DB removed (need new connection since original is closed)
    const mysql = (await import("mysql2/promise")).default;
    const checkConn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    const [rowsAfter] = await checkConn.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [dbName]
    );
    expect((rowsAfter as any[]).length).toBe(0);

    await checkConn.end();

    // Prevent double cleanup in afterAll
    testDb = null;
    dbAvailable = false;
  });
});
