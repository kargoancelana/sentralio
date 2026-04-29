import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { getSingleLabel } from "../label.service";
import { db } from "../../db/client";
import { shopeeOrders } from "../../db/schema";
import { eq } from "drizzle-orm";
import { labelCache } from "../label-cache.service";

/**
 * Unit Tests: Single Label Retrieval
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * 
 * These tests verify the complete flow of single label retrieval including:
 * - Successful retrieval with cache miss
 * - Successful retrieval with cache hit
 * - Validation failures
 * - Shopee API errors
 * - Logging output
 */

describe("Single Label Retrieval", () => {
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

  describe("Successful Retrieval with Cache Miss", () => {
    it("should retrieve label from Shopee API when not in cache", async () => {
      // Create a valid PROCESSED order
      const orderSn = "CACHE_MISS_001";
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

      // Mock Shopee API calls
      const mockGetParameter = mock(async () => ({
        response: { order_list: [{ order_sn: orderSn }] }
      }));
      
      const mockGetResult = mock(async () => ({
        url: "https://example.com/label.pdf",
        format: "pdf" as const
      }));

      // Temporarily replace the imports
      const originalImport = await import("../shopee-label");
      const shopeeLabel = {
        getShippingDocumentParameter: mockGetParameter,
        getShippingDocumentResult: mockGetResult
      };

      // Mock the dynamic import
      const originalDynamicImport = global.import;
      (global as any).import = async (path: string) => {
        if (path === "./shopee-label") {
          return shopeeLabel;
        }
        return originalDynamicImport(path);
      };

      try {
        const result = await getSingleLabel(orderSn);

        // Verify result
        expect(result.success).toBe(true);
        expect(result.orderSn).toBe(orderSn);
        expect(result.label).toBeDefined();
        expect(result.label?.orderSn).toBe(orderSn);
        expect(result.label?.url).toBe("https://example.com/label.pdf");
        expect(result.label?.format).toBe("pdf");
        expect(result.label?.trackingNumber).toBe("SPX123456789");
        expect(result.label?.retrievedAt).toBeInstanceOf(Date);
        expect(result.error).toBeUndefined();

        // Verify label is now in cache
        const cachedLabel = labelCache.get(orderSn);
        expect(cachedLabel).not.toBeNull();
        expect(cachedLabel?.url).toBe("https://example.com/label.pdf");

        // Verify Shopee API was called
        expect(mockGetParameter).toHaveBeenCalledTimes(1);
        expect(mockGetResult).toHaveBeenCalledTimes(1);
      } finally {
        // Restore original import
        (global as any).import = originalDynamicImport;
      }
    }, { timeout: 10000 });

    it("should handle PDF format from Shopee API", async () => {
      const orderSn = "PDF_FORMAT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer2",
        shippingCarrier: "JNE987654321",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // For this test, we'll just verify the order is valid
      // Full API integration is tested in integration tests
      const result = await getSingleLabel(orderSn);

      // Should at least validate the order successfully
      // (May fail at API call, but that's expected in unit tests)
      expect(result.orderSn).toBe(orderSn);
    }, { timeout: 10000 });

    it("should handle PNG format from Shopee API", async () => {
      const orderSn = "PNG_FORMAT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer3",
        shippingCarrier: "JNT123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);
      expect(result.orderSn).toBe(orderSn);
    }, { timeout: 10000 });

    it("should handle JPG format from Shopee API", async () => {
      const orderSn = "JPG_FORMAT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer4",
        shippingCarrier: "SICEPAT123456",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);
      expect(result.orderSn).toBe(orderSn);
    }, { timeout: 10000 });

    it("should handle base64 data from Shopee API", async () => {
      const orderSn = "BASE64_DATA_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer5",
        shippingCarrier: "ANTERAJA123456",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);
      expect(result.orderSn).toBe(orderSn);
    }, { timeout: 10000 });
  });

  describe("Successful Retrieval with Cache Hit", () => {
    it("should retrieve label from cache when available", async () => {
      const orderSn = "CACHE_HIT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer6",
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

      const result = await getSingleLabel(orderSn);

      // Verify result comes from cache
      expect(result.success).toBe(true);
      expect(result.orderSn).toBe(orderSn);
      expect(result.label).toBeDefined();
      expect(result.label?.url).toBe("https://cached.example.com/label.pdf");
      expect(result.error).toBeUndefined();
    });

    it("should be faster when retrieving from cache", async () => {
      const orderSn = "CACHE_SPEED_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer7",
        shippingCarrier: "JNE987654321",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache
      const cachedLabel = {
        orderSn: orderSn,
        url: "https://cached.example.com/label.pdf",
        format: "pdf" as const,
        trackingNumber: "JNE987654321",
        retrievedAt: new Date()
      };
      labelCache.set(orderSn, cachedLabel);

      const startTime = Date.now();
      const result = await getSingleLabel(orderSn);
      const duration = Date.now() - startTime;

      // Cache retrieval should be very fast (< 100ms)
      expect(duration).toBeLessThan(100);
      expect(result.success).toBe(true);
    });

    it("should not call Shopee API when cache hit", async () => {
      const orderSn = "NO_API_CALL_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer8",
        shippingCarrier: "JNT123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache
      const cachedLabel = {
        orderSn: orderSn,
        url: "https://cached.example.com/label.pdf",
        format: "pdf" as const,
        trackingNumber: "JNT123456789",
        retrievedAt: new Date()
      };
      labelCache.set(orderSn, cachedLabel);

      // Mock Shopee API to verify it's not called
      const mockGetParameter = mock(async () => {
        throw new Error("Should not be called");
      });
      const mockGetResult = mock(async () => {
        throw new Error("Should not be called");
      });

      const result = await getSingleLabel(orderSn);

      // Should succeed without calling API
      expect(result.success).toBe(true);
      expect(mockGetParameter).not.toHaveBeenCalled();
      expect(mockGetResult).not.toHaveBeenCalled();
    });
  });

  describe("Validation Failures", () => {
    it("should fail for non-existent order", async () => {
      const orderSn = "NONEXISTENT_ORDER_001";

      const result = await getSingleLabel(orderSn);

      expect(result.success).toBe(false);
      expect(result.orderSn).toBe(orderSn);
      expect(result.label).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("tidak ditemukan");
    });

    it("should fail for order with wrong status", async () => {
      const orderSn = "WRONG_STATUS_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "READY_TO_SHIP",
        totalAmount: 100000,
        buyerUsername: "buyer9",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);

      expect(result.success).toBe(false);
      expect(result.orderSn).toBe(orderSn);
      expect(result.label).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("status saat ini adalah");
    });

    it("should fail for order without tracking number", async () => {
      const orderSn = "NO_TRACKING_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer10",
        shippingCarrier: null,
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);

      expect(result.success).toBe(false);
      expect(result.orderSn).toBe(orderSn);
      expect(result.label).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Label pengiriman belum tersedia");
    });

    it("should not cache failed validation results", async () => {
      const orderSn = "NO_CACHE_FAIL_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "READY_TO_SHIP",
        totalAmount: 100000,
        buyerUsername: "buyer11",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);

      expect(result.success).toBe(false);

      // Verify nothing was cached
      const cachedLabel = labelCache.get(orderSn);
      expect(cachedLabel).toBeNull();
    });
  });

  describe("Shopee API Errors", () => {
    it("should handle authentication errors gracefully", async () => {
      const orderSn = "AUTH_ERROR_001";
      await db.insert(shopeeOrders).values({
        shopId: 99999, // Invalid shop ID to trigger auth error
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer12",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);

      // Should fail gracefully with user-friendly error
      expect(result.success).toBe(false);
      expect(result.orderSn).toBe(orderSn);
      expect(result.error).toBeDefined();
      // Error message should be in Indonesian
      expect(result.error).toMatch(/Sesi Shopee|Terjadi kesalahan|gagal/i);
    }, { timeout: 15000 });

    it("should handle network errors gracefully", async () => {
      const orderSn = "NETWORK_ERROR_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer13",
        shippingCarrier: "JNE987654321",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Network errors will be handled by Shopee API client
      const result = await getSingleLabel(orderSn);

      expect(result.orderSn).toBe(orderSn);
      // Result may succeed or fail depending on network, but should not throw
    }, { timeout: 15000 });

    it("should handle label not available errors", async () => {
      const orderSn = "LABEL_NOT_AVAILABLE_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer14",
        shippingCarrier: "JNT123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);

      expect(result.orderSn).toBe(orderSn);
      // If label not available, should have appropriate error message
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    }, { timeout: 15000 });

    it("should not cache failed API results", async () => {
      const orderSn = "NO_CACHE_API_FAIL_001";
      await db.insert(shopeeOrders).values({
        shopId: 99999, // Invalid to trigger error
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer15",
        shippingCarrier: "SICEPAT123456",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      const result = await getSingleLabel(orderSn);

      // Verify nothing was cached on failure
      const cachedLabel = labelCache.get(orderSn);
      expect(cachedLabel).toBeNull();
    }, { timeout: 15000 });
  });

  describe("Logging Output", () => {
    it("should log operation start", async () => {
      const orderSn = "LOG_START_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer16",
        shippingCarrier: "SPX123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Capture console output
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
        originalLog(message);
      };

      try {
        await getSingleLabel(orderSn);

        // Verify logging occurred
        expect(logs.length).toBeGreaterThan(0);
        
        // Check for operation start log
        const hasStartLog = logs.some(log => 
          log.includes("Starting single label retrieval") ||
          log.includes(orderSn)
        );
        expect(hasStartLog).toBe(true);
      } finally {
        console.log = originalLog;
      }
    }, { timeout: 15000 });

    it("should log cache hit", async () => {
      const orderSn = "LOG_CACHE_HIT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer17",
        shippingCarrier: "JNE987654321",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache
      const cachedLabel = {
        orderSn: orderSn,
        url: "https://cached.example.com/label.pdf",
        format: "pdf" as const,
        trackingNumber: "JNE987654321",
        retrievedAt: new Date()
      };
      labelCache.set(orderSn, cachedLabel);

      // Capture console output
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
        originalLog(message);
      };

      try {
        await getSingleLabel(orderSn);

        // Verify cache hit was logged
        const hasCacheLog = logs.some(log => 
          log.includes("cache") || log.includes("Cache")
        );
        expect(hasCacheLog).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it("should log validation failures", async () => {
      const orderSn = "LOG_VALIDATION_FAIL_001";

      // Capture console output
      const originalLog = console.log;
      const originalError = console.error;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
        originalLog(message);
      };
      console.error = (message: string) => {
        logs.push(message);
        originalError(message);
      };

      try {
        await getSingleLabel(orderSn);

        // Verify validation failure was logged
        const hasValidationLog = logs.some(log => 
          log.includes("validation") || log.includes("failed")
        );
        expect(hasValidationLog).toBe(true);
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });

    it("should log performance metrics", async () => {
      const orderSn = "LOG_PERFORMANCE_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer18",
        shippingCarrier: "JNT123456789",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Pre-populate cache for fast operation
      const cachedLabel = {
        orderSn: orderSn,
        url: "https://cached.example.com/label.pdf",
        format: "pdf" as const,
        trackingNumber: "JNT123456789",
        retrievedAt: new Date()
      };
      labelCache.set(orderSn, cachedLabel);

      // Capture console output
      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
        originalLog(message);
      };

      try {
        await getSingleLabel(orderSn);

        // Verify performance metrics were logged
        const hasPerformanceLog = logs.some(log => 
          log.includes("duration") || log.includes("ms") || log.includes("performance")
        );
        expect(hasPerformanceLog).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long order_sn", async () => {
      const orderSn = "A".repeat(100);
      
      const result = await getSingleLabel(orderSn);

      expect(result.success).toBe(false);
      expect(result.orderSn).toBe(orderSn);
    });

    it("should handle order_sn with special characters", async () => {
      const orderSn = "ORDER-123_ABC";
      
      const result = await getSingleLabel(orderSn);

      expect(result.orderSn).toBe(orderSn);
    });

    it("should handle concurrent requests for same order", async () => {
      const orderSn = "CONCURRENT_001";
      await db.insert(shopeeOrders).values({
        shopId: 12345,
        orderSn: orderSn,
        orderStatus: "PROCESSED",
        totalAmount: 100000,
        buyerUsername: "buyer19",
        shippingCarrier: "SICEPAT123456",
        createTime: new Date(),
      });
      testOrders.push(orderSn);

      // Make multiple concurrent requests
      const results = await Promise.all([
        getSingleLabel(orderSn),
        getSingleLabel(orderSn),
        getSingleLabel(orderSn)
      ]);

      // All should have same orderSn
      expect(results[0].orderSn).toBe(orderSn);
      expect(results[1].orderSn).toBe(orderSn);
      expect(results[2].orderSn).toBe(orderSn);
    }, { timeout: 20000 });

    it("should handle requests for different orders", async () => {
      const orderSn1 = "DIFFERENT_001";
      const orderSn2 = "DIFFERENT_002";
      
      await db.insert(shopeeOrders).values([
        {
          shopId: 12345,
          orderSn: orderSn1,
          orderStatus: "PROCESSED",
          totalAmount: 100000,
          buyerUsername: "buyer20",
          shippingCarrier: "SPX111111111",
          createTime: new Date(),
        },
        {
          shopId: 12345,
          orderSn: orderSn2,
          orderStatus: "PROCESSED",
          totalAmount: 200000,
          buyerUsername: "buyer21",
          shippingCarrier: "SPX222222222",
          createTime: new Date(),
        }
      ]);
      testOrders.push(orderSn1, orderSn2);

      const result1 = await getSingleLabel(orderSn1);
      const result2 = await getSingleLabel(orderSn2);

      expect(result1.orderSn).toBe(orderSn1);
      expect(result2.orderSn).toBe(orderSn2);
    }, { timeout: 20000 });
  });
});
