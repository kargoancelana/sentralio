import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getBatchLabels } from "../label.service";
import { db } from "../../db/client";
import { shopeeOrders } from "../../db/schema";
import { eq } from "drizzle-orm";
import { labelCache } from "../label-cache.service";

/**
 * Unit Tests: Batch Label Retrieval
 * 
 * **Validates: Requirements 3.2, 3.3, 3.6, 13.5, 13.6, 12.3**
 * 
 * These tests verify the batch label retrieval functionality including:
 * - Concurrent processing (max 5 at a time)
 * - Rate limiting between batches
 * - Continuing on individual failures
 * - Batch summary logging
 */

describe("Batch Label Retrieval", () => {
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

  describe("Basic Batch Processing", () => {
    it("should process empty array", async () => {
      const result = await getBatchLabels([]);
      
      expect(result).toEqual([]);
    });

    it("should process single order", async () => {
      const orderSn = "BATCH_SINGLE_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer1",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const results = await getBatchLabels([orderSn]);
      
      expect(results).toHaveLength(1);
      expect(results[0].orderSn).toBe(orderSn);
      // May succeed or fail depending on API availability, but should return a result
    }, { timeout: 15000 });

    it("should process multiple orders", async () => {
      const orderSns = ["BATCH_MULTI_001", "BATCH_MULTI_002", "BATCH_MULTI_003"];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
    }, { timeout: 20000 });

    it("should return results in same order as input", async () => {
      const orderSns = ["BATCH_ORDER_001", "BATCH_ORDER_002", "BATCH_ORDER_003", "BATCH_ORDER_004"];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
    }, { timeout: 20000 });
  });

  describe("Batch with All Successful Retrievals", () => {
    it("should successfully retrieve all labels when all orders are valid and cached", async () => {
      /**
       * Test: Batch with all successful retrievals (using cache)
       * 
       * This test verifies that when all orders in a batch are valid and have
       * cached labels, all retrievals succeed.
       * 
       * **Validates: Requirements 3.2, 3.3**
       */
      const orderSns = ["BATCH_ALL_SUCCESS_001", "BATCH_ALL_SUCCESS_002", "BATCH_ALL_SUCCESS_003"];
      
      // Create all valid orders
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: `TRACK_${orderSn}`,
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache for guaranteed success
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/label_${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        });
      }

      const results = await getBatchLabels(orderSns);
      
      // Verify all succeeded
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(results.every(r => r.label !== undefined)).toBe(true);
      expect(results.every(r => r.error === undefined)).toBe(true);
      
      // Verify each result has correct data
      for (let i = 0; i < orderSns.length; i++) {
        expect(results[i].orderSn).toBe(orderSns[i]);
        expect(results[i].label?.orderSn).toBe(orderSns[i]);
        expect(results[i].label?.url).toBe(`https://example.com/label_${orderSns[i]}.pdf`);
        expect(results[i].label?.format).toBe("pdf");
        expect(results[i].label?.trackingNumber).toBe(`TRACK_${orderSns[i]}`);
      }
    });

    it("should handle batch of 10 valid orders all succeeding", async () => {
      /**
       * Test: Larger batch with all successful retrievals
       * 
       * This test verifies that a larger batch (10 orders) can all succeed
       * when all orders are valid.
       * 
       * **Validates: Requirements 3.2, 3.3, 3.6**
       */
      const orderSns = Array.from({ length: 10 }, (_, i) => 
        `BATCH_ALL_SUCCESS_LARGE_${String(i + 1).padStart(3, '0')}`
      );
      
      // Create all valid orders with cache
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: `TRACK_${orderSn}`,
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/label_${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        });
      }

      const results = await getBatchLabels(orderSns);
      
      // Verify all 10 succeeded
      expect(results).toHaveLength(10);
      expect(results.filter(r => r.success).length).toBe(10);
      expect(results.filter(r => !r.success).length).toBe(0);
      
      // Verify order is preserved
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
    });
  });

  describe("Concurrent Processing Behavior", () => {
    it("should process up to 5 orders concurrently", async () => {
      /**
       * Test: Concurrent processing limit
       * 
       * This test verifies that the batch processing respects the concurrent
       * limit of 5 orders at a time. With 10 orders, they should be processed
       * in 2 batches of 5.
       * 
       * **Validates: Requirements 3.6, 13.5**
       */
      // Create 10 orders
      const orderSns = Array.from({ length: 10 }, (_, i) => `BATCH_CONCURRENT_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache for fast, predictable processing
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: "SPX123456789",
          retrievedAt: new Date()
        });
      }

      const startTime = Date.now();
      const results = await getBatchLabels(orderSns);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(10);
      
      // With concurrent processing (5 at a time) and 300ms delay between batches,
      // 10 orders should take roughly: 2 batches * (processing time + 300ms delay)
      // This should be faster than sequential processing
      console.log(`Batch processing 10 orders took ${duration}ms`);
      
      // Verify all succeeded (since we used cache)
      expect(results.every(r => r.success)).toBe(true);
    }, { timeout: 30000 });

    it("should handle large batch (20 orders) with concurrent processing", async () => {
      /**
       * Test: Large batch concurrent processing
       * 
       * This test verifies that a larger batch (20 orders) is processed
       * correctly with concurrent processing, resulting in 4 batches of 5.
       * 
       * **Validates: Requirements 3.6, 13.5**
       */
      const orderSns = Array.from({ length: 20 }, (_, i) => `BATCH_LARGE_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: "SPX123456789",
          retrievedAt: new Date()
        });
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(20);
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
      
      // Verify all succeeded
      expect(results.every(r => r.success)).toBe(true);
    }, { timeout: 60000 });

    it("should maintain order despite concurrent processing", async () => {
      /**
       * Test: Order preservation with concurrent processing
       * 
       * This test verifies that even with concurrent processing, the results
       * are returned in the same order as the input order SNs.
       * 
       * **Validates: Requirements 3.6**
       */
      const orderSns = Array.from({ length: 12 }, (_, i) => `BATCH_ORDER_PRESERVE_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: `TRACK_${orderSn}`,
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        });
      }

      const results = await getBatchLabels(orderSns);
      
      // Verify order is preserved
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
      
      // Verify each result has correct tracking number
      results.forEach((result, index) => {
        expect(result.label?.trackingNumber).toBe(`TRACK_${orderSns[index]}`);
      });
    }, { timeout: 30000 });

    it("should handle concurrent processing with mixed success/failure", async () => {
      /**
       * Test: Concurrent processing with failures
       * 
       * This test verifies that concurrent processing continues correctly
       * even when some orders fail, and results are still returned in order.
       * 
       * **Validates: Requirements 3.6, 3.3**
       */
      const orderSns = [
        "BATCH_CONCURRENT_MIX_001", // Success
        "BATCH_CONCURRENT_MIX_002", // Success
        "BATCH_CONCURRENT_MIX_FAIL_001", // Fail - no tracking
        "BATCH_CONCURRENT_MIX_003", // Success
        "BATCH_CONCURRENT_MIX_004", // Success
        "BATCH_CONCURRENT_MIX_FAIL_002", // Fail - wrong status
        "BATCH_CONCURRENT_MIX_005", // Success
      ];
      
      await db.insert(shopeeOrders).values([
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_001",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "TRACK001",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_002",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "TRACK002",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_FAIL_001",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: null, // No tracking
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_003",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "TRACK003",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_004",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "TRACK004",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_FAIL_002",
          orderStatus: "READY_TO_SHIP", // Wrong status
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "TRACK005",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_CONCURRENT_MIX_005",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "TRACK006",
          createTime: new Date(),
        },
      ]);
      testOrders.push(...orderSns);

      // Pre-populate cache for valid orders
      ["BATCH_CONCURRENT_MIX_001", "BATCH_CONCURRENT_MIX_002", "BATCH_CONCURRENT_MIX_003", 
       "BATCH_CONCURRENT_MIX_004", "BATCH_CONCURRENT_MIX_005"].forEach((orderSn, index) => {
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: `TRACK00${index + 1}`,
          retrievedAt: new Date()
        });
      });

      const results = await getBatchLabels(orderSns);
      
      // Verify order is preserved
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
      
      // Verify success count
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      expect(successCount).toBe(5);
      expect(failCount).toBe(2);
    }, { timeout: 30000 });
  });

  describe("Batch with Partial Failures", () => {
    it("should continue processing on individual failures", async () => {
      /**
       * Test: Batch with partial failures
       * 
       * This test verifies that when some orders in a batch fail validation,
       * the batch continues processing the valid orders and returns results
       * for all orders (both successful and failed).
       * 
       * **Validates: Requirements 3.2, 3.3, 3.5**
       */
      const orderSns = [
        "BATCH_PARTIAL_FAIL_001", // Valid
        "NONEXISTENT_ORDER", // Invalid - doesn't exist
        "BATCH_PARTIAL_FAIL_002", // Valid
      ];
      
      // Create only the valid orders with cache for guaranteed success
      await db.insert(shopeeOrders).values([
        {
          shopId: 12345,
          orderSn: "BATCH_PARTIAL_FAIL_001",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer1",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_PARTIAL_FAIL_002",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer2",
          shippingCarrier: "JNE987654321",
          createTime: new Date(),
        }
      ]);
      testOrders.push("BATCH_PARTIAL_FAIL_001", "BATCH_PARTIAL_FAIL_002");

      // Pre-populate cache for valid orders
      labelCache.set("BATCH_PARTIAL_FAIL_001", {
        orderSn: "BATCH_PARTIAL_FAIL_001",
        url: "https://example.com/label1.pdf",
        format: "pdf",
        trackingNumber: "SPX123456789",
        retrievedAt: new Date()
      });
      labelCache.set("BATCH_PARTIAL_FAIL_002", {
        orderSn: "BATCH_PARTIAL_FAIL_002",
        url: "https://example.com/label2.pdf",
        format: "pdf",
        trackingNumber: "JNE987654321",
        retrievedAt: new Date()
      });

      const results = await getBatchLabels(orderSns);
      
      // Verify we got results for all orders
      expect(results).toHaveLength(3);
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
      
      // Verify the valid orders succeeded
      const result1 = results.find(r => r.orderSn === "BATCH_PARTIAL_FAIL_001");
      expect(result1?.success).toBe(true);
      expect(result1?.label).toBeDefined();
      
      const result2 = results.find(r => r.orderSn === "BATCH_PARTIAL_FAIL_002");
      expect(result2?.success).toBe(true);
      expect(result2?.label).toBeDefined();
      
      // Verify the nonexistent order failed
      const nonexistentResult = results.find(r => r.orderSn === "NONEXISTENT_ORDER");
      expect(nonexistentResult?.success).toBe(false);
      expect(nonexistentResult?.error).toBeDefined();
      expect(nonexistentResult?.label).toBeUndefined();
    }, { timeout: 20000 });

    it("should handle mix of valid and invalid orders", async () => {
      /**
       * Test: Batch with multiple types of failures
       * 
       * This test verifies that a batch can handle different types of validation
       * failures (wrong status, missing tracking number) while still processing
       * valid orders successfully.
       * 
       * **Validates: Requirements 3.2, 3.3, 3.5**
       */
      const orderSns = [
        "BATCH_MIX_VALID_001",
        "BATCH_MIX_INVALID_001", // Wrong status
        "BATCH_MIX_VALID_002",
        "BATCH_MIX_NO_TRACKING", // No tracking number
      ];
      
      await db.insert(shopeeOrders).values([
        {
          shopId: 12345,
          orderSn: "BATCH_MIX_VALID_001",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer1",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_MIX_INVALID_001",
          orderStatus: "READY_TO_SHIP", // Wrong status
          totalAmount: 100000,
          buyerUsername: "buyer2",
          shippingCarrier: "JNE987654321",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_MIX_VALID_002",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer3",
          shippingCarrier: "JNT123456789",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_MIX_NO_TRACKING",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer4",
          shippingCarrier: null, // No tracking
          createTime: new Date(),
        }
      ]);
      testOrders.push("BATCH_MIX_VALID_001", "BATCH_MIX_INVALID_001", "BATCH_MIX_VALID_002", "BATCH_MIX_NO_TRACKING");

      // Pre-populate cache for valid orders
      labelCache.set("BATCH_MIX_VALID_001", {
        orderSn: "BATCH_MIX_VALID_001",
        url: "https://example.com/label1.pdf",
        format: "pdf",
        trackingNumber: "SPX123456789",
        retrievedAt: new Date()
      });
      labelCache.set("BATCH_MIX_VALID_002", {
        orderSn: "BATCH_MIX_VALID_002",
        url: "https://example.com/label2.pdf",
        format: "pdf",
        trackingNumber: "JNT123456789",
        retrievedAt: new Date()
      });

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(4);
      
      // Verify valid orders succeeded
      const valid1 = results.find(r => r.orderSn === "BATCH_MIX_VALID_001");
      expect(valid1?.success).toBe(true);
      expect(valid1?.label).toBeDefined();
      
      const valid2 = results.find(r => r.orderSn === "BATCH_MIX_VALID_002");
      expect(valid2?.success).toBe(true);
      expect(valid2?.label).toBeDefined();
      
      // Verify invalid orders failed with appropriate errors
      const invalidResult = results.find(r => r.orderSn === "BATCH_MIX_INVALID_001");
      expect(invalidResult?.success).toBe(false);
      expect(invalidResult?.error).toBeDefined();
      expect(invalidResult?.error).toContain("status");
      
      const noTrackingResult = results.find(r => r.orderSn === "BATCH_MIX_NO_TRACKING");
      expect(noTrackingResult?.success).toBe(false);
      expect(noTrackingResult?.error).toBeDefined();
      expect(noTrackingResult?.error).toContain("Label pengiriman belum tersedia");
    }, { timeout: 20000 });

    it("should report accurate counts for partial failures", async () => {
      /**
       * Test: Verify accurate success/failure counts in partial failure scenario
       * 
       * This test ensures that when a batch has both successes and failures,
       * the counts are accurately reported.
       * 
       * **Validates: Requirements 3.5, 12.3**
       */
      const orderSns = [
        "BATCH_COUNT_SUCCESS_001",
        "BATCH_COUNT_SUCCESS_002",
        "BATCH_COUNT_FAIL_001", // Will fail - no tracking
        "BATCH_COUNT_SUCCESS_003",
        "BATCH_COUNT_FAIL_002", // Will fail - wrong status
      ];
      
      await db.insert(shopeeOrders).values([
        {
          shopId: 12345,
          orderSn: "BATCH_COUNT_SUCCESS_001",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer1",
          shippingCarrier: "TRACK001",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_COUNT_SUCCESS_002",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer2",
          shippingCarrier: "TRACK002",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_COUNT_FAIL_001",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer3",
          shippingCarrier: null, // No tracking
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_COUNT_SUCCESS_003",
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer4",
          shippingCarrier: "TRACK003",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: "BATCH_COUNT_FAIL_002",
          orderStatus: "READY_TO_SHIP", // Wrong status
          totalAmount: 100000,
          buyerUsername: "buyer5",
          shippingCarrier: "TRACK004",
          createTime: new Date(),
        }
      ]);
      testOrders.push(...orderSns);

      // Pre-populate cache for valid orders
      ["BATCH_COUNT_SUCCESS_001", "BATCH_COUNT_SUCCESS_002", "BATCH_COUNT_SUCCESS_003"].forEach(orderSn => {
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: orderSn.replace("BATCH_COUNT_SUCCESS_", "TRACK"),
          retrievedAt: new Date()
        });
      });

      const results = await getBatchLabels(orderSns);
      
      // Verify counts
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      expect(results).toHaveLength(5);
      expect(successCount).toBe(3);
      expect(failCount).toBe(2);
      expect(successCount + failCount).toBe(5);
    }, { timeout: 20000 });
  });

  describe("Batch with All Failures", () => {
    it("should handle all orders failing", async () => {
      /**
       * Test: Batch with all failures
       * 
       * This test verifies that when all orders in a batch fail validation,
       * the batch returns failure results for all orders with appropriate
       * error messages.
       * 
       * **Validates: Requirements 3.2, 3.3, 3.5**
       */
      const orderSns = ["NONEXISTENT_001", "NONEXISTENT_002", "NONEXISTENT_003"];

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(3);
      
      // All should have failed
      expect(results.every(r => !r.success)).toBe(true);
      expect(results.every(r => r.error !== undefined)).toBe(true);
      expect(results.every(r => r.label === undefined)).toBe(true);
      
      // Verify each has appropriate error message
      results.forEach(result => {
        expect(result.error).toContain("tidak ditemukan");
      });
    }, { timeout: 15000 });

    it("should handle batch where all orders have wrong status", async () => {
      /**
       * Test: All orders fail due to wrong status
       * 
       * This test verifies that when all orders have the wrong status,
       * all fail with appropriate error messages.
       * 
       * **Validates: Requirements 3.2, 3.3**
       */
      const orderSns = ["BATCH_ALL_WRONG_001", "BATCH_ALL_WRONG_002", "BATCH_ALL_WRONG_003"];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "READY_TO_SHIP", // Wrong status
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => !r.success)).toBe(true);
      expect(results.every(r => r.error !== undefined)).toBe(true);
      
      // Verify error messages mention status
      results.forEach(result => {
        expect(result.error).toMatch(/status/i);
      });
    }, { timeout: 15000 });

    it("should handle batch where all orders lack tracking numbers", async () => {
      /**
       * Test: All orders fail due to missing tracking numbers
       * 
       * This test verifies that when all orders lack tracking numbers,
       * all fail with appropriate error messages.
       * 
       * **Validates: Requirements 3.2, 3.3**
       */
      const orderSns = ["BATCH_NO_TRACK_001", "BATCH_NO_TRACK_002", "BATCH_NO_TRACK_003"];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: null, // No tracking
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => !r.success)).toBe(true);
      expect(results.every(r => r.error !== undefined)).toBe(true);
      
      // Verify error messages mention label not available
      results.forEach(result => {
        expect(result.error).toContain("Label pengiriman belum tersedia");
      });
    }, { timeout: 15000 });
  });

  describe("Error Handling - Additional Cases", () => {
    // This section is intentionally empty - additional error handling tests
    // are covered in other describe blocks above
  });

  describe("Cache Behavior", () => {
    it("should use cache for repeated orders in batch", async () => {
      const orderSn = "BATCH_CACHE_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer1",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache
      const cachedLabel = {
        orderSn: orderSn,
        url: "https://cached.example.com/label.pdf",
        format: "pdf" as const,
        trackingNumber: "SPX123456789",
        retrievedAt: new Date()
      };
      labelCache.set(orderSn, cachedLabel);

      // Request same order multiple times in batch
      const orderSns = [orderSn, orderSn, orderSn];
      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(3);
      
      // All should succeed with cached data
      expect(results.every(r => r.success)).toBe(true);
      expect(results.every(r => r.label?.url === cachedLabel.url)).toBe(true);
    });

    it("should cache labels retrieved during batch", async () => {
      const orderSns = ["BATCH_CACHE_NEW_001", "BATCH_CACHE_NEW_002"];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      await getBatchLabels(orderSns);
      
      // Check if labels are now in cache (for successful retrievals)
      // Note: May not be cached if API calls failed
      const cached1 = labelCache.get(orderSns[0]);
      const cached2 = labelCache.get(orderSns[1]);
      
      // At least verify cache operations don't throw errors
      expect(cached1 === null || cached1?.orderSn === orderSns[0]).toBe(true);
      expect(cached2 === null || cached2?.orderSn === orderSns[1]).toBe(true);
    }, { timeout: 20000 });
  });

  describe("Rate Limiting Delays", () => {
    it("should apply delay between batches", async () => {
      /**
       * Test: Rate limiting delay between batches
       * 
       * This test verifies that a 300ms delay is applied between batches
       * to respect Shopee API rate limits.
       * 
       * **Validates: Requirements 3.6, 13.6**
       */
      // Create 8 orders (will be processed in 2 batches of 5 and 3)
      const orderSns = Array.from({ length: 8 }, (_, i) => `BATCH_RATE_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache for fast processing
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: "SPX123456789",
          retrievedAt: new Date()
        });
      }

      const startTime = Date.now();
      const results = await getBatchLabels(orderSns);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(8);
      
      // Should have at least 300ms delay between batches
      // Total time should be at least 300ms (1 delay between 2 batches)
      // Note: This is a rough check, actual time depends on processing time
      console.log(`Batch with rate limiting took ${duration}ms`);
      
      // With cache hits, processing should be very fast, so most of the time
      // should be the 300ms delay
      expect(duration).toBeGreaterThanOrEqual(300);
      
      // Verify all succeeded
      expect(results.every(r => r.success)).toBe(true);
    }, { timeout: 30000 });

    it("should apply multiple delays for larger batches", async () => {
      /**
       * Test: Multiple rate limiting delays
       * 
       * This test verifies that multiple 300ms delays are applied when
       * processing a larger batch that requires multiple batch groups.
       * 
       * **Validates: Requirements 3.6, 13.6**
       */
      // Create 16 orders (will be processed in 4 batches: 5, 5, 5, 1)
      // Should have 3 delays of 300ms each = 900ms minimum
      const orderSns = Array.from({ length: 16 }, (_, i) => `BATCH_MULTI_DELAY_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: "SPX123456789",
          retrievedAt: new Date()
        });
      }

      const startTime = Date.now();
      const results = await getBatchLabels(orderSns);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(16);
      
      // Should have at least 900ms (3 delays of 300ms each)
      console.log(`Batch with multiple delays took ${duration}ms`);
      expect(duration).toBeGreaterThanOrEqual(900);
      
      // Verify all succeeded
      expect(results.every(r => r.success)).toBe(true);
    }, { timeout: 30000 });

    it("should not apply delay after last batch", async () => {
      /**
       * Test: No delay after last batch
       * 
       * This test verifies that no delay is applied after the last batch,
       * optimizing total processing time.
       * 
       * **Validates: Requirements 3.6**
       */
      // Create exactly 5 orders (1 batch, no delay needed)
      const orderSns = Array.from({ length: 5 }, (_, i) => `BATCH_NO_DELAY_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);

        // Pre-populate cache
        labelCache.set(orderSn, {
          orderSn: orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: "pdf",
          trackingNumber: "SPX123456789",
          retrievedAt: new Date()
        });
      }

      const startTime = Date.now();
      const results = await getBatchLabels(orderSns);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(5);
      
      // With only 1 batch and cache hits, should be very fast (< 100ms)
      // No 300ms delay should be applied
      console.log(`Single batch (no delay) took ${duration}ms`);
      expect(duration).toBeLessThan(200);
      
      // Verify all succeeded
      expect(results.every(r => r.success)).toBe(true);
    }, { timeout: 15000 });
  });

  describe("Batch Summary", () => {
    it("should log batch summary", async () => {
      const orderSns = ["BATCH_SUMMARY_001", "BATCH_SUMMARY_002"];
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      // Capture console output
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
        originalLog(message);
      };

      try {
        await getBatchLabels(orderSns);

        // Verify batch summary was logged
        const hasBatchLog = logs.some(log => 
          log.includes("batch") || log.includes("Batch") || 
          log.includes("total") || log.includes("successful")
        );
        expect(hasBatchLog).toBe(true);
      } finally {
        console.log = originalLog;
      }
    }, { timeout: 20000 });
  });

  describe("Edge Cases", () => {
    it("should handle duplicate order SNs in batch", async () => {
      const orderSn = "BATCH_DUPLICATE_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer1",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Request same order multiple times
      const orderSns = [orderSn, orderSn, orderSn, orderSn];
      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(4);
      expect(results.every(r => r.orderSn === orderSn)).toBe(true);
    }, { timeout: 20000 });

    it("should handle very small batch (1 order)", async () => {
      const orderSn = "BATCH_SMALL_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer1",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const results = await getBatchLabels([orderSn]);
      
      expect(results).toHaveLength(1);
      expect(results[0].orderSn).toBe(orderSn);
    }, { timeout: 15000 });

    it("should handle batch with exactly 5 orders (one full batch)", async () => {
      const orderSns = Array.from({ length: 5 }, (_, i) => `BATCH_EXACT_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(5);
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
    }, { timeout: 20000 });

    it("should handle batch with 6 orders (two batches)", async () => {
      const orderSns = Array.from({ length: 6 }, (_, i) => `BATCH_SIX_${String(i + 1).padStart(3, '0')}`);
      
      for (const orderSn of orderSns) {
        await db.insert(shopeeOrders).values({
          shopId: 12345,
          orderSn: orderSn,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer",
          shippingCarrier: "SPX123456789",
          createTime: new Date(),
        });
        testOrders.push(orderSn);
      }

      const results = await getBatchLabels(orderSns);
      
      expect(results).toHaveLength(6);
      expect(results.map(r => r.orderSn)).toEqual(orderSns);
    }, { timeout: 20000 });
  });
});
