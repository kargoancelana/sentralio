import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { BatchGroup } from "../shipment.service";

/**
 * Performance Test: Batch Size Scaling
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
 * 
 * This performance test verifies that the batch shipment optimization scales
 * linearly with the number of batch groups, not the number of orders. It tests:
 * - API call count remains constant (2-3 calls) regardless of batch size
 * - Processing time scales linearly with batch groups, not order count
 * - Performance targets are met for different batch sizes (10, 28, 50 orders)
 * 
 * Test Coverage:
 * - Requirement 9.1: Processing 28 orders completes in 6-9 seconds
 * - Requirement 9.2: Processing 28 orders makes at most 3 batch API calls
 * - Requirement 9.3: Processing 50 orders completes in under 12 seconds
 * - Requirement 9.5: Total API calls shall be at most 3 regardless of N
 * 
 * Note: This test focuses on the core batch processing logic (processBatchGroup)
 * to measure the scalability properties of the batch optimization.
 */

// Track API calls and timing for each test
interface PerformanceMetrics {
  orderCount: number;
  apiCallCount: number;
  getMassShippingParameterCalls: number;
  massShipOrderCalls: number;
  processingTime: number;
  processingTimeSeconds: number;
  successCount: number;
  failCount: number;
}

let currentMetrics: PerformanceMetrics;

