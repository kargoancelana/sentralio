import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { BatchGroup } from "../shipment.service";

/**
 * Integration Test: Batch Processing with Same Logistics Configuration
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3**
 * 
 * This integration test verifies the batch shipment optimization for orders
 * with the same logistics configuration. It tests:
 * - Performance target: completion time under 10 seconds
 * - API efficiency: 2 batch API calls (1 parameter, 1 ship) per batch group
 * - Batch grouping: orders with same logistics config processed together
 * - Processing flow: parameter retrieval → shipment
 * 
 * Test Coverage:
 * - Requirement 9.1: Processing 28 orders completes in 6-9 seconds
 * - Requirement 9.2: Processing 28 orders makes at most 3 batch API calls
 * - Requirement 9.3: Processing 50 orders completes in under 12 seconds
 * 
 * Note: This test focuses on the core batch processing logic (processBatchGroup)
 * which is the heart of the optimization. It bypasses the validation layer
 * to focus on testing the batch API call patterns and performance.
 */

// Track API calls for verification
let apiCallCount = 0;
let getMassShippingParameterCalls = 0;
let massShipOrderCalls = 0;

// Mock shopee-raw module
const mockGetMassShippingParameter = mock((shopId: number, packageNumbers: string[]) => {
  apiCallCount++;
  getMassShippingParameterCalls++;
  
  return Promise.resolve({
    response: {
      pickup: {
        address_list: [{
          address_id: 123,
          region: "Jakarta",
          city: "Jakarta Selatan",
          address: "Jl. Test No. 123",
          time_slot_list: [{
            pickup_time_id: "slot_123",
            date: "2024-01-15",
            time_text: "09:00-12:00",
            flags: ["recommended"]
          }]
        }]
      }
    }
  });
});

const mockMassShipOrder = mock((shopId: number, packages: any[]) => {
  apiCallCount++;
  massShipOrderCalls++;
  
  // All orders succeed
  return Promise.resolve({
    response: {
      success_list: packages.map(pkg => ({ package_number: pkg.package_number })),
      fail_list: []
    }
  });
});

// Mock database client
const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{
          id: 1,
          shopId: 12345,
          orderSn: "MOCK_ORDER",
          orderStatus: "READY_TO_SHIP",
          totalAmount: 100000,
          buyerUsername: "buyer1",
          shippingCarrier: null,
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date()
        }])
      })
    })
  }),
  update: () => ({
    set: () => ({
      where: () => Promise.resolve()
    })
  })
};

// Setup module mocks
mock.module("../db/client", () => ({
  db: mockDb
}));

mock.module("../shopee-raw", () => ({
  getMassShippingParameter: mockGetMassShippingParameter,
  massShipOrder: mockMassShipOrder,
  getShopeeOrderDetails: mock(),
  shipShopeeOrder: mock()
}));

mock.module("../shopee-auth", () => ({
  getValidToken: mock(() => Promise.resolve({
    accessToken: "mock_token",
    shopId: 12345
  }))
}));

mock.module("../shopee-label", () => ({
  getTrackingNumber: mock(),
  getShippingParameter: mock(),
  getMassTrackingNumber: mock()
}));

// Import after mocks are set up
import { processBatchGroup } from "../shipment.service";

