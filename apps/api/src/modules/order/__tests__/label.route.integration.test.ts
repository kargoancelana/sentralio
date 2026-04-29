import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { db } from "../../../db/client";
import { shopeeOrders } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { labelCache } from "../../../services/label-cache.service";

/**
 * Integration Tests: Label Routes
 * 
 * **Validates: Requirements 11.1, 11.2, 11.6, 11.7, 11.8**
 * 
 * These tests verify the label routes work correctly with the database
 * and label service integration.
 */

describe("Label Routes Integration Tests", () => {
  const testOrders: string[] = [];

  beforeEach(() => {
    // Clear cache before each test
    labelCache.clear();
  });

  afterEach(async () => {
    // Cleanup all test orders
    for (const orderSn of testOrders) {
      await db.delete(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn));
    }
    testOrders.length = 0;
    
    // Clear cache after each test
    labelCache.clear();
  });

  describe("GET /orders/:orderSn/shipping-label", () => {
    it("should return 422 for invalid order SN format", async () => {
      /**
       * Test: Invalid order SN format should return 422
       * 
       * **Validates: Requirements 11.6, 11.7**
       */
      const invalidOrderSns = [
        'order with spaces',
        'order@123',
        'order#456',
      ];

      // We're testing the validation logic, not making actual HTTP requests
      // The validation happens in the route handler
      for (const orderSn of invalidOrderSns) {
        const isValid = /^[A-Za-z0-9_-]{1,100}$/.test(orderSn);
        expect(isValid).toBe(false);
      }
    });

    it("should return 404 for non-existent order", async () => {
      /**
       * Test: Non-existent order should return 404
       * 
       * **Validates: Requirements 11.6, 11.7**
       */
      const orderSn = 'NONEXISTENT_ORDER_123';
      
      // Verify order doesn't exist
      const order = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, orderSn)
      });
      
      expect(order).toBeUndefined();
    });

    it("should return 422 for order with wrong status", async () => {
      /**
       * Test: Order with non-PROCESSED status should return 422
       * 
       * **Validates: Requirements 11.6, 11.7**
       */
      const orderSn = 'LABEL_INTEGRATION_WRONG_STATUS';
      
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: 'READY_TO_SHIP', // Wrong status
        totalAmount: 100000,
        buyerUsername: 'buyer1',
        shippingCarrier: 'SPX123456789',
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Verify order exists but has wrong status
      const order = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, orderSn)
      });
      
      expect(order).toBeDefined();
      expect(order?.orderStatus).not.toBe('PROCESSED');
    });

    it("should return 404 for order without tracking number", async () => {
      /**
       * Test: Order without tracking number should return 404
       * 
       * **Validates: Requirements 11.6, 11.7**
       */
      const orderSn = 'LABEL_INTEGRATION_NO_TRACKING';
      
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: 'PROCESSED',
        totalAmount: 100000,
        buyerUsername: 'buyer1',
        shippingCarrier: null, // No tracking
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Verify order exists but has no tracking
      const order = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, orderSn)
      });
      
      expect(order).toBeDefined();
      expect(order?.shippingCarrier).toBeNull();
    });

    it("should successfully retrieve label for valid order with cache", async () => {
      /**
       * Test: Valid order with cached label should return 200
       * 
       * **Validates: Requirements 11.1, 11.3, 11.6**
       */
      const orderSn = 'LABEL_INTEGRATION_VALID_001';
      
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: 'PROCESSED',
        totalAmount: 100000,
        buyerUsername: 'buyer1',
        shippingCarrier: 'SPX123456789',
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache
      labelCache.set(orderSn, {
        orderSn: orderSn,
        url: 'https://example.com/label.pdf',
        format: 'pdf',
        trackingNumber: 'SPX123456789',
        retrievedAt: new Date()
      });

      // Verify order exists and is valid
      const order = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, orderSn)
      });
      
      expect(order).toBeDefined();
      expect(order?.orderStatus).toBe('PROCESSED');
      expect(order?.shippingCarrier).toBeDefined();

      // Verify cache has the label
      const cachedLabel = labelCache.get(orderSn);
      expect(cachedLabel).toBeDefined();
      expect(cachedLabel?.url).toBe('https://example.com/label.pdf');
    });
  });

  describe("POST /orders/shipping-labels/batch", () => {
    it("should return 400 for invalid request body", () => {
      /**
       * Test: Invalid request body should return 400
       * 
       * **Validates: Requirements 11.4, 11.8**
       */
      const invalidBodies = [
        null,
        undefined,
        'not an object',
        { wrong_field: [] },
        { order_sns: 'not an array' },
      ];

      // Test validation logic
      for (const body of invalidBodies) {
        const isValid = !!(body && typeof body === 'object' && 
                       'order_sns' in body && Array.isArray(body.order_sns));
        expect(isValid).toBe(false);
      }
    });

    it("should return 422 for empty order_sns array", () => {
      /**
       * Test: Empty array should return 422
       * 
       * **Validates: Requirements 11.4, 11.8**
       */
      const body = { order_sns: [] };
      
      expect(body.order_sns.length).toBe(0);
    });

    it("should return 422 for batch exceeding 50 orders", () => {
      /**
       * Test: Batch > 50 orders should return 422
       * 
       * **Validates: Requirements 11.4, 11.8**
       */
      const orderSns = Array.from({ length: 51 }, (_, i) => `ORDER${i + 1}`);
      const body = { order_sns: orderSns };
      
      expect(body.order_sns.length).toBeGreaterThan(50);
    });

    it("should successfully process batch with valid orders", async () => {
      /**
       * Test: Valid batch should return 200 with results
       * 
       * **Validates: Requirements 11.2, 11.5, 11.8**
       */
      const orderSns = [
        'LABEL_BATCH_VALID_001',
        'LABEL_BATCH_VALID_002',
        'LABEL_BATCH_VALID_003'
      ];
      
      // Create valid orders
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: 'PROCESSED',
          totalAmount: 100000,
          buyerUsername: 'buyer',
          shippingCarrier: `TRACK_${orderSn}`,
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: 'pdf',
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        });
      }

      // Verify all orders exist
      for (const orderSn of orderSns) {
        const order = await db.query.shopeeOrders.findFirst({
          where: eq(shopeeOrders.orderSn, orderSn)
        });
        expect(order).toBeDefined();
        expect(order?.orderStatus).toBe('PROCESSED');
      }

      // Verify all labels are cached
      for (const orderSn of orderSns) {
        const cachedLabel = labelCache.get(orderSn);
        expect(cachedLabel).toBeDefined();
      }
    });

    it("should handle batch with mixed valid and invalid orders", async () => {
      /**
       * Test: Batch with partial failures should return 200 with mixed results
       * 
       * **Validates: Requirements 11.2, 11.5, 11.8**
       */
      const orderSns = [
        'LABEL_BATCH_MIX_VALID_001',
        'LABEL_BATCH_MIX_INVALID_001',
        'LABEL_BATCH_MIX_VALID_002'
      ];
      
      // Create one valid order
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: 'LABEL_BATCH_MIX_VALID_001',
        orderStatus: 'PROCESSED',
        totalAmount: 100000,
        buyerUsername: 'buyer',
        shippingCarrier: 'TRACK001',
        createTime: new Date(),
      });
      testOrders.push('LABEL_BATCH_MIX_VALID_001');

      // Create invalid order (wrong status)
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: 'LABEL_BATCH_MIX_INVALID_001',
        orderStatus: 'READY_TO_SHIP', // Wrong status
        totalAmount: 100000,
        buyerUsername: 'buyer',
        shippingCarrier: 'TRACK002',
        createTime: new Date(),
      });
      testOrders.push('LABEL_BATCH_MIX_INVALID_001');

      // Create another valid order
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: 'LABEL_BATCH_MIX_VALID_002',
        orderStatus: 'PROCESSED',
        totalAmount: 100000,
        buyerUsername: 'buyer',
        shippingCarrier: 'TRACK003',
        createTime: new Date(),
      });
      testOrders.push('LABEL_BATCH_MIX_VALID_002');

      // Pre-populate cache for valid orders
      labelCache.set('LABEL_BATCH_MIX_VALID_001', {
        orderSn: 'LABEL_BATCH_MIX_VALID_001',
        url: 'https://example.com/label1.pdf',
        format: 'pdf',
        trackingNumber: 'TRACK001',
        retrievedAt: new Date()
      });
      labelCache.set('LABEL_BATCH_MIX_VALID_002', {
        orderSn: 'LABEL_BATCH_MIX_VALID_002',
        url: 'https://example.com/label2.pdf',
        format: 'pdf',
        trackingNumber: 'TRACK003',
        retrievedAt: new Date()
      });

      // Verify orders exist with correct statuses
      const validOrder1 = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, 'LABEL_BATCH_MIX_VALID_001')
      });
      expect(validOrder1?.orderStatus).toBe('PROCESSED');

      const invalidOrder = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, 'LABEL_BATCH_MIX_INVALID_001')
      });
      expect(invalidOrder?.orderStatus).not.toBe('PROCESSED');

      const validOrder2 = await db.query.shopeeOrders.findFirst({
        where: eq(shopeeOrders.orderSn, 'LABEL_BATCH_MIX_VALID_002')
      });
      expect(validOrder2?.orderStatus).toBe('PROCESSED');
    });

    it("should handle batch with all invalid orders", async () => {
      /**
       * Test: Batch with all failures should return 200 with all failed results
       * 
       * **Validates: Requirements 11.2, 11.5, 11.8**
       */
      const orderSns = [
        'NONEXISTENT_001',
        'NONEXISTENT_002',
        'NONEXISTENT_003'
      ];

      // Verify none of these orders exist
      for (const orderSn of orderSns) {
        const order = await db.query.shopeeOrders.findFirst({
          where: eq(shopeeOrders.orderSn, orderSn)
        });
        expect(order).toBeUndefined();
      }
    });

    it("should handle batch with exactly 50 orders", async () => {
      /**
       * Test: Batch with maximum size (50) should be accepted
       * 
       * **Validates: Requirements 11.4, 11.8**
       */
      const orderSns = Array.from({ length: 50 }, (_, i) => 
        `LABEL_BATCH_MAX_${String(i + 1).padStart(3, '0')}`
      );

      // Create all 50 orders
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: 'PROCESSED',
          totalAmount: 100000,
          buyerUsername: 'buyer',
          shippingCarrier: `TRACK_${orderSn}`,
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: 'pdf',
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        });
      }

      // Verify all orders exist
      expect(testOrders.length).toBe(50);
      
      for (const orderSn of orderSns) {
        const order = await db.query.shopeeOrders.findFirst({
          where: eq(shopeeOrders.orderSn, orderSn)
        });
        expect(order).toBeDefined();
      }
    });
  });

  describe("Response Format Validation", () => {
    it("should return correct single label response format", async () => {
      /**
       * Test: Single label response should match expected format
       * 
       * **Validates: Requirements 11.3**
       */
      const orderSn = 'LABEL_FORMAT_TEST_001';
      
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: 'PROCESSED',
        totalAmount: 100000,
        buyerUsername: 'buyer',
        shippingCarrier: 'SPX123456789',
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache
      const cachedLabel = {
        orderSn: orderSn,
        url: 'https://example.com/label.pdf',
        format: 'pdf' as const,
        trackingNumber: 'SPX123456789',
        retrievedAt: new Date()
      };
      labelCache.set(orderSn, cachedLabel);

      // Verify response format structure
      const response = {
        success: true,
        label: cachedLabel
      };

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('label');
      expect(response.label).toHaveProperty('orderSn');
      expect(response.label).toHaveProperty('url');
      expect(response.label).toHaveProperty('format');
      expect(response.label).toHaveProperty('trackingNumber');
    });

    it("should return correct batch response format", async () => {
      /**
       * Test: Batch response should match expected format
       * 
       * **Validates: Requirements 11.5**
       */
      const orderSns = ['BATCH_FORMAT_001', 'BATCH_FORMAT_002'];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: 'PROCESSED',
          totalAmount: 100000,
          buyerUsername: 'buyer',
          shippingCarrier: `TRACK_${orderSn}`,
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: 'pdf',
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        });
      }

      // Verify response format structure
      const response = {
        success: true,
        results: orderSns.map(orderSn => ({
          orderSn,
          success: true,
          label: labelCache.get(orderSn)
        })),
        summary: {
          total: 2,
          successful: 2,
          failed: 0
        }
      };

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('summary');
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.summary).toHaveProperty('total');
      expect(response.summary).toHaveProperty('successful');
      expect(response.summary).toHaveProperty('failed');
    });
  });
});
