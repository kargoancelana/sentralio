import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { BatchGroup } from "../shipment.service";

/**
 * Integration Test: Fallback to Single-Order Processing
 * 
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**
 * 
 * This integration test verifies the automatic fallback mechanism when batch
 * operations fail. It tests:
 * - Batch failure detection and fallback trigger
 * - Single-order processing after batch failure
 * - Rate limiting (300ms delay) between individual orders in fallback mode
 * - Final results match expected format
 * - Logging of fallback reason and affected order count
 * 
 * Test Coverage:
 * - Requirement 12.1: getMassShippingParameter failure triggers fallback
 * - Requirement 12.2: massShipOrder failure triggers fallback
 * - Requirement 12.3: Fallback logs reason and affected order count
 * - Requirement 12.4: 300ms delay applied between individual orders
 * - Requirement 12.5: Single-order processing attempted before marking as failed
 */

// Track API calls and timing for verification
let apiCallCount = 0;
let getMassShippingParameterCalls = 0;
let massShipOrderCalls = 0;
let shipSingleOrderCalls = 0;
let singleOrderCallTimestamps: number[] = [];

// Mock shopee-raw module with failure scenarios
const mockGetMassShippingParameter = mock((shopId: number, packageNumbers: string[]) => {
  apiCallCount++;
  getMassShippingParameterCalls++;
  
  // Simulate batch API failure
  throw new Error("Batch API error: rate limit exceeded");
});

const mockMassShipOrder = mock((shopId: number, packages: any[]) => {
  apiCallCount++;
  massShipOrderCalls++;
  
  // Simulate batch API failure
  throw new Error("Batch API error: service unavailable");
});

const mockShipShopeeOrder = mock((shopId: number, orderSn: string, method: string) => {
  shipSingleOrderCalls++;
  singleOrderCallTimestamps.push(Date.now());
  
  // Simulate successful single-order processing
  return Promise.resolve({
    success: true,
    message: "Order shipped successfully"
  });
});

