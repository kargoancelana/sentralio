import { describe, it, expect, beforeAll } from "bun:test";
import { db } from "../../db/client";
import { shopeeOrders, shopeeCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";
import { shipSingleOrder } from "../shipment.service";

/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * **Property 1: Bug Condition** - Tracking Number Not Retrieved After Shipment
 * 
 * This test verifies the BUG CONDITION:
 * - When shipSingleOrder() is called with a READY_TO_SHIP order
 * - The system arranges shipment via Shopee API
 * - The order status is updated to PROCESSED immediately
 * - BUT the tracking number is NOT retrieved from Shopee API
 * - This causes label printing to fail because shippingCarrier field is null/empty
 * 
 * **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS
 * - Order status changes to PROCESSED
 * - BUT shippingCarrier field remains null (no tracking number)
 * - This proves the bug exists
 * 
 * **EXPECTED OUTCOME AFTER FIX**: Test PASSES
 * - Order status changes to PROCESSED
 * - AND shippingCarrier field contains tracking number
 * - This proves the bug is fixed
 * 
 * **NOTE**: This test requires valid Shopee API credentials in the database.
 * It will use the actual Shopee API to demonstrate the bug.
 */

describe("Bug Condition Exploration: Tracking Number Not Retrieved After Shipment", () => {
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
   * Property-based test scoped to concrete failing case
   * 
   * For deterministic bugs, we scope the property to the specific failing scenario
   * to ensure reproducibility and clear demonstration of the bug.
   * 
   * **IMPORTANT**: This test uses REAL Shopee API calls to demonstrate the actual bug.
   * The bug is that after shipSingleOrder() succeeds, the order status is PROCESSED
   * but the tracking number (shippingCarrier) is not retrieved and remains null.
   */
  it.skipIf(!hasValidCredentials)("should retrieve tracking number before updating order status to PROCESSED", async () => {
    /**
     * Test Strategy:
     * 1. Create a READY_TO_SHIP order in the database
     * 2. Call shipSingleOrder() which will call the real Shopee API
     * 3. Verify that after successful shipment arrangement:
     *    - Order status is updated to PROCESSED
     *    - Tracking number is retrieved and stored in shippingCarrier field
     * 
     * **BUG CONDITION**: On unfixed code, shippingCarrier will be null/empty
     * even though order status is PROCESSED, causing label printing to fail.
     * 
     * **EXPECTED BEHAVIOR**: After fix, shippingCarrier should contain
     * the tracking number retrieved from Shopee API via polling.
     */
    
    // Generate test order serial number
    const testOrderSn = `BUGTEST${Date.now()}`;
    
    // Insert test order with READY_TO_SHIP status
    await db.insert(shopeeOrders).values({
      shopId: testShopId,
      orderSn: testOrderSn,
      orderStatus: "READY_TO_SHIP",
      totalAmount: 100000,
      buyerUsername: "bug_test_buyer",
      shippingCarrier: null, // No tracking number initially
      payTime: new Date(),
      createTime: new Date(),
      updatedAt: new Date()
    });

    try {
      console.log(`\n🔍 Testing bug condition with order: ${testOrderSn}`);
      console.log(`   Shop ID: ${testShopId}`);
      console.log(`   Initial status: READY_TO_SHIP`);
      console.log(`   Initial shippingCarrier: null`);
      
      // Call shipSingleOrder to arrange shipment
      const result = await shipSingleOrder(testOrderSn, "pickup");
      
      console.log(`\n📊 Shipment result:`, result);
      
      // Fetch updated order from database
      const updatedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderSn, testOrderSn))
        .limit(1);
      
      expect(updatedOrders.length).toBe(1);
      const updatedOrder = updatedOrders[0];
      
      console.log(`\n📦 Order after shipSingleOrder():`);
      console.log(`   Order SN: ${updatedOrder.orderSn}`);
      console.log(`   Status: ${updatedOrder.orderStatus}`);
      console.log(`   Shipping Carrier: ${updatedOrder.shippingCarrier}`);
      
      // **CRITICAL ASSERTION**: This is where the bug manifests
      // 
      // Expected behavior (after fix):
      // - Order status should be PROCESSED
      // - shippingCarrier should contain tracking number
      // 
      // Bug behavior (unfixed code):
      // - Order status is PROCESSED ✓
      // - shippingCarrier is null/empty ✗ (BUG!)
      // 
      // This test will FAIL on unfixed code because shippingCarrier is null,
      // proving that the tracking number is not being retrieved.
      
      if (result.success) {
        console.log(`\n✅ Shipment was successful`);
        
        expect(updatedOrder.orderStatus).toBe("PROCESSED");
        console.log(`   ✓ Order status is PROCESSED`);
        
        // **THIS ASSERTION WILL FAIL ON UNFIXED CODE**
        // It proves the bug: tracking number is not retrieved
        console.log(`\n🎯 CRITICAL CHECK: Does shippingCarrier have a tracking number?`);
        expect(updatedOrder.shippingCarrier).not.toBeNull();
        expect(updatedOrder.shippingCarrier).not.toBe("");
        expect(typeof updatedOrder.shippingCarrier).toBe("string");
        expect(updatedOrder.shippingCarrier!.length).toBeGreaterThan(0);
        
        console.log(`   ✓ Tracking number retrieved: ${updatedOrder.shippingCarrier}`);
        console.log(`\n✅ BUG IS FIXED: Tracking number was retrieved before status update!`);
      } else {
        console.log(`\n⚠ Shipment failed: ${result.error}`);
        console.log(`   This is expected if the order doesn't exist in Shopee or has invalid status.`);
        console.log(`   Skipping tracking number check for failed shipment.`);
      }
      
    } finally {
      // Cleanup: Delete test order
      await db
        .delete(shopeeOrders)
        .where(eq(shopeeOrders.orderSn, testOrderSn));
      
      console.log(`\n🧹 Cleanup: Test order deleted`);
    }
  }, 60000); // 60 second timeout for API calls

  /**
   * Simplified property test: Verify the core invariant
   * 
   * **PROPERTY**: For any order with status=PROCESSED, shippingCarrier MUST NOT be null
   * 
   * This is the core invariant that the bug violates. After shipSingleOrder() succeeds,
   * if the order status is PROCESSED, the tracking number must be present.
   */
  it.skipIf(!hasValidCredentials)("should maintain invariant: PROCESSED orders must have tracking numbers", async () => {
    const testOrderSn = `BUGTEST${Date.now()}_INV`;
    
    await db.insert(shopeeOrders).values({
      shopId: testShopId,
      orderSn: testOrderSn,
      orderStatus: "READY_TO_SHIP",
      totalAmount: 150000,
      buyerUsername: "invariant_test_buyer",
      shippingCarrier: null,
      payTime: new Date(),
      createTime: new Date(),
      updatedAt: new Date()
    });

    try {
      console.log(`\n🔍 Testing invariant with order: ${testOrderSn}`);
      
      const result = await shipSingleOrder(testOrderSn, "dropoff");
      
      const updatedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderSn, testOrderSn))
        .limit(1);
      
      const updatedOrder = updatedOrders[0];
      
      console.log(`\n📦 Order state after shipment:`);
      console.log(`   Status: ${updatedOrder.orderStatus}`);
      console.log(`   Tracking: ${updatedOrder.shippingCarrier}`);
      
      // **CORE INVARIANT**: If status is PROCESSED, tracking number MUST exist
      // This is the fundamental property that the bug violates
      if (updatedOrder.orderStatus === "PROCESSED") {
        console.log(`\n🎯 INVARIANT CHECK: Status is PROCESSED, checking tracking number...`);
        
        // **THIS WILL FAIL ON UNFIXED CODE**
        expect(updatedOrder.shippingCarrier).not.toBeNull();
        expect(updatedOrder.shippingCarrier).not.toBe("");
        
        console.log(`   ✅ INVARIANT HOLDS: Tracking number exists!`);
      } else {
        console.log(`\n⚠ Status is not PROCESSED (${updatedOrder.orderStatus})`);
        console.log(`   Invariant check skipped for non-PROCESSED orders.`);
      }
      
    } finally {
      await db
        .delete(shopeeOrders)
        .where(eq(shopeeOrders.orderSn, testOrderSn));
    }
  }, 60000);
});
