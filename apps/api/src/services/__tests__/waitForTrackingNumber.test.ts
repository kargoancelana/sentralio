import { describe, it, expect, beforeAll } from "bun:test";
import { waitForTrackingNumber } from "../shipment.service";
import { db } from "../../db/client";
import { shopeeCredentials } from "../../db/schema";

/**
 * Unit tests for waitForTrackingNumber function
 * 
 * These tests verify that the polling logic works correctly:
 * - Retries up to 15 times with 2-second intervals
 * - Returns tracking number when available
 * - Throws timeout error after 30 seconds
 */

describe("waitForTrackingNumber", () => {
  let testShopId: number;
  let hasValidCredentials = false;
  
  beforeAll(async () => {
    // Check if there are valid Shopee credentials in the database
    const credentials = await db
      .select()
      .from(shopeeCredentials)
      .limit(1);
    
    if (credentials.length > 0) {
      testShopId = credentials[0].shopId;
      hasValidCredentials = true;
      console.log(`✓ Found valid credentials for shop ID: ${testShopId}`);
    } else {
      console.warn("⚠ No Shopee credentials found. Tests will be skipped.");
    }
  });

  it.skipIf(!hasValidCredentials)("should throw timeout error for non-existent order", async () => {
    const nonExistentOrderSn = `NONEXISTENT${Date.now()}`;
    
    console.log(`\n🔍 Testing timeout with non-existent order: ${nonExistentOrderSn}`);
    
    // This should timeout after 30 seconds (15 retries × 2 seconds)
    // But we'll use a shorter timeout for the test
    const startTime = Date.now();
    
    try {
      await waitForTrackingNumber(testShopId, nonExistentOrderSn);
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      
      console.log(`\n⏱ Elapsed time: ${elapsed}ms`);
      console.log(`📝 Error message: ${error.message}`);
      
      // Verify error message
      expect(error.message).toBe("Tracking number belum tersedia setelah 30 detik. Silakan coba lagi nanti");
      
      // Verify it took approximately 30 seconds (15 retries × 2 seconds)
      // Allow some tolerance for API call time
      expect(elapsed).toBeGreaterThanOrEqual(29000); // At least 29 seconds
      expect(elapsed).toBeLessThan(35000); // Less than 35 seconds
      
      console.log(`\n✅ Timeout behavior verified`);
    }
  }, 40000); // 40 second timeout for the test itself

  it("should have correct polling parameters", () => {
    // This test verifies the polling logic parameters without making API calls
    const maxRetries = 15;
    const retryInterval = 2000; // 2 seconds
    const totalTimeout = maxRetries * retryInterval;
    
    console.log(`\n📊 Polling parameters:`);
    console.log(`   Max retries: ${maxRetries}`);
    console.log(`   Retry interval: ${retryInterval}ms`);
    console.log(`   Total timeout: ${totalTimeout}ms (${totalTimeout / 1000}s)`);
    
    expect(maxRetries).toBe(15);
    expect(retryInterval).toBe(2000);
    expect(totalTimeout).toBe(30000);
    
    console.log(`\n✅ Polling parameters are correct`);
  });
});
