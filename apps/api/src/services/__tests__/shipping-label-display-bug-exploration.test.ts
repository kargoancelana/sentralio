import { describe, it, expect, beforeAll } from "bun:test";
import { db } from "../../db/client";
import { shopeeOrders, shopeeCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";
import { collectLabelData } from "../label-data.service";

/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * **Property 1: Bug Condition** - Custom Labels Missing Recipient Images and QR Code
 * 
 * This test verifies the BUG CONDITION:
 * - When collectLabelData() is called for a custom label with tracking number
 * - The system calls getShippingDocumentDataInfo API
 * - BUT recipient images (nameImg, phoneImg, addressImg) are NOT returned (empty strings)
 * - AND tracking number may not be available for QR code generation
 * - This causes custom labels to display fallback text instead of images
 * - And QR codes fail to generate
 * 
 * **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS
 * - Recipient images are empty strings (nameImg="", phoneImg="", addressImg="")
 * - Tracking number may be missing or empty
 * - This proves the bug exists
 * 
 * **EXPECTED OUTCOME AFTER FIX**: Test PASSES
 * - Recipient images are non-empty base64 strings starting with "data:image"
 * - Tracking number is available and non-empty
 * - QR code can be generated
 * - This proves the bug is fixed
 * 
 * **NOTE**: This test requires valid Shopee API credentials and a PROCESSED order
 * with tracking number in the database. It will use the actual Shopee API to
 * demonstrate the bug.
 */

describe("Bug Condition Exploration: Custom Labels Missing Recipient Images and QR Code", () => {
  let testShopId: number = 0;
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
   * Property-based test scoped to custom labels with tracking numbers
   * 
   * **Scoped PBT Approach**: We scope the property to custom labels with tracking
   * numbers to ensure reproducibility and clear demonstration of the bug.
   * 
   * **IMPORTANT**: This test uses REAL Shopee API calls to demonstrate the actual bug.
   * The bug is that getShippingDocumentDataInfo returns empty recipient images
   * even though the order has valid recipient information.
   */
  it(
    "should have recipient images and tracking number for custom labels",
    async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }
      
      /**
       * Test Strategy:
       * 1. Find a real PROCESSED order with tracking number
       * 2. Call collectLabelData() which calls getShippingDocumentDataInfo
       * 3. Verify that recipient images are returned as non-empty base64 strings
       * 4. Verify that tracking number is available for QR code generation
       * 
       * **BUG CONDITION**: On unfixed code:
       * - recipientImages.nameImg will be empty string ""
       * - recipientImages.phoneImg will be empty string ""
       * - recipientImages.addressImg will be empty string ""
       * - This causes frontend to display fallback text instead of images
       * - QR code may fail to generate if tracking number is missing
       * 
       * **EXPECTED BEHAVIOR**: After fix:
       * - recipientImages.nameImg should be non-empty base64 string starting with "data:image"
       * - recipientImages.phoneImg should be non-empty base64 string starting with "data:image"
       * - recipientImages.addressImg should be non-empty base64 string starting with "data:image"
       * - trackingNumber should be non-empty string
       * - QR code can be generated from tracking number
       */
      
      // Find a PROCESSED order with tracking number to test with
      const processedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      // Look for an order with tracking number
      let testOrderSn: string | null = null;
      for (const order of processedOrders) {
        if (order.trackingNumber && order.trackingNumber.length > 0) {
          testOrderSn = order.orderSn;
          console.log(`✓ Found PROCESSED order with tracking number: ${testOrderSn}`);
          console.log(`  Tracking number: ${order.trackingNumber}`);
          break;
        }
      }
      
      if (!testOrderSn) {
        console.warn("⚠ No PROCESSED orders with tracking numbers found.");
        console.warn("  Skipping test. To run this test:");
        console.warn("  1. Ensure you have orders in PROCESSED status");
        console.warn("  2. Ensure orders have tracking numbers assigned");
        return; // Skip test gracefully
      }
      
      console.log(`\n🔍 Testing bug condition with order: ${testOrderSn}`);
      console.log(`   Shop ID: ${testShopId}`);
      console.log(`   Order status: PROCESSED (custom label eligible)`);
      
      // Call collectLabelData to get label data including recipient images
      const labelData = await collectLabelData(testOrderSn);
      
      console.log(`\n📊 Label data collected:`);
      console.log(`   Order SN: ${labelData.orderSn}`);
      console.log(`   Tracking Number: ${labelData.trackingNumber || 'MISSING'}`);
      console.log(`   Recipient Name Image: ${labelData.recipient.nameImg ? `${labelData.recipient.nameImg.substring(0, 50)}...` : 'EMPTY'}`);
      console.log(`   Recipient Phone Image: ${labelData.recipient.phoneImg ? `${labelData.recipient.phoneImg.substring(0, 50)}...` : 'EMPTY'}`);
      console.log(`   Recipient Address Image: ${labelData.recipient.addressImg ? `${labelData.recipient.addressImg.substring(0, 50)}...` : 'EMPTY'}`);
      
      // **CRITICAL ASSERTIONS**: These verify the expected behavior
      // On UNFIXED code, these assertions will FAIL, proving the bug exists
      
      console.log(`\n🎯 CRITICAL CHECK 1: Does recipient name image exist?`);
      expect(labelData.recipient.nameImg).not.toBe("");
      expect(labelData.recipient.nameImg).toBeTruthy();
      expect(labelData.recipient.nameImg).toMatch(/^data:image/);
      console.log(`   ✓ Recipient name image exists and is valid base64`);
      
      console.log(`\n🎯 CRITICAL CHECK 2: Does recipient phone image exist?`);
      expect(labelData.recipient.phoneImg).not.toBe("");
      expect(labelData.recipient.phoneImg).toBeTruthy();
      expect(labelData.recipient.phoneImg).toMatch(/^data:image/);
      console.log(`   ✓ Recipient phone image exists and is valid base64`);
      
      console.log(`\n🎯 CRITICAL CHECK 3: Does recipient address image exist?`);
      expect(labelData.recipient.addressImg).not.toBe("");
      expect(labelData.recipient.addressImg).toBeTruthy();
      expect(labelData.recipient.addressImg).toMatch(/^data:image/);
      console.log(`   ✓ Recipient address image exists and is valid base64`);
      
      console.log(`\n🎯 CRITICAL CHECK 4: Is tracking number available for QR code?`);
      expect(labelData.trackingNumber).not.toBe("");
      expect(labelData.trackingNumber).toBeTruthy();
      expect(typeof labelData.trackingNumber).toBe("string");
      expect(labelData.trackingNumber.length).toBeGreaterThan(0);
      console.log(`   ✓ Tracking number available: ${labelData.trackingNumber}`);
      
      console.log(`\n✅ BUG IS FIXED: All recipient images and tracking number are available!`);
      console.log(`   Custom labels will display recipient images correctly`);
      console.log(`   QR code can be generated from tracking number`);
    },
    60000 // 60 second timeout for API calls
  );

  /**
   * Simplified property test: Verify the core invariant
   * 
   * **PROPERTY**: For any custom label with tracking number, recipient images MUST be non-empty
   * 
   * This is the core invariant that the bug violates. When collectLabelData() is called
   * for a PROCESSED order with tracking number, recipient images must be returned.
   */
  it(
    "should maintain invariant: custom labels must have recipient images",
    async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }
      
      // Find a PROCESSED order with tracking number to test with
      const processedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      // Look for an order with tracking number
      let testOrderSn: string | null = null;
      for (const order of processedOrders) {
        if (order.trackingNumber && order.trackingNumber.length > 0) {
          testOrderSn = order.orderSn;
          break;
        }
      }
      
      if (!testOrderSn) {
        console.warn("⚠ No PROCESSED orders with tracking numbers found. Skipping test.");
        return;
      }
      
      console.log(`\n🔍 Testing invariant with order: ${testOrderSn}`);
      
      const labelData = await collectLabelData(testOrderSn);
      
      console.log(`\n📦 Label data state:`);
      console.log(`   Has name image: ${!!labelData.recipient.nameImg}`);
      console.log(`   Has phone image: ${!!labelData.recipient.phoneImg}`);
      console.log(`   Has address image: ${!!labelData.recipient.addressImg}`);
      console.log(`   Has tracking number: ${!!labelData.trackingNumber}`);
      
      // **CORE INVARIANT**: For custom labels, recipient images MUST exist
      // This is the fundamental property that the bug violates
      console.log(`\n🎯 INVARIANT CHECK: All recipient images must be present...`);
      
      // **THESE WILL FAIL ON UNFIXED CODE**
      const hasAllImages = 
        labelData.recipient.nameImg !== "" &&
        labelData.recipient.phoneImg !== "" &&
        labelData.recipient.addressImg !== "";
      
      expect(hasAllImages).toBe(true);
      
      if (hasAllImages) {
        // Verify they are valid base64 image data
        expect(labelData.recipient.nameImg).toMatch(/^data:image/);
        expect(labelData.recipient.phoneImg).toMatch(/^data:image/);
        expect(labelData.recipient.addressImg).toMatch(/^data:image/);
        
        console.log(`   ✅ INVARIANT HOLDS: All recipient images exist and are valid!`);
      } else {
        console.log(`   ❌ INVARIANT VIOLATED: Some recipient images are missing!`);
        console.log(`   This confirms the bug exists.`);
      }
    },
    60000
  );

  /**
   * Test multiple orders to find counterexamples
   * 
   * This test processes multiple PROCESSED orders to find counterexamples
   * that demonstrate the bug. It helps understand the scope and frequency
   * of the bug.
   */
  it(
    "should find counterexamples: orders with missing recipient images",
    async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }
      
      console.log(`\n🔍 Searching for counterexamples across multiple orders...`);
      
      // Get multiple PROCESSED orders with tracking numbers
      const processedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      const ordersWithTracking = processedOrders.filter(
        order => order.trackingNumber && order.trackingNumber.length > 0
      );
      
      if (ordersWithTracking.length === 0) {
        console.log(`   ⚠ No PROCESSED orders with tracking numbers found`);
        console.log(`   Skipping counterexample search`);
        return;
      }
      
      console.log(`   Found ${ordersWithTracking.length} orders to test`);
      
      const counterexamples: Array<{
        orderSn: string;
        trackingNumber: string;
        missingImages: string[];
      }> = [];
      
      // Test each order
      for (const order of ordersWithTracking) {
        try {
          console.log(`\n   Testing order: ${order.orderSn}`);
          const labelData = await collectLabelData(order.orderSn);
          
          const missingImages: string[] = [];
          if (!labelData.recipient.nameImg || labelData.recipient.nameImg === "") {
            missingImages.push("nameImg");
          }
          if (!labelData.recipient.phoneImg || labelData.recipient.phoneImg === "") {
            missingImages.push("phoneImg");
          }
          if (!labelData.recipient.addressImg || labelData.recipient.addressImg === "") {
            missingImages.push("addressImg");
          }
          
          if (missingImages.length > 0) {
            console.log(`   ❌ COUNTEREXAMPLE FOUND: ${order.orderSn}`);
            console.log(`      Missing images: ${missingImages.join(", ")}`);
            console.log(`      Tracking number: ${order.trackingNumber}`);
            
            counterexamples.push({
              orderSn: order.orderSn,
              trackingNumber: order.trackingNumber!,
              missingImages
            });
          } else {
            console.log(`   ✓ Order has all recipient images`);
          }
        } catch (error: any) {
          console.log(`   ⚠ Error testing order ${order.orderSn}: ${error.message}`);
        }
      }
      
      console.log(`\n📊 Counterexample Summary:`);
      console.log(`   Total orders tested: ${ordersWithTracking.length}`);
      console.log(`   Orders with missing images: ${counterexamples.length}`);
      
      if (counterexamples.length > 0) {
        console.log(`\n   Counterexamples found:`);
        counterexamples.forEach((ce, idx) => {
          console.log(`   ${idx + 1}. Order ${ce.orderSn}`);
          console.log(`      Tracking: ${ce.trackingNumber}`);
          console.log(`      Missing: ${ce.missingImages.join(", ")}`);
        });
        
        console.log(`\n   ❌ BUG CONFIRMED: ${counterexamples.length} order(s) have missing recipient images`);
        console.log(`   This demonstrates the bug exists in production data`);
      } else {
        console.log(`\n   ✅ NO COUNTEREXAMPLES: All orders have recipient images`);
        console.log(`   Bug may be fixed or not present in current data`);
      }
      
      // **ASSERTION**: We expect to find counterexamples on unfixed code
      // On unfixed code, this will pass (counterexamples found = bug exists)
      // After fix, this will fail (no counterexamples = bug is fixed)
      // 
      // For bug exploration, we document findings but don't fail the test
      // The main property tests above will fail on unfixed code
      console.log(`\n   Note: This test documents counterexamples but doesn't fail`);
      console.log(`   The main property tests will fail on unfixed code`);
    },
    120000 // 2 minute timeout for multiple API calls
  );
});
