/**
 * Integration tests for tenant isolation with real MySQL DB
 * 
 * Uses tenant-test-db harness from PR 8.1.1 to verify:
 * 1. Read isolation: queries scoped to company_id=A never return company_id=B rows
 * 2. #198/#200 shared shop_id resolution: connected wins over disconnected
 * 3. Constraint enforcement: uniq_active_shop, uniq_company_shop
 * 
 * IMPORTANT: These tests require MySQL connection via env vars (DB_HOST, DB_PORT, etc).
 * If DB unavailable, tests skip gracefully (no failure in environments without DB).
 * 
 * Run: bun test src/services/__tests__/tenant-isolation.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq, and, desc } from "drizzle-orm";
import { createTenantTestDb, seedTwoTenants } from "./helpers/tenant-test-db";
import type { TenantTestDb } from "./helpers/tenant-test-db";
import { 
  shopeeCredentials, 
  masterProducts,
  shopeeOrders, 
  users 
} from "../../db/schema";
import { selectActiveCredential } from "../shopee-auth";
import { isShopConnected } from "../active-shops";

let testDb: TenantTestDb | null = null;
let dbAvailable = false;
let companyA: any;
let companyB: any;

beforeAll(async () => {
  testDb = await createTenantTestDb();
  
  if (!testDb) {
    console.warn("[tenant-isolation] MySQL not available, skipping integration tests");
    return;
  }
  
  dbAvailable = true;
  const seedResult = await seedTwoTenants(testDb.db);
  companyA = seedResult.companyA;
  companyB = seedResult.companyB;
  
  console.log(`[tenant-isolation] Test DB ready: ${testDb.dbName}`);
  console.log(`[tenant-isolation] Company A: id=${companyA.id}`);
  console.log(`[tenant-isolation] Company B: id=${companyB.id}`);
});

afterAll(async () => {
  if (testDb) {
    await testDb.cleanup();
    console.log("[tenant-isolation] Test DB cleaned up");
  }
});

describe("Tenant Isolation - Read Isolation", () => {
  it("master_products: company A query never returns company B rows", async () => {
    if (!dbAvailable) return;
    
    const rowsA = await testDb!.db
      .select()
      .from(masterProducts)
      .where(eq(masterProducts.companyId, companyA.id));
    
    // Verify all rows belong to company A
    expect(rowsA.length).toBeGreaterThan(0);
    for (const row of rowsA) {
      expect(row.companyId).toBe(companyA.id);
      expect(row.companyId).not.toBe(companyB.id);
    }
  });
  
  it("master_products: company B query never returns company A rows", async () => {
    if (!dbAvailable) return;
    
    const rowsB = await testDb!.db
      .select()
      .from(masterProducts)
      .where(eq(masterProducts.companyId, companyB.id));
    
    expect(rowsB.length).toBeGreaterThan(0);
    for (const row of rowsB) {
      expect(row.companyId).toBe(companyB.id);
      expect(row.companyId).not.toBe(companyA.id);
    }
  });
  
  it("shopee_orders: company A query never returns company B rows", async () => {
    if (!dbAvailable) return;
    
    const rowsA = await testDb!.db
      .select()
      .from(shopeeOrders)
      .where(eq(shopeeOrders.companyId, companyA.id));
    
    expect(rowsA.length).toBeGreaterThan(0);
    for (const row of rowsA) {
      expect(row.companyId).toBe(companyA.id);
      expect(row.companyId).not.toBe(companyB.id);
    }
  });
  
  it("shopee_orders: company B query never returns company A rows", async () => {
    if (!dbAvailable) return;
    
    const rowsB = await testDb!.db
      .select()
      .from(shopeeOrders)
      .where(eq(shopeeOrders.companyId, companyB.id));
    
    expect(rowsB.length).toBeGreaterThan(0);
    for (const row of rowsB) {
      expect(row.companyId).toBe(companyB.id);
      expect(row.companyId).not.toBe(companyA.id);
    }
  });
  
  it("shopee_credentials: company A query never returns company B rows", async () => {
    if (!dbAvailable) return;
    
    const rowsA = await testDb!.db
      .select()
      .from(shopeeCredentials)
      .where(eq(shopeeCredentials.companyId, companyA.id));
    
    expect(rowsA.length).toBeGreaterThan(0);
    for (const row of rowsA) {
      expect(row.companyId).toBe(companyA.id);
      expect(row.companyId).not.toBe(companyB.id);
    }
  });
  
  it("shopee_credentials: company B query never returns company A rows", async () => {
    if (!dbAvailable) return;
    
    const rowsB = await testDb!.db
      .select()
      .from(shopeeCredentials)
      .where(eq(shopeeCredentials.companyId, companyB.id));
    
    expect(rowsB.length).toBeGreaterThan(0);
    for (const row of rowsB) {
      expect(row.companyId).toBe(companyB.id);
      expect(row.companyId).not.toBe(companyA.id);
    }
  });
  
  it("users: company A query never returns company B rows", async () => {
    if (!dbAvailable) return;
    
    const rowsA = await testDb!.db
      .select()
      .from(users)
      .where(eq(users.companyId, companyA.id));
    
    expect(rowsA.length).toBeGreaterThan(0);
    for (const row of rowsA) {
      expect(row.companyId).toBe(companyA.id);
      expect(row.companyId).not.toBe(companyB.id);
    }
  });
  
  it("users: company B query never returns company A rows", async () => {
    if (!dbAvailable) return;
    
    const rowsB = await testDb!.db
      .select()
      .from(users)
      .where(eq(users.companyId, companyB.id));
    
    expect(rowsB.length).toBeGreaterThan(0);
    for (const row of rowsB) {
      expect(row.companyId).toBe(companyB.id);
      expect(row.companyId).not.toBe(companyA.id);
    }
  });
});

describe("#198/#200 - Shared shop_id Resolution (Real DB)", () => {
  it("resolves to connected row even when disconnected row is newer", async () => {
    if (!dbAvailable) return;
    
    // Query all rows for shop_id 555 (seeded with disconnected + connected scenario)
    const allRows = await testDb!.db
      .select()
      .from(shopeeCredentials)
      .where(eq(shopeeCredentials.shopId, 555));
    
    expect(allRows.length).toBeGreaterThanOrEqual(2); // At least disconnected + connected
    
    // Use selectActiveCredential (pure selector from PR 8.1.2)
    const activeRow = selectActiveCredential(allRows, 555);
    
    expect(activeRow).toBeDefined();
    expect(activeRow!.status).toBe("connected");
    expect(activeRow!.shopId).toBe(555);
    // Should be company B (connected), not company A (disconnected)
    expect(activeRow!.companyId).toBe(companyB.id);
  });
  
  it("SQL query with proper filters returns connected row first", async () => {
    if (!dbAvailable || !testDb) return;
    
    // Simulate getValidToken() query logic with DESC order (matches runtime)
    // Without status filter, this would return disconnected row A (newer)
    // With filter, returns connected row B → proves filter works
    const rows = await testDb.db
      .select()
      .from(shopeeCredentials)
      .where(
        and(
          eq(shopeeCredentials.shopId, 555),
          eq(shopeeCredentials.status, "connected")
        )
      )
      .orderBy(desc(shopeeCredentials.updatedAt))
      .limit(1);
    
    expect(rows.length).toBe(1);
    const row = rows[0];
    if (!row) return;
    expect(row.status).toBe("connected");
    expect(row.shopId).toBe(555);
    expect(row.companyId).toBe(companyB.id);
  });
  
  it("isShopConnected returns true for shop with connected row", async () => {
    if (!dbAvailable || !testDb) return;
    
    const result = await isShopConnected(555, testDb.db as any);
    expect(result).toBe(true);
  });
  
  it("isShopConnected returns false for shop with only disconnected rows", async () => {
    if (!dbAvailable || !testDb) return;
    
    // Shop 666 was seeded with only disconnected status (company A)
    // This tests the actual filter logic: only disconnected exists → should return false
    const result = await isShopConnected(666, testDb.db as any);
    expect(result).toBe(false);
  });
});

describe("Constraint Enforcement", () => {
  it("uniq_active_shop: duplicate active_shop_id is rejected", async () => {
    if (!dbAvailable || !testDb) return;
    
    // First, find an existing active_shop_id
    const existing = await testDb.db
      .select()
      .from(shopeeCredentials)
      .where(eq(shopeeCredentials.status, "connected"))
      .limit(1);
    
    if (existing.length === 0 || !existing[0]?.activeShopId) {
      console.warn("[tenant-isolation] No active_shop_id found for duplicate test, skipping");
      return;
    }
    
    const activeShopId = existing[0].activeShopId;
    
    // Try to insert another row with same active_shop_id
    try {
      await testDb.db.insert(shopeeCredentials).values({
        companyId: companyA.id,
        partnerId: 999,
        partnerKey: "encrypted_test",
        shopId: 888,
        shopName: "Duplicate Active Shop Test",
        accessToken: "encrypted_test",
        refreshToken: "encrypted_test",
        expiresAt: new Date(Date.now() + 86400000),
        status: "connected",
        activeShopId: activeShopId, // DUPLICATE
        updatedAt: new Date(),
      });
      
      // Should not reach here
      expect(true).toBe(false); // Force fail if insert succeeded
    } catch (err: any) {
      // Expected: ER_DUP_ENTRY or similar
      expect(err.message).toMatch(/duplicate|unique|ER_DUP_ENTRY/i);
    }
  });
  
  it("uniq_company_shop: duplicate (company_id, shop_id) is rejected", async () => {
    if (!dbAvailable || !testDb) return;
    
    // Find existing (company_id, shop_id) pair
    const existing = await testDb.db
      .select()
      .from(shopeeCredentials)
      .limit(1);
    
    if (existing.length === 0 || !existing[0]) {
      console.warn("[tenant-isolation] No credentials found for duplicate test, skipping");
      return;
    }
    
    const { companyId, shopId } = existing[0];
    
    // Try to insert another row with same (company_id, shop_id)
    try {
      await testDb.db.insert(shopeeCredentials).values({
        companyId: companyId,
        partnerId: 999,
        partnerKey: "encrypted_test",
        shopId: shopId, // DUPLICATE with same company_id
        shopName: "Duplicate Company Shop Test",
        accessToken: "encrypted_test",
        refreshToken: "encrypted_test",
        expiresAt: new Date(Date.now() + 86400000),
        status: "connected",
        updatedAt: new Date(),
      });
      
      expect(true).toBe(false); // Force fail if insert succeeded
    } catch (err: any) {
      expect(err.message).toMatch(/duplicate|unique|ER_DUP_ENTRY/i);
    }
  });
  
  it("same shop_id across different companies is allowed", async () => {
    if (!dbAvailable || !testDb) return;
    
    const sharedShopId = 777777;
    
    // Insert for company A
    await testDb.db.insert(shopeeCredentials).values({
      companyId: companyA.id,
      partnerId: 999,
      partnerKey: "encrypted_test_a",
      shopId: sharedShopId,
      shopName: "Shared Shop A",
      accessToken: "encrypted_test",
      refreshToken: "encrypted_test",
      expiresAt: new Date(Date.now() + 86400000),
      status: "connected",
      updatedAt: new Date(),
    });
    
    // Insert for company B with SAME shop_id (should succeed)
    await testDb.db.insert(shopeeCredentials).values({
      companyId: companyB.id,
      partnerId: 999,
      partnerKey: "encrypted_test_b",
      shopId: sharedShopId, // SAME shop_id, DIFFERENT company_id
      shopName: "Shared Shop B",
      accessToken: "encrypted_test",
      refreshToken: "encrypted_test",
      expiresAt: new Date(Date.now() + 86400000),
      status: "connected",
      updatedAt: new Date(),
    });
    
    // Verify both exist
    const rowsA = await testDb.db
      .select()
      .from(shopeeCredentials)
      .where(
        and(
          eq(shopeeCredentials.companyId, companyA.id),
          eq(shopeeCredentials.shopId, sharedShopId)
        )
      );
    
    const rowsB = await testDb.db
      .select()
      .from(shopeeCredentials)
      .where(
        and(
          eq(shopeeCredentials.companyId, companyB.id),
          eq(shopeeCredentials.shopId, sharedShopId)
        )
      );
    
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    
    const rowA = rowsA[0];
    const rowB = rowsB[0];
    if (!rowA || !rowB) return;
    
    expect(rowA.companyId).toBe(companyA.id);
    expect(rowB.companyId).toBe(companyB.id);
  });
});
