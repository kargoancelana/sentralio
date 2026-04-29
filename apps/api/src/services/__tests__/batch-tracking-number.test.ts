import { describe, it, expect, beforeAll } from "bun:test";
import { db } from "../../db/client";
import { shopeeOrders, shopeeCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";
import { shipBatchOrders } from "../shipment.service";

/**
 * Batch Tracking Number Tests
 * 
 * **Validates: Requirement 2.5**
 * 
 * These tests verify that batch shipment operations ensure tracking numbers
 * are available for each order before marking them as PROCESSED, and that
 * partial failures are handled gracefully.
 */

describe("Batch Shipment: Tracking Number Verification", () => {
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
      console.warn("  To run these tests, add Shopee credentials to the database.");
    }
  });

  /**
   * Test: Batch shipment ensures tracking numbers for all orders
   * 
   * **Validates: Requirement 2.5**
   * 
   * Property: WHEN batch shipment dengan opsi "print after shipment" diaktifkan
   * THEN sistem SHALL memastikan tracking number tersedia untuk setiap pesanan
   * sebelum memulai proses batch printing
   * 
   * This test verifies that:
   * 1. Each order in the batch waits for its tracking number
   * 2. Orders are only marked as PROCESSED after tracking number is retrieved
   * 3. The batch operation returns clear success/failure status for each order
   */
  it.skipIf(!hasValidCredentials)("should ensure tracking numbers for all orders in batch", async () => {
    const testOrderSns = [
      `BATCH_TRACK_1_${Date.now()}`,
      `BATCH_TRACK_2_${Date.now()}`,
      `BATCH_TRACK_3_${Date.now()}`
    ];
    
    console.log(`\n🔍 Testing batch shipment tracking number verification`);
    console.log(`   Order count: ${testOrderSns.length}`);
    
    // Create test orders with READY_TO_SHIP status
    for (const orderSn of testOrderSns) {
      await db.insert(shopeeOrders).values({
        shopId: testShopId,
        orderSn: orderSn,
        orderStatus: "READY_TO_SHIP",
        totalAmount: 100000,
        buyerUsername: "batch_track_test",
        shippingCarrier: null, // No tracking number initially
        payTime: new Date(),
        createTime: new Date(),
        updatedAt: new Date()
      });
      console.log(`   ✓ Created order: ${orderSn}`);
    }

    try {
      console.log(`\n📦 Processing batch shipment...`);
      const startTime = Date.now();
      const results = await shipBatchOrders(testOrderSns, "pickup");
      const duration = Date.now() - startTime;
      
      console.log(`\n📊 Batch shipment results:`);
      console.log(`   Total orders: ${results.length}`);
      console.log(`   Duration: ${duration}ms`);
      
      // Property 1: Should return result for each order
      expect(results.length).toBe(testOrderSns.length);
      console.log(`   ✓ Results returned for all ${results.length} orders`);
      
      // Property 2: Each result should have clear success/failure status
      const successfulOrders = results.filter(r => r.success);
      const failedOrders = results.filter(r => !r.success);
      
      console.log(`\n   Successful: ${successfulOrders.length}`);
      console.log(`   Failed: ${failedOrders.length}`);
      
      // Property 3: For successful orders, verify tracking number is stored
      for (const result of successfulOrders) {
        console.log(`\n   ✓ Order ${result.orderSn}: SUCCESS`);
        
        // Fetch order from database
        const orderRows = await db
          .select()
          .from(shopeeOrders)
          .where(eq(shopeeOrders.orderSn, result.orderSn))
          .limit(1);
        
        const order = orderRows[0];
        
        // Verify order status is PROCESSED
        expect(order.orderStatus).toBe("PROCESSED");
        console.log(`     Status: ${order.orderStatus}`);
        
        // Verify tracking number is stored
        expect(order.shippingCarrier).not.toBeNull();
        expect(order.shippingCarrier).not.toBe("");
        console.log(`     Tracking: ${order.shippingCarrier}`);
      }
      
      // Property 4: For failed orders, verify status is NOT changed
      for (const result of failedOrders) {
        console.log(`\n   ✗ Order ${result.orderSn}: FAILED`);
        console.log(`     Error: ${result.error}`);
        
        // Fetch order from database
        const orderRows = await db
          .select()
          .from(shopeeOrders)
          .where(eq(shopeeOrders.orderSn, result.orderSn))
          .limit(1);
        
        const order = orderRows[0];
        
        // Verify order status is still READY_TO_SHIP (not changed)
        expect(order.orderStatus).toBe("READY_TO_SHIP");
        console.log(`     Status: ${order.orderStatus} (unchanged)`);
      }
      
      console.log(`\n✅ BATCH TRACKING VERIFICATION PASSED`);
      console.log(`   - All successful orders have tracking numbers`);
      console.log(`   - All successful orders are marked as PROCESSED`);
      console.log(`   - Failed orders remain in READY_TO_SHIP status`);
      console.log(`   - Partial failures handled gracefully`);
      
    } finally {
      // Cleanup
      for (const orderSn of testOrderSns) {
        await db.delete(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn));
      }
      console.log(`\n🧹 Cleanup: Test orders deleted`);
    }
  }, 180000); // 3 minutes timeout for batch processing

  /**
   * Test: Batch shipment handles partial failures gracefully
   * 
   * **Validates: Requirement 2.5**
   * 
   * Property: WHEN some orders in batch succeed and others fail (timeout or error)
   * THEN sistem SHALL continue processing remaining orders and return clear
   * success/failure status for each order
   * 
   * This test verifies that:
   * 1. Batch processing continues even if some orders fail
   * 2. Successful orders are processed correctly
   * 3. Failed orders don't affect successful ones
   * 4. Clear error messages are provided for failures
   */
  it("should handle partial failures gracefully in batch", async () => {
    const validOrderSn = `BATCH_VALID_${Date.now()}`;
    const invalidOrderSn = `BATCH_INVALID_${Date.now()}`;
    const wrongStatusOrderSn = `BATCH_WRONG_${Date.now()}`;
    
    console.log(`\n🔍 Testing batch shipment partial failure handling`);
    
    // Create one valid order
    if (hasValidCredentials) {
      await db.insert(shopeeOrders).values({
        shopId: testShopId,
        orderSn: validOrderSn,
        orderStatus: "READY_TO_SHIP",
        totalAmount: 100000,
        buyerUsername: "partial_test",
        shippingCarrier: null,
        payTime: new Date(),
        createTime: new Date(),
        updatedAt: new Date()
      });
      console.log(`   ✓ Created valid order: ${validOrderSn}`);
    }
    
    // Create one order with wrong status
    await db.insert(shopeeOrders).values({
      shopId: testShopId || 1,
      orderSn: wrongStatusOrderSn,
      orderStatus: "SHIPPED", // Wrong status
      totalAmount: 100000,
      buyerUsername: "partial_test",
      shippingCarrier: null,
      payTime: new Date(),
      createTime: new Date(),
      updatedAt: new Date()
    });
    console.log(`   ✓ Created wrong-status order: ${wrongStatusOrderSn}`);
    
    // Invalid order (doesn't exist in DB)
    console.log(`   ✓ Using non-existent order: ${invalidOrderSn}`);

    try {
      const orderSns = [validOrderSn, invalidOrderSn, wrongStatusOrderSn];
      
      console.log(`\n📦 Processing batch with mixed valid/invalid orders...`);
      const results = await shipBatchOrders(orderSns, "pickup");
      
      console.log(`\n📊 Batch results:`);
      console.log(`   Total orders: ${results.length}`);
      
      // Property 1: Should return result for each order
      expect(results.length).toBe(orderSns.length);
      console.log(`   ✓ Results returned for all orders`);
      
      // Property 2: Results should have clear success/failure status
      for (const result of results) {
        console.log(`\n   Order ${result.orderSn}:`);
        console.log(`     Success: ${result.success}`);
        
        if (result.success) {
          console.log(`     Message: ${result.message}`);
        } else {
          console.log(`     Error: ${result.error}`);
          
          // Property 3: Failed orders should have descriptive error messages
          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);
        }
      }
      
      // Property 4: Invalid order should fail
      const invalidResult = results.find(r => r.orderSn === invalidOrderSn);
      expect(invalidResult).toBeDefined();
      expect(invalidResult!.success).toBe(false);
      expect(invalidResult!.error).toContain("tidak ditemukan");
      console.log(`\n   ✓ Invalid order failed with correct error`);
      
      // Property 5: Wrong status order should fail
      const wrongStatusResult = results.find(r => r.orderSn === wrongStatusOrderSn);
      expect(wrongStatusResult).toBeDefined();
      expect(wrongStatusResult!.success).toBe(false);
      expect(wrongStatusResult!.error).toContain("tidak dapat diproses");
      console.log(`   ✓ Wrong-status order failed with correct error`);
      
      console.log(`\n✅ PARTIAL FAILURE HANDLING VERIFIED`);
      console.log(`   - Batch processing continued despite failures`);
      console.log(`   - Each order has clear success/failure status`);
      console.log(`   - Error messages are descriptive`);
      
    } finally {
      // Cleanup
      if (hasValidCredentials) {
        await db.delete(shopeeOrders).where(eq(shopeeOrders.orderSn, validOrderSn));
      }
      await db.delete(shopeeOrders).where(eq(shopeeOrders.orderSn, wrongStatusOrderSn));
      console.log(`\n🧹 Cleanup: Test orders deleted`);
    }
  }, 120000);
});