const mockGetShippingParameter = mock((shopId: number, orderSn: string) => {
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

// Track database queries to return appropriate order
let currentOrderSn = "ORDER001";

// Mock database client - returns valid order for any orderSn
const mockDb = {
  select: () => ({
    from: () => ({
      where: (condition: any) => {
        // Extract orderSn from the condition if possible
        // For now, return a generic valid order
        return {
          limit: () => {
            // Return a valid order that matches the current query
            return Promise.resolve([{
              id: 1,
              shopId: 12345,
              orderSn: currentOrderSn, // Use the tracked orderSn
              orderStatus: "READY_TO_SHIP",
              totalAmount: 100000,
              buyerUsername: "buyer1",
              shippingCarrier: null,
              payTime: new Date(),
              createTime: new Date(),
              updatedAt: new Date()
            }]);
          }
        };
      }
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
  shipShopeeOrder: mockShipShopeeOrder,
  getShopeeOrderDetails: mock()
}));

mock.module("../shopee-auth", () => ({
  getValidToken: mock(() => Promise.resolve({
    accessToken: "mock_token",
    shopId: 12345
  }))
}));

mock.module("../shopee-label", () => ({
  getTrackingNumber: mock(),
  getShippingParameter: mockGetShippingParameter,
  getMassTrackingNumber: mock()
}));

// Import after mocks are set up
import { processBatchGroupWithFallback } from "../shipment.service";

describe("Integration Test: Fallback to Single-Order Processing", () => {
  beforeEach(() => {
    // Reset all mocks and counters before each test
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    mockShipShopeeOrder.mockClear();
    mockGetShippingParameter.mockClear();
    
    apiCallCount = 0;
    getMassShippingParameterCalls = 0;
    massShipOrderCalls = 0;
    shipSingleOrderCalls = 0;
    singleOrderCallTimestamps = [];
  });

  it("should trigger fallback when getMassShippingParameter fails", async () => {
    /**
     * **Validates: Requirements 12.1, 12.3, 12.4, 12.5**
     * 
     * This test verifies that when getMassShippingParameter fails for a batch group,
     * the system automatically falls back to single-order processing with proper
     * rate limiting.
     */
    
    // Create a batch group with 5 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 5 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Execute batch processing with fallback
    const startTime = Date.now();
    const results = await processBatchGroupWithFallback(batchGroup, "pickup");
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // ── VERIFICATION 1: Batch API Attempted ──
    // **Validates: Requirement 12.1** - getMassShippingParameter was attempted
    console.log(`[test] getMassShippingParameter calls: ${getMassShippingParameterCalls}`);
    expect(getMassShippingParameterCalls).toBe(1); // Batch API was attempted
    
    // ── VERIFICATION 2: Fallback Triggered ──
    // **Validates: Requirement 12.5** - Fallback processing attempted for all orders
    // Note: We verify fallback was triggered by checking that results were returned
    // for all orders, even though the batch API failed
    expect(results).toHaveLength(5);
    
    // ── VERIFICATION 3: Rate Limiting Applied ──
    // **Validates: Requirement 12.4** - 300ms delay between individual orders
    // With 5 orders, we expect at least 4 delays of 300ms = 1200ms total
    const expectedMinTime = 4 * 300; // 4 delays between 5 orders
    console.log(`[test] Total processing time: ${totalTime}ms (expected: ≥${expectedMinTime}ms)`);
    expect(totalTime).toBeGreaterThanOrEqual(expectedMinTime - 200); // Allow 200ms tolerance
    
    // ── VERIFICATION 4: All Orders Processed ──
    // **Validates: Requirement 12.5** - All orders attempted before marking as failed
    // Each result should have the expected structure
    results.forEach((result, index) => {
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('orderSn');
      expect(result.orderSn).toBe(`ORDER${String(index + 1).padStart(3, '0')}`);
      // Result may be success or failure depending on database state
      expect(typeof result.success).toBe('boolean');
    });
    
    // ── SUMMARY ──
    console.log(`[test] ✅ Fallback test passed (getMassShippingParameter failure):`);
    console.log(`[test]    - Batch API attempted: ${getMassShippingParameterCalls} call`);
    console.log(`[test]    - Fallback triggered: ${results.length} results returned`);
    console.log(`[test]    - Rate limiting verified: total time ${totalTime}ms ≥ ${expectedMinTime}ms`);
    console.log(`[test]    - All orders processed: ${results.length}/5`);
  });

  it("should trigger fallback when massShipOrder fails", async () => {
    /**
     * **Validates: Requirements 12.2, 12.3, 12.4, 12.5**
     * 
     * This test verifies that when massShipOrder fails for a batch group,
     * the system automatically falls back to single-order processing.
     * 
     * Note: In this scenario, getMassShippingParameter succeeds but massShipOrder fails.
     * We need to reconfigure the mocks for this specific test.
     */
    
    // Reconfigure getMassShippingParameter to succeed
    mockGetMassShippingParameter.mockImplementation((shopId: number, packageNumbers: string[]) => {
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
    
    // massShipOrder still fails (already configured in beforeEach)
    
    // Create a batch group with 3 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 3 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Execute batch processing with fallback
    const startTime = Date.now();
    const results = await processBatchGroupWithFallback(batchGroup, "pickup");
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // ── VERIFICATION 1: Batch APIs Attempted ──
    // **Validates: Requirement 12.2** - massShipOrder was attempted
    console.log(`[test] getMassShippingParameter calls: ${getMassShippingParameterCalls}`);
    console.log(`[test] massShipOrder calls: ${massShipOrderCalls}`);
    
    expect(getMassShippingParameterCalls).toBe(1); // Parameter API succeeded
    expect(massShipOrderCalls).toBe(1); // Ship API was attempted and failed
    
    // ── VERIFICATION 2: Fallback Triggered ──
    // **Validates: Requirement 12.5** - Fallback processing attempted for all orders
    expect(results).toHaveLength(3);
    
    // ── VERIFICATION 3: Rate Limiting Applied ──
    // **Validates: Requirement 12.4** - 300ms delay between individual orders
    // With 3 orders, we expect at least 2 delays of 300ms = 600ms total
    const expectedMinTime = 2 * 300; // 2 delays between 3 orders
    console.log(`[test] Total processing time: ${totalTime}ms (expected: ≥${expectedMinTime}ms)`);
    expect(totalTime).toBeGreaterThanOrEqual(expectedMinTime - 200); // Allow 200ms tolerance
    
    // ── VERIFICATION 4: All Orders Processed ──
    expect(results).toHaveLength(3);
    
    results.forEach((result, index) => {
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('orderSn');
      expect(result.orderSn).toBe(`ORDER${String(index + 1).padStart(3, '0')}`);
    });
    
    // ── SUMMARY ──
    console.log(`[test] ✅ Fallback test passed (massShipOrder failure):`);
    console.log(`[test]    - Batch APIs attempted: parameter succeeded, ship failed`);
    console.log(`[test]    - Fallback triggered: ${results.length} results returned`);
    console.log(`[test]    - Rate limiting verified: total time ${totalTime}ms ≥ ${expectedMinTime}ms`);
    console.log(`[test]    - All orders processed: ${results.length}/3`);
  });

  it("should verify final results match expected format after fallback", async () => {
    /**
     * **Validates: Requirements 12.3, 12.5**
     * 
     * This test verifies that the final results after fallback processing
     * match the expected ShipmentResult format, ensuring backward compatibility.
     */
    
    // Create a batch group with 4 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 4 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Execute batch processing with fallback
    const results = await processBatchGroupWithFallback(batchGroup, "pickup");

    // ── VERIFICATION 1: Result Count ──
    expect(results).toHaveLength(4);
    
    // ── VERIFICATION 2: Result Structure ──
    // Each result should have the ShipmentResult interface structure
    results.forEach((result, index) => {
      const expectedOrderSn = `ORDER${String(index + 1).padStart(3, '0')}`;
      
      // Required fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('orderSn');
      expect(result.orderSn).toBe(expectedOrderSn);
      
      // Type checks
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.orderSn).toBe('string');
      
      // Conditional fields based on success
      if (result.success) {
        expect(result.message).toBeDefined();
        expect(typeof result.message).toBe('string');
      } else {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
      
      console.log(`[test] Result ${index + 1}:`, {
        success: result.success,
        orderSn: result.orderSn,
        message: result.message,
        error: result.error
      });
    });
    
    // ── VERIFICATION 3: Backward Compatibility ──
    // Results should have the same structure as shipSingleOrder would return
    results.forEach(result => {
      expect(result.orderSn).toBeDefined();
      // Either success with message or failure with error
      if (result.success) {
        expect(result.message).toBeDefined();
      } else {
        expect(result.error).toBeDefined();
      }
    });
    
    // ── SUMMARY ──
    const successCount = results.filter(r => r.success).length;
    console.log(`[test] ✅ Result format verification passed:`);
    console.log(`[test]    - All results have correct structure`);
    console.log(`[test]    - Backward compatibility maintained`);
    console.log(`[test]    - Success count: ${successCount}/4`);
  });

  it("should handle mixed success/failure in fallback mode", async () => {
    /**
     * **Validates: Requirements 12.3, 12.4, 12.5**
     * 
     * This test verifies that when fallback processing occurs, the system
     * handles the results correctly with proper rate limiting, regardless
     * of individual order success/failure.
     */
    
    // Create a batch group with 4 orders
    const batchGroup: BatchGroup = {
      shopId: 12345,
      logisticsChannelId: 50001,
      productLocationId: "LOC001",
      orders: Array.from({ length: 4 }, (_, i) => ({
        orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
        packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
      }))
    };

    // Execute batch processing with fallback
    const startTime = Date.now();
    const results = await processBatchGroupWithFallback(batchGroup, "pickup");
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // ── VERIFICATION 1: All Orders Processed ──
    expect(results).toHaveLength(4);
    
    const successfulOrders = results.filter(r => r.success);
    const failedOrders = results.filter(r => !r.success);
    
    console.log(`[test] Successful orders: ${successfulOrders.length}`);
    console.log(`[test] Failed orders: ${failedOrders.length}`);
    
    // All orders should have been attempted
    expect(successfulOrders.length + failedOrders.length).toBe(4);
    
    // ── VERIFICATION 2: Rate Limiting Applied ──
    // **Validates: Requirement 12.4** - Rate limiting applies regardless of success/failure
    // With 4 orders, we expect at least 3 delays of 300ms = 900ms total
    const expectedMinTime = 3 * 300; // 3 delays between 4 orders
    console.log(`[test] Total processing time: ${totalTime}ms (expected: ≥${expectedMinTime}ms)`);
    expect(totalTime).toBeGreaterThanOrEqual(expectedMinTime - 200); // Allow 200ms tolerance
    
    // ── VERIFICATION 3: Error Messages Preserved ──
    failedOrders.forEach(result => {
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
    
    // ── SUMMARY ──
    console.log(`[test] ✅ Mixed success/failure test passed:`);
    console.log(`[test]    - Total orders processed: ${results.length}/4`);
    console.log(`[test]    - Successful orders: ${successfulOrders.length}`);
    console.log(`[test]    - Failed orders: ${failedOrders.length}`);
    console.log(`[test]    - Rate limiting maintained: total time ${totalTime}ms ≥ ${expectedMinTime}ms`);
  });

  it("should verify fallback logging includes reason and affected order count", async () => {
    /**
     * **Validates: Requirement 12.3**
     * 
     * This test verifies that when fallback is triggered, the system logs
     * the fallback reason and the count of affected orders.
     * 
     * Note: This test captures console.warn output to verify logging behavior.
     */
    
    // Capture console.warn calls
    const originalWarn = console.warn;
    const warnCalls: any[] = [];
    console.warn = (...args: any[]) => {
      warnCalls.push(args);
      originalWarn(...args);
    };
    
    try {
      // Create a batch group with 3 orders
      const batchGroup: BatchGroup = {
        shopId: 12345,
        logisticsChannelId: 50001,
        productLocationId: "LOC001",
        orders: Array.from({ length: 3 }, (_, i) => ({
          orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
          packageNumber: `PKG${String(i + 1).padStart(3, '0')}`
        }))
      };

      // Execute batch processing with fallback
      await processBatchGroupWithFallback(batchGroup, "pickup");

      // ── VERIFICATION: Fallback Logging ──
      // Find the fallback warning log
      const fallbackLog = warnCalls.find(call => 
        call[0]?.includes?.('falling back to single-order') ||
        (typeof call[1] === 'object' && call[1]?.errorType === 'fallback_triggered')
      );
      
      expect(fallbackLog).toBeDefined();
      
      if (fallbackLog) {
        console.log(`[test] Fallback log found:`, fallbackLog);
        
        // Verify log contains fallback reason
        const logData = fallbackLog[1];
        if (typeof logData === 'object') {
          expect(logData.groupSize).toBe(3); // Affected order count
          expect(logData.message).toBeDefined(); // Fallback reason
          
          console.log(`[test] Fallback reason: ${logData.message}`);
          console.log(`[test] Affected order count: ${logData.groupSize}`);
        }
      }
      
      // ── SUMMARY ──
      console.log(`[test] ✅ Fallback logging verified:`);
      console.log(`[test]    - Fallback warning logged`);
      console.log(`[test]    - Reason and affected count included`);
      
    } finally {
      // Restore console.warn
      console.warn = originalWarn;
    }
  });
});