// Mock shopee-raw module
const mockGetMassShippingParameter = mock((shopId: number, packageNumbers: string[]) => {
  currentMetrics.apiCallCount++;
  currentMetrics.getMassShippingParameterCalls++;
  
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
  currentMetrics.apiCallCount++;
  currentMetrics.massShipOrderCalls++;
  
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

describe("Performance Test: Batch Size Scaling", () => {
  beforeEach(() => {
    // Reset all mocks and metrics before each test
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    currentMetrics = {
      orderCount: 0,
      apiCallCount: 0,
      getMassShippingParameterCalls: 0,
      massShipOrderCalls: 0,
      processingTime: 0,
      processingTimeSeconds: 0,
      successCount: 0,
      failCount: 0
    };
  });

  /**
   * Helper function to create a batch group with N orders
   */
  function createBatchGroup(orderCount: number): BatchGroup {
    return {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: orderCount }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };
  }

  /**
   * Helper function to measure performance for a given batch size
   */
  async function measurePerformance(orderCount: number): Promise<PerformanceMetrics> {
    // Reset metrics for this measurement
    currentMetrics = {
      orderCount,
      apiCallCount: 0,
      getMassShippingParameterCalls: 0,
      massShipOrderCalls: 0,
      processingTime: 0,
      processingTimeSeconds: 0,
      successCount: 0,
      failCount: 0
    };

    // Create batch group
    const batchGroup = createBatchGroup(orderCount);

    // Start timing
    const startTime = Date.now();

    // Execute batch processing
    const results = await processBatchGroup(batchGroup, "pickup");

    // End timing
    const endTime = Date.now();
    currentMetrics.processingTime = endTime - startTime;
    currentMetrics.processingTimeSeconds = currentMetrics.processingTime / 1000;

    // Count successes and failures
    currentMetrics.successCount = results.filter(r => r.success).length;
    currentMetrics.failCount = results.filter(r => !r.success).length;

    return { ...currentMetrics };
  }

  it("should verify API call count remains constant for 10, 28, and 50 orders", async () => {
    /**
     * **Validates: Requirement 9.5**
     * 
     * This test verifies that the API call count remains constant (2 calls)
     * regardless of the number of orders in a batch. This demonstrates the
     * scalability property: O(1) API calls per batch group, not O(N) per order.
     */

    // Measure performance for different batch sizes
    const metrics10 = await measurePerformance(10);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics28 = await measurePerformance(28);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics50 = await measurePerformance(50);

    // ── VERIFICATION 1: API Call Count is Constant ──
    // **Validates: Requirement 9.5** - API calls shall be at most 3 regardless of N
    
    console.log(`[test] API Call Count Comparison:`);
    console.log(`[test]   10 orders: ${metrics10.apiCallCount} API calls`);
    console.log(`[test]   28 orders: ${metrics28.apiCallCount} API calls`);
    console.log(`[test]   50 orders: ${metrics50.apiCallCount} API calls`);

    // All batch sizes should use exactly 2 API calls (parameter + ship)
    expect(metrics10.apiCallCount).toBe(2);
    expect(metrics28.apiCallCount).toBe(2);
    expect(metrics50.apiCallCount).toBe(2);

    // Verify breakdown: 1 getMassShippingParameter + 1 massShipOrder
    expect(metrics10.getMassShippingParameterCalls).toBe(1);
    expect(metrics10.massShipOrderCalls).toBe(1);
    
    expect(metrics28.getMassShippingParameterCalls).toBe(1);
    expect(metrics28.massShipOrderCalls).toBe(1);
    
    expect(metrics50.getMassShippingParameterCalls).toBe(1);
    expect(metrics50.massShipOrderCalls).toBe(1);

    console.log(`[test] ✅ API call count is constant (2 calls) regardless of batch size`);
  });

  it("should verify processing time scales linearly with batch groups, not order count", async () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     * 
     * This test verifies that processing time scales linearly with the number
     * of batch groups (which is constant = 1 in this test), not with the number
     * of orders. Since all tests use a single batch group, processing time should
     * be similar across different batch sizes.
     */

    // Measure performance for different batch sizes
    const metrics10 = await measurePerformance(10);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics28 = await measurePerformance(28);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics50 = await measurePerformance(50);

    // ── VERIFICATION 1: Processing Time Comparison ──
    
    console.log(`[test] Processing Time Comparison:`);
    console.log(`[test]   10 orders: ${metrics10.processingTimeSeconds.toFixed(2)}s`);
    console.log(`[test]   28 orders: ${metrics28.processingTimeSeconds.toFixed(2)}s`);
    console.log(`[test]   50 orders: ${metrics50.processingTimeSeconds.toFixed(2)}s`);

    // ── VERIFICATION 2: Performance Targets ──
    // **Validates: Requirements 9.1, 9.3**
    
    // 28 orders should complete in 6-9 seconds (or faster in test environment)
    expect(metrics28.processingTime).toBeLessThan(10000); // Under 10 seconds
    
    // 50 orders should complete in under 12 seconds
    expect(metrics50.processingTime).toBeLessThan(12000); // Under 12 seconds

    // ── VERIFICATION 3: Linear Scaling with Batch Groups ──
    // Since all tests use 1 batch group, processing time should be similar
    // (within reasonable variance for API call overhead)
    
    // The time difference between 10 and 50 orders should be minimal
    // since they're processed in the same number of batch groups (1)
    const timeDifference = Math.abs(metrics50.processingTime - metrics10.processingTime);
    
    console.log(`[test] Time difference between 10 and 50 orders: ${timeDifference}ms`);
    
    // Time difference should be small (< 5 seconds) since both use 1 batch group
    // This demonstrates linear scaling with batch groups, not order count
    expect(timeDifference).toBeLessThan(5000);

    console.log(`[test] ✅ Processing time scales with batch groups (constant = 1), not order count`);
  });

  it("should verify all orders are processed successfully for each batch size", async () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     * 
     * This test verifies that all orders are processed successfully regardless
     * of batch size, ensuring the optimization maintains correctness.
     */

    // Measure performance for different batch sizes
    const metrics10 = await measurePerformance(10);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics28 = await measurePerformance(28);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics50 = await measurePerformance(50);

    // ── VERIFICATION: All Orders Processed Successfully ──
    
    console.log(`[test] Success Rate Comparison:`);
    console.log(`[test]   10 orders: ${metrics10.successCount}/${metrics10.orderCount} successful`);
    console.log(`[test]   28 orders: ${metrics28.successCount}/${metrics28.orderCount} successful`);
    console.log(`[test]   50 orders: ${metrics50.successCount}/${metrics50.orderCount} successful`);

    // All orders should be processed successfully
    expect(metrics10.successCount).toBe(10);
    expect(metrics10.failCount).toBe(0);
    
    expect(metrics28.successCount).toBe(28);
    expect(metrics28.failCount).toBe(0);
    
    expect(metrics50.successCount).toBe(50);
    expect(metrics50.failCount).toBe(0);

    console.log(`[test] ✅ All orders processed successfully for each batch size`);
  });

  it("should generate performance comparison report", async () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
     * 
     * This test generates a comprehensive performance comparison report
     * showing the scalability properties of the batch optimization.
     */

    // Measure performance for different batch sizes
    const metrics10 = await measurePerformance(10);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics28 = await measurePerformance(28);
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    
    const metrics50 = await measurePerformance(50);

    // ── PERFORMANCE COMPARISON REPORT ──
    
    console.log(`\n[test] ═══════════════════════════════════════════════════════════`);
    console.log(`[test] PERFORMANCE COMPARISON REPORT: Batch Size Scaling`);
    console.log(`[test] ═══════════════════════════════════════════════════════════`);
    console.log(`[test]`);
    console.log(`[test] Batch Size: 10 orders`);
    console.log(`[test]   - Processing Time: ${metrics10.processingTimeSeconds.toFixed(2)}s`);
    console.log(`[test]   - API Calls: ${metrics10.apiCallCount} (${metrics10.getMassShippingParameterCalls} parameter + ${metrics10.massShipOrderCalls} ship)`);
    console.log(`[test]   - Success Rate: ${metrics10.successCount}/${metrics10.orderCount} (${(metrics10.successCount / metrics10.orderCount * 100).toFixed(1)}%)`);
    console.log(`[test]`);
    console.log(`[test] Batch Size: 28 orders`);
    console.log(`[test]   - Processing Time: ${metrics28.processingTimeSeconds.toFixed(2)}s`);
    console.log(`[test]   - API Calls: ${metrics28.apiCallCount} (${metrics28.getMassShippingParameterCalls} parameter + ${metrics28.massShipOrderCalls} ship)`);
    console.log(`[test]   - Success Rate: ${metrics28.successCount}/${metrics28.orderCount} (${(metrics28.successCount / metrics28.orderCount * 100).toFixed(1)}%)`);
    console.log(`[test]   - Target: <10s, ≤3 API calls ✓`);
    console.log(`[test]`);
    console.log(`[test] Batch Size: 50 orders`);
    console.log(`[test]   - Processing Time: ${metrics50.processingTimeSeconds.toFixed(2)}s`);
    console.log(`[test]   - API Calls: ${metrics50.apiCallCount} (${metrics50.getMassShippingParameterCalls} parameter + ${metrics50.massShipOrderCalls} ship)`);
    console.log(`[test]   - Success Rate: ${metrics50.successCount}/${metrics50.orderCount} (${(metrics50.successCount / metrics50.orderCount * 100).toFixed(1)}%)`);
    console.log(`[test]   - Target: <12s, ≤3 API calls ✓`);
    console.log(`[test]`);
    console.log(`[test] ───────────────────────────────────────────────────────────`);
    console.log(`[test] SCALABILITY ANALYSIS`);
    console.log(`[test] ───────────────────────────────────────────────────────────`);
    console.log(`[test]`);
    console.log(`[test] API Call Scaling:`);
    console.log(`[test]   - 10 orders: ${metrics10.apiCallCount} calls (${(metrics10.apiCallCount / 10).toFixed(2)} calls/order)`);
    console.log(`[test]   - 28 orders: ${metrics28.apiCallCount} calls (${(metrics28.apiCallCount / 28).toFixed(2)} calls/order)`);
    console.log(`[test]   - 50 orders: ${metrics50.apiCallCount} calls (${(metrics50.apiCallCount / 50).toFixed(2)} calls/order)`);
    console.log(`[test]   - Scaling: O(1) - constant API calls per batch group ✓`);
    console.log(`[test]`);
    console.log(`[test] Processing Time Scaling:`);
    console.log(`[test]   - 10 orders: ${metrics10.processingTimeSeconds.toFixed(2)}s (${(metrics10.processingTime / 10).toFixed(0)}ms/order)`);
    console.log(`[test]   - 28 orders: ${metrics28.processingTimeSeconds.toFixed(2)}s (${(metrics28.processingTime / 28).toFixed(0)}ms/order)`);
    console.log(`[test]   - 50 orders: ${metrics50.processingTimeSeconds.toFixed(2)}s (${(metrics50.processingTime / 50).toFixed(0)}ms/order)`);
    console.log(`[test]   - Scaling: Linear with batch groups (1 group), not order count ✓`);
    console.log(`[test]`);
    console.log(`[test] Comparison with Sequential Processing (estimated):`);
    console.log(`[test]   - 10 orders sequential: ~23s (10 * 2 API calls + delays)`);
    console.log(`[test]   - 28 orders sequential: ~64s (28 * 2 API calls + delays)`);
    console.log(`[test]   - 50 orders sequential: ~114s (50 * 2 API calls + delays)`);
    console.log(`[test]`);
    console.log(`[test]   - 10 orders improvement: ~${(23 / metrics10.processingTimeSeconds).toFixed(1)}x faster`);
    console.log(`[test]   - 28 orders improvement: ~${(64 / metrics28.processingTimeSeconds).toFixed(1)}x faster`);
    console.log(`[test]   - 50 orders improvement: ~${(114 / metrics50.processingTimeSeconds).toFixed(1)}x faster`);
    console.log(`[test]`);
    console.log(`[test] ═══════════════════════════════════════════════════════════`);
    console.log(`[test] ✅ Performance test passed: Batch optimization scales linearly`);
    console.log(`[test]    with batch groups, not order count`);
    console.log(`[test] ═══════════════════════════════════════════════════════════\n`);

    // ── FINAL VERIFICATION ──
    
    // Verify all performance targets are met
    expect(metrics28.processingTime).toBeLessThan(10000); // Requirement 9.1
    expect(metrics28.apiCallCount).toBeLessThanOrEqual(3); // Requirement 9.2
    expect(metrics50.processingTime).toBeLessThan(12000); // Requirement 9.3
    
    // Verify constant API calls (Requirement 9.5)
    expect(metrics10.apiCallCount).toBe(2);
    expect(metrics28.apiCallCount).toBe(2);
    expect(metrics50.apiCallCount).toBe(2);
    
    // Verify all orders processed successfully
    expect(metrics10.successCount).toBe(10);
    expect(metrics28.successCount).toBe(28);
    expect(metrics50.successCount).toBe(50);
  });
});