describe("Integration Test: Batch Processing with Same Logistics Config", () => {
  beforeEach(() => {
    // Reset all mocks and counters before each test
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    apiCallCount = 0;
    getMassShippingParameterCalls = 0;
    massShipOrderCalls = 0;
  });

  it("should process 28 orders with same logistics config efficiently with 2 API calls", async () => {
    /**
     * **Validates: Requirements 9.1, 9.2**
     * 
     * This test verifies the batch processing logic for 28 orders:
     * 1. API efficiency: 2 batch API calls (1 parameter, 1 ship) for the batch group
     * 2. Performance: completes quickly (under 10 seconds)
     * 3. All orders processed successfully
     * 
     * Note: This test focuses on the core batch processing logic (processBatchGroup)
     * which handles parameter retrieval and shipment. The full flow including
     * tracking number retrieval is tested in the complete shipBatchOrders function.
     */
    
    // Create a batch group with 28 orders (same logistics config)
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 28 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Start timing
    const startTime = Date.now();

    // Execute batch processing
    const results = await processBatchGroup(batchGroup, "pickup");

    // End timing
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const processingTimeSeconds = processingTime / 1000;

    // ── VERIFICATION 1: Performance Target ──
    // **Validates: Requirement 9.1** - Complete quickly (under 10 seconds)
    console.log(`[test] Processing time: ${processingTimeSeconds.toFixed(2)}s`);
    expect(processingTime).toBeLessThan(10000); // Under 10 seconds
    
    // ── VERIFICATION 2: API Call Efficiency ──
    // **Validates: Requirement 9.2** - 2 batch API calls (parameter + ship)
    console.log(`[test] Total API calls: ${apiCallCount}`);
    console.log(`[test] getMassShippingParameter calls: ${getMassShippingParameterCalls}`);
    console.log(`[test] massShipOrder calls: ${massShipOrderCalls}`);
    
    expect(getMassShippingParameterCalls).toBe(1); // 1 parameter call
    expect(massShipOrderCalls).toBe(1); // 1 ship call
    expect(apiCallCount).toBe(2); // Total: 2 API calls for batch processing
    
    // ── VERIFICATION 3: All Orders Processed Successfully ──
    expect(results).toHaveLength(28);
    
    const successfulOrders = results.filter(r => r.success);
    const failedOrders = results.filter(r => !r.success);
    
    console.log(`[test] Successful orders: ${successfulOrders.length}`);
    console.log(`[test] Failed orders: ${failedOrders.length}`);
    
    expect(successfulOrders).toHaveLength(28);
    expect(failedOrders).toHaveLength(0);
    
    // Verify each result has the expected structure
    results.forEach((result, index) => {
      expect(result.success).toBe(true);
      expect(result.orderSn).toBe(`ORDER${String(index + 1).padStart(3, '0')}`);
      expect(result.message).toContain("Pengiriman berhasil diatur");
    });
    
    // ── VERIFICATION 4: Batch Grouping ──
    // Verify getMassShippingParameter was called with all 28 package numbers
    expect(mockGetMassShippingParameter).toHaveBeenCalledTimes(1);
    const paramCall = mockGetMassShippingParameter.mock.calls[0];
    expect(paramCall[0]).toBe(12345); // shopId
    expect(paramCall[1]).toHaveLength(28); // 28 package numbers
    expect(paramCall[2]).toBe(50001); // logisticsChannelId
    expect(paramCall[3]).toBe("LOC001"); // productLocationId
    
    // Verify massShipOrder was called with all 28 packages
    expect(mockMassShipOrder).toHaveBeenCalledTimes(1);
    const shipCall = mockMassShipOrder.mock.calls[0];
    expect(shipCall[0]).toBe(12345); // shopId
    expect(shipCall[1]).toHaveLength(28); // 28 packages
    expect(shipCall[2]).toBe(50001); // logisticsChannelId
    expect(shipCall[3]).toBe("LOC001"); // productLocationId
    
    // ── SUMMARY ──
    console.log(`[test] ✅ Integration test passed:`);
    console.log(`[test]    - Processing time: ${processingTimeSeconds.toFixed(2)}s (target: <10s)`);
    console.log(`[test]    - API calls: ${apiCallCount} (batch processing: parameter + ship)`);
    console.log(`[test]    - Successful orders: ${successfulOrders.length}/28`);
  });

  it("should handle 50 orders with same logistics config efficiently", async () => {
    /**
     * **Validates: Requirement 9.3**
     * 
     * This test verifies that the batch processing can handle the maximum
     * batch size (50 orders) efficiently with 2 API calls.
     */
    
    // Create a batch group with 50 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 50 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Start timing
    const startTime = Date.now();

    // Execute batch processing
    const results = await processBatchGroup(batchGroup, "pickup");

    // End timing
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const processingTimeSeconds = processingTime / 1000;

    // ── VERIFICATION 1: Performance Target ──
    // **Validates: Requirement 9.3** - Complete in under 12 seconds
    console.log(`[test] Processing time for 50 orders: ${processingTimeSeconds.toFixed(2)}s`);
    expect(processingTime).toBeLessThan(12000); // Under 12 seconds
    
    // ── VERIFICATION 2: API Call Efficiency ──
    // Should still be 2 API calls (1 parameter, 1 ship)
    console.log(`[test] Total API calls for 50 orders: ${apiCallCount}`);
    expect(apiCallCount).toBe(2);
    
    // ── VERIFICATION 3: All Orders Processed Successfully ──
    expect(results).toHaveLength(50);
    
    const successfulOrders = results.filter(r => r.success);
    console.log(`[test] Successful orders: ${successfulOrders.length}/50`);
    
    expect(successfulOrders).toHaveLength(50);
    
    // ── SUMMARY ──
    console.log(`[test] ✅ 50-order integration test passed:`);
    console.log(`[test]    - Processing time: ${processingTimeSeconds.toFixed(2)}s (target: <12s)`);
    console.log(`[test]    - API calls: ${apiCallCount}`);
    console.log(`[test]    - Successful orders: ${successfulOrders.length}/50`);
  });

  it("should verify batch grouping with same logistics configuration", async () => {
    /**
     * **Validates: Requirements 9.1, 9.2**
     * 
     * This test verifies that orders with the same logistics configuration
     * are correctly processed in a single batch, resulting in optimal API usage.
     */
    
    // Create a batch group with 28 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 28 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Execute batch processing
    await processBatchGroup(batchGroup, "pickup");

    // ── VERIFICATION: Single Batch Processing ──
    // All orders should be processed in one batch
    
    // Verify getMassShippingParameter was called once with all orders
    expect(mockGetMassShippingParameter).toHaveBeenCalledTimes(1);
    const paramCall = mockGetMassShippingParameter.mock.calls[0];
    expect(paramCall[1]).toHaveLength(28); // All 28 package numbers in one call
    
    // Verify all orders have the same logistics configuration
    const logisticsChannelId = paramCall[2];
    const productLocationId = paramCall[3];
    
    expect(logisticsChannelId).toBe(50001); // Same for all
    expect(productLocationId).toBe("LOC001"); // Same for all
    
    // Verify massShipOrder was called once with all orders
    expect(mockMassShipOrder).toHaveBeenCalledTimes(1);
    const shipCall = mockMassShipOrder.mock.calls[0];
    expect(shipCall[1]).toHaveLength(28); // All 28 packages in one call
    
    // Verify all packages have the same logistics configuration
    const packages = shipCall[1];
    packages.forEach((pkg: any) => {
      expect(pkg.package_number).toBeDefined();
      expect(pkg.pickup).toBeDefined(); // pickup method
      expect(pkg.pickup.address_id).toBe(123);
      expect(pkg.pickup.pickup_time_id).toBe("slot_123");
    });
    
    console.log(`[test] ✅ Batch grouping verified:`);
    console.log(`[test]    - Single batch group created for 28 orders`);
    console.log(`[test]    - Logistics channel ID: ${logisticsChannelId}`);
    console.log(`[test]    - Product location ID: ${productLocationId}`);
  });

  it("should verify performance improvement over sequential processing", async () => {
    /**
     * **Validates: Requirements 9.1, 9.2**
     * 
     * This test verifies that batch processing provides significant performance
     * improvement over sequential processing by comparing API call counts.
     */
    
    // Create a batch group with 28 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 28 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Execute batch processing
    const startTime = Date.now();
    const results = await processBatchGroup(batchGroup, "pickup");
    const endTime = Date.now();
    
    const batchProcessingTime = endTime - startTime;
    const batchApiCalls = apiCallCount;

    // ── COMPARISON WITH SEQUENTIAL PROCESSING ──
    
    // Sequential processing would make:
    // - 28 individual get_shipping_parameter calls
    // - 28 individual ship_order calls
    // Total: 56 API calls (for parameter + ship only, excluding tracking)
    const sequentialApiCalls = 28 * 2;
    
    // Sequential processing time estimate:
    // - Average API call time: ~1 second
    // - Rate limiting delay: 300ms between orders
    // - Total: (28 * 1000ms * 2 calls) + (27 * 300ms delays) = 56000ms + 8100ms = 64100ms
    const estimatedSequentialTime = (28 * 1000 * 2) + (27 * 300);

    // ── VERIFICATION: Performance Improvement ──
    
    console.log(`[test] Performance comparison:`);
    console.log(`[test]    Batch processing:`);
    console.log(`[test]      - Time: ${(batchProcessingTime / 1000).toFixed(2)}s`);
    console.log(`[test]      - API calls: ${batchApiCalls}`);
    console.log(`[test]    Sequential processing (estimated):`);
    console.log(`[test]      - Time: ${(estimatedSequentialTime / 1000).toFixed(2)}s`);
    console.log(`[test]      - API calls: ${sequentialApiCalls}`);
    console.log(`[test]    Improvement:`);
    console.log(`[test]      - API calls: ${(sequentialApiCalls / batchApiCalls).toFixed(1)}x fewer`);
    
    // Verify batch processing uses significantly fewer API calls
    expect(batchApiCalls).toBe(2); // Only 2 API calls for batch
    expect(batchApiCalls).toBeLessThan(sequentialApiCalls / 19); // At least 19x fewer API calls (56/2 = 28x)
    
    // Verify all orders were processed successfully
    expect(results.filter(r => r.success)).toHaveLength(28);
    
    console.log(`[test] ✅ Performance improvement verified:`);
    console.log(`[test]    - Batch processing uses ${(sequentialApiCalls / batchApiCalls).toFixed(1)}x fewer API calls`);
  });
});
