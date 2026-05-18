import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { db } from "../../db/client";
import { shopeeOrders, shopeeOrderItems, shopeeCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";
import { collectLabelData, getBatchLabelData } from "../label-data.service";

/**
 * Preservation Property Tests
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 * 
 * **Property 2: Preservation** - Existing Label Functionality
 * 
 * **IMPORTANT**: These tests follow observation-first methodology:
 * 1. Run UNFIXED code with non-buggy inputs (default labels, labels without tracking numbers)
 * 2. Observe and record actual outputs
 * 3. Write property-based tests asserting those observed outputs
 * 4. Verify tests PASS on UNFIXED code
 * 
 * These tests verify that existing label functionality remains unchanged:
 * - Sender information displays correctly as text
 * - Items table displays correctly
 * - Label metadata (weight, ship by date, sort code, batch code) displays correctly
 * - Barcode for tracking number generates and displays correctly
 * - Batch printing works correctly
 * - Default Shopee labels (non-custom) work correctly
 * 
 * **EXPECTED OUTCOME ON UNFIXED CODE**: Tests PASS
 * - This confirms baseline behavior to preserve
 * 
 * **EXPECTED OUTCOME AFTER FIX**: Tests PASS
 * - This confirms no regressions introduced
 */

describe("Preservation Property Tests: Existing Label Functionality", () => {
  let testShopId: number = 0;
  let hasValidCredentials = false;
  const testOrders: string[] = [];
  
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

  afterEach(async () => {
    // Cleanup test orders
    for (const orderSn of testOrders) {
      await db.delete(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn));
      await db.delete(shopeeOrderItems).where(eq(shopeeOrderItems.orderSn, orderSn));
    }
    testOrders.length = 0;
  });

  /**
   * Test 2.1: Sender information displays correctly as text across various sender data
   * 
   * **Validates: Requirement 3.1**
   * 
   * **Property**: For any label, sender information (name, phone, city) MUST be displayed as text
   * 
   * This test verifies that sender information continues to work correctly across
   * various label types and configurations. Sender info is displayed as text (not images)
   * and should remain unchanged by the bug fix.
   */
  describe("Test 2.1: Sender Information Preservation", () => {
    it("should display sender information as text for PROCESSED orders", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      // Find a PROCESSED order to test with
      const processedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(3);
      
      if (processedOrders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing sender information preservation with ${processedOrders.length} orders`);

      // Test each order
      for (const order of processedOrders) {
        console.log(`\n   Testing order: ${order.orderSn}`);
        
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Sender information MUST be present as text
        expect(labelData.sender).toBeDefined();
        expect(labelData.sender.name).toBeDefined();
        expect(typeof labelData.sender.name).toBe("string");
        expect(labelData.sender.name.length).toBeGreaterThan(0);
        
        expect(labelData.sender.phone).toBeDefined();
        expect(typeof labelData.sender.phone).toBe("string");
        expect(labelData.sender.phone.length).toBeGreaterThan(0);
        
        expect(labelData.sender.city).toBeDefined();
        expect(typeof labelData.sender.city).toBe("string");
        expect(labelData.sender.city.length).toBeGreaterThan(0);
        
        console.log(`   ✓ Sender info: ${labelData.sender.name}, ${labelData.sender.phone}, ${labelData.sender.city}`);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Sender information displays correctly as text`);
    }, 60000);

    it("should maintain consistent sender information format across multiple orders", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const processedOrders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (processedOrders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing sender information consistency across ${processedOrders.length} orders`);

      const senderInfos: Array<{ name: string; phone: string; city: string }> = [];

      for (const order of processedOrders) {
        const labelData = await collectLabelData(order.orderSn);
        senderInfos.push(labelData.sender);
      }

      // **PROPERTY**: All orders should have the same sender information (from env)
      const firstSender = senderInfos[0];
      for (const sender of senderInfos) {
        expect(sender.name).toBe(firstSender.name);
        expect(sender.phone).toBe(firstSender.phone);
        expect(sender.city).toBe(firstSender.city);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Sender information is consistent across all orders`);
    }, 90000);
  });

  /**
   * Test 2.2: Items table displays correctly across various product combinations
   * 
   * **Validates: Requirement 3.2**
   * 
   * **Property**: For any label, items table MUST display all order items with name, SKU, and quantity
   * 
   * This test verifies that the items table continues to work correctly across
   * various product combinations and quantities.
   */
  describe("Test 2.2: Items Table Preservation", () => {
    it("should display items table correctly for orders with single item", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      // Find orders with items
      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing items table preservation with ${orders.length} orders`);

      for (const order of orders) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Items array MUST be defined and contain items
        expect(labelData.items).toBeDefined();
        expect(Array.isArray(labelData.items)).toBe(true);
        expect(labelData.items.length).toBeGreaterThan(0);
        
        // **PROPERTY**: Each item MUST have name, sku, and qty
        for (const item of labelData.items) {
          expect(item.name).toBeDefined();
          expect(typeof item.name).toBe("string");
          expect(item.name.length).toBeGreaterThan(0);
          
          expect(item.sku).toBeDefined();
          expect(typeof item.sku).toBe("string");
          
          expect(item.qty).toBeDefined();
          expect(typeof item.qty).toBe("number");
          expect(item.qty).toBeGreaterThan(0);
        }
        
        // **PROPERTY**: Total quantity MUST match sum of item quantities
        const calculatedTotal = labelData.items.reduce((sum, item) => sum + item.qty, 0);
        expect(labelData.totalQty).toBe(calculatedTotal);
        
        console.log(`   ✓ Order ${order.orderSn}: ${labelData.items.length} items, total qty: ${labelData.totalQty}`);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Items table displays correctly`);
    }, 90000);

    it("should handle orders with multiple items correctly", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      // Find orders with multiple items
      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing multi-item orders`);

      for (const order of orders) {
        const items = await db
          .select()
          .from(shopeeOrderItems)
          .where(eq(shopeeOrderItems.orderSn, order.orderSn));
        
        if (items.length <= 1) continue;

        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Number of items in label data MUST match database
        expect(labelData.items.length).toBe(items.length);
        
        console.log(`   ✓ Order ${order.orderSn}: ${items.length} items verified`);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Multi-item orders handled correctly`);
    }, 90000);
  });

  /**
   * Test 2.3: Label metadata displays correctly across various configurations
   * 
   * **Validates: Requirement 3.3**
   * 
   * **Property**: For any label, metadata (weight, ship by date, sort code, batch code) MUST be displayed
   * 
   * This test verifies that label metadata continues to work correctly across
   * various label configurations.
   */
  describe("Test 2.3: Label Metadata Preservation", () => {
    it("should display label metadata correctly", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing label metadata preservation with ${orders.length} orders`);

      for (const order of orders) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Metadata fields MUST be defined (may be empty strings)
        expect(labelData.weight).toBeDefined();
        expect(typeof labelData.weight).toBe("string");
        
        expect(labelData.shipByDate).toBeDefined();
        expect(typeof labelData.shipByDate).toBe("string");
        
        expect(labelData.shipByTime).toBeDefined();
        expect(typeof labelData.shipByTime).toBe("string");
        
        expect(labelData.sortCode).toBeDefined();
        expect(typeof labelData.sortCode).toBe("string");
        
        expect(labelData.batchCode).toBeDefined();
        expect(typeof labelData.batchCode).toBe("string");
        
        console.log(`   ✓ Order ${order.orderSn}:`);
        console.log(`      Weight: ${labelData.weight || 'N/A'}`);
        console.log(`      Ship by: ${labelData.shipByDate || 'N/A'} ${labelData.shipByTime || ''}`);
        console.log(`      Sort code: ${labelData.sortCode || 'N/A'}`);
        console.log(`      Batch code: ${labelData.batchCode || 'N/A'}`);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Label metadata displays correctly`);
    }, 90000);

    it("should maintain consistent metadata structure across orders", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(3);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing metadata structure consistency`);

      for (const order of orders) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: All metadata fields MUST have consistent types
        expect(typeof labelData.weight).toBe("string");
        expect(typeof labelData.shipByDate).toBe("string");
        expect(typeof labelData.shipByTime).toBe("string");
        expect(typeof labelData.sortCode).toBe("string");
        expect(typeof labelData.batchCode).toBe("string");
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Metadata structure is consistent`);
    }, 60000);
  });

  /**
   * Test 2.4: Barcode for tracking number generates and displays correctly
   * 
   * **Validates: Requirement 3.4**
   * 
   * **Property**: For any label with tracking number, tracking number MUST be available for barcode generation
   * 
   * This test verifies that tracking numbers continue to be available for barcode
   * generation across various order types.
   */
  describe("Test 2.4: Barcode/Tracking Number Preservation", () => {
    it("should have tracking number available for barcode generation", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      // Find orders with tracking numbers
      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      const ordersWithTracking = orders.filter(o => o.trackingNumber && o.trackingNumber.length > 0);
      
      if (ordersWithTracking.length === 0) {
        console.warn("⚠ No orders with tracking numbers found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing tracking number preservation with ${ordersWithTracking.length} orders`);

      for (const order of ordersWithTracking) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Tracking number MUST be available and non-empty
        expect(labelData.trackingNumber).toBeDefined();
        expect(typeof labelData.trackingNumber).toBe("string");
        expect(labelData.trackingNumber.length).toBeGreaterThan(0);
        
        console.log(`   ✓ Order ${order.orderSn}: Tracking ${labelData.trackingNumber}`);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Tracking numbers available for barcode generation`);
    }, 90000);

    it("should maintain tracking number format across orders", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      const ordersWithTracking = orders.filter(o => o.trackingNumber && o.trackingNumber.length > 0);
      
      if (ordersWithTracking.length === 0) {
        console.warn("⚠ No orders with tracking numbers found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing tracking number format consistency`);

      for (const order of ordersWithTracking) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Tracking number MUST be a non-empty string
        expect(typeof labelData.trackingNumber).toBe("string");
        expect(labelData.trackingNumber.length).toBeGreaterThan(0);
        
        // **PROPERTY**: Tracking number should not contain special characters that break barcodes
        expect(labelData.trackingNumber).toMatch(/^[A-Z0-9\-_]+$/i);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Tracking number format is consistent`);
    }, 90000);
  });

  /**
   * Test 2.5: Batch printing works correctly across various batch sizes
   * 
   * **Validates: Requirement 3.5**
   * 
   * **Property**: For any batch of orders, all labels MUST be generated successfully
   * 
   * This test verifies that batch printing continues to work correctly across
   * various batch sizes (5, 10, 20 orders).
   */
  describe("Test 2.5: Batch Printing Preservation", () => {
    it("should process batch of 5 orders successfully", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length < 5) {
        console.warn(`⚠ Only ${orders.length} orders found, need 5. Skipping test.`);
        return;
      }

      console.log(`\n🔍 Testing batch printing with 5 orders`);

      const orderSns = orders.map(o => o.orderSn);
      const batchResult = await getBatchLabelData(orderSns);
      
      // **PROPERTY**: Batch result MUST contain results for all orders
      expect(batchResult.results).toBeDefined();
      expect(batchResult.results.length).toBe(5);
      expect(batchResult.total).toBe(5);
      
      // **PROPERTY**: Each result MUST have orderSn and success status
      for (const result of batchResult.results) {
        expect(result.orderSn).toBeDefined();
        expect(typeof result.success).toBe("boolean");
        
        if (result.success) {
          expect(result.data).toBeDefined();
        } else {
          expect(result.error).toBeDefined();
        }
      }
      
      console.log(`   ✓ Batch result: ${batchResult.successful} successful, ${batchResult.failed} failed`);
      console.log(`\n✅ PRESERVATION VERIFIED: Batch of 5 orders processed correctly`);
    }, 120000);

    it("should process batch of 10 orders successfully", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(10);
      
      if (orders.length < 10) {
        console.warn(`⚠ Only ${orders.length} orders found, need 10. Skipping test.`);
        return;
      }

      console.log(`\n🔍 Testing batch printing with 10 orders`);

      const orderSns = orders.map(o => o.orderSn);
      const batchResult = await getBatchLabelData(orderSns);
      
      // **PROPERTY**: Batch result MUST contain results for all orders
      expect(batchResult.results.length).toBe(10);
      expect(batchResult.total).toBe(10);
      
      console.log(`   ✓ Batch result: ${batchResult.successful} successful, ${batchResult.failed} failed`);
      console.log(`\n✅ PRESERVATION VERIFIED: Batch of 10 orders processed correctly`);
    }, 180000);

    it("should process batch of 20 orders successfully", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(20);
      
      if (orders.length < 20) {
        console.warn(`⚠ Only ${orders.length} orders found, need 20. Skipping test.`);
        return;
      }

      console.log(`\n🔍 Testing batch printing with 20 orders`);

      const orderSns = orders.map(o => o.orderSn);
      const batchResult = await getBatchLabelData(orderSns);
      
      // **PROPERTY**: Batch result MUST contain results for all orders
      expect(batchResult.results.length).toBe(20);
      expect(batchResult.total).toBe(20);
      
      console.log(`   ✓ Batch result: ${batchResult.successful} successful, ${batchResult.failed} failed`);
      console.log(`\n✅ PRESERVATION VERIFIED: Batch of 20 orders processed correctly`);
    }, 300000);

    it("should maintain order sequence in batch results", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length < 5) {
        console.warn(`⚠ Only ${orders.length} orders found, need 5. Skipping test.`);
        return;
      }

      console.log(`\n🔍 Testing batch order sequence preservation`);

      const orderSns = orders.map(o => o.orderSn);
      const batchResult = await getBatchLabelData(orderSns);
      
      // **PROPERTY**: Results MUST be in same order as input
      const resultOrderSns = batchResult.results.map(r => r.orderSn);
      expect(resultOrderSns).toEqual(orderSns);
      
      console.log(`\n✅ PRESERVATION VERIFIED: Batch order sequence maintained`);
    }, 120000);
  });

  /**
   * Test 2.6: Default Shopee labels (non-custom) work correctly
   * 
   * **Validates: Requirement 3.6**
   * 
   * **Property**: For any order type, label data collection MUST work correctly
   * 
   * This test verifies that default Shopee label functionality continues to work
   * correctly across various order types and statuses.
   */
  describe("Test 2.6: Default Shopee Labels Preservation", () => {
    it("should collect label data for PROCESSED orders correctly", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing default label functionality with ${orders.length} PROCESSED orders`);

      for (const order of orders) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Label data MUST contain all required fields
        expect(labelData.orderSn).toBe(order.orderSn);
        expect(labelData.orderDate).toBeDefined();
        expect(labelData.shippingCarrier).toBeDefined();
        expect(labelData.serviceType).toBeDefined();
        expect(labelData.sender).toBeDefined();
        expect(labelData.items).toBeDefined();
        expect(labelData.totalQty).toBeDefined();
        
        console.log(`   ✓ Order ${order.orderSn}: All required fields present`);
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Default label functionality works correctly`);
    }, 90000);

    it("should handle various shipping carriers correctly", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(10);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing various shipping carriers`);

      const carrierCounts: Record<string, number> = {};

      for (const order of orders) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: Shipping carrier MUST be defined
        expect(labelData.shippingCarrier).toBeDefined();
        expect(typeof labelData.shippingCarrier).toBe("string");
        
        // **PROPERTY**: Service type MUST be one of STD, ECO, EXP
        expect(labelData.serviceType).toMatch(/^(STD|ECO|EXP)$/);
        
        const carrier = labelData.shippingCarrier;
        carrierCounts[carrier] = (carrierCounts[carrier] || 0) + 1;
      }

      console.log(`   ✓ Carriers found:`, carrierCounts);
      console.log(`\n✅ PRESERVATION VERIFIED: Various shipping carriers handled correctly`);
    }, 120000);

    it("should maintain consistent label structure across order types", async () => {
      if (!hasValidCredentials) {
        console.warn("⚠ Skipping test: No valid credentials found");
        return;
      }

      const orders = await db
        .select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderStatus, "PROCESSED"))
        .limit(5);
      
      if (orders.length === 0) {
        console.warn("⚠ No PROCESSED orders found. Skipping test.");
        return;
      }

      console.log(`\n🔍 Testing label structure consistency`);

      for (const order of orders) {
        const labelData = await collectLabelData(order.orderSn);
        
        // **PROPERTY**: All label data MUST have consistent structure
        expect(labelData).toHaveProperty("orderSn");
        expect(labelData).toHaveProperty("orderDate");
        expect(labelData).toHaveProperty("shippingCarrier");
        expect(labelData).toHaveProperty("serviceType");
        expect(labelData).toHaveProperty("trackingNumber");
        expect(labelData).toHaveProperty("sortCode");
        expect(labelData).toHaveProperty("batchCode");
        expect(labelData).toHaveProperty("recipient");
        expect(labelData).toHaveProperty("sender");
        expect(labelData).toHaveProperty("items");
        expect(labelData).toHaveProperty("totalQty");
        expect(labelData).toHaveProperty("weight");
        expect(labelData).toHaveProperty("shipByDate");
        expect(labelData).toHaveProperty("shipByTime");
      }

      console.log(`\n✅ PRESERVATION VERIFIED: Label structure is consistent across order types`);
    }, 90000);
  });
});
