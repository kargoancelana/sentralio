import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

/**
 * Bug Condition Exploration Test
 *
 * **Property 1: Bug Condition** - Stale Status and Tracking Lost
 *
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 *
 * **GOAL**: Surface counterexamples that demonstrate the bug exists in `shipBatchOrders()`
 *
 * Bug Conditions Tested:
 * 1. Order with local status READY_TO_SHIP but Shopee status PROCESSED → current code reports as FAILED,
 *    expected behavior is SUCCESS with "sudah berhasil dikirim sebelumnya"
 * 2. Order with local status READY_TO_SHIP but Shopee status CANCELLED → current code doesn't detect this properly
 * 3. Phase 4 tracking retrieval re-calls `searchPackageList` instead of reusing Phase 2 package numbers
 *
 * **Validates: Requirements 1.1, 1.2, 1.5, 1.6, 2.1, 2.2, 2.3, 2.6**
 */

// ── MOCKS ──

// Track searchPackageList call count to verify Phase 4 behavior
let searchPackageListCallCount = 0;

// Mock DB
const mockDbUpdateSet = mock(() => ({
  where: mock(() => ({
    execute: mock(() => Promise.resolve()),
  })),
}));
const mockDbUpdate = mock(() => ({
  set: mockDbUpdateSet,
}));
const mockDbSelectResult = mock(() => Promise.resolve([]));
const mockDbSelectWhere = mock(() => ({
  limit: mockDbSelectResult,
}));
const mockDbSelectFrom = mock(() => ({
  where: mockDbSelectWhere,
}));
const mockDbSelect = mock(() => ({
  from: mockDbSelectFrom,
}));

const mockDb = {
  select: mockDbSelect,
  update: mockDbUpdate,
};

mock.module("../../db/client", () => ({
  db: mockDb,
}));

mock.module("../../db/schema", () => ({
  shopeeOrders: { orderSn: "order_sn" },
}));

mock.module("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val }),
}));

// Mock shopee-auth
mock.module("../shopee-auth", () => ({
  getValidToken: mock(() =>
    Promise.resolve({ accessToken: "mock_token", shopId: 12345 })
  ),
}));

// Mock shopee-raw functions
const mockGetShopeeOrderDetails = mock(() => Promise.resolve({ response: { order_list: [] } }));
const mockSearchPackageList = mock(() => {
  searchPackageListCallCount++;
  return Promise.resolve({
    response: {
      packages_list: [],
      pagination: { more: false, next_cursor: "" },
    },
  });
});
const mockGetMassShippingParameter = mock(() => Promise.resolve({ response: {} }));
const mockMassShipOrder = mock(() => Promise.resolve({ response: { result_list: [] } }));
const mockShipShopeeOrder = mock(() => Promise.resolve({ response: {} }));
const mockGetShipmentList = mock(() => Promise.resolve({ response: { order_list: [] } }));

mock.module("../shopee-raw", () => ({
  getShopeeOrderDetails: mockGetShopeeOrderDetails,
  searchPackageList: mockSearchPackageList,
  getMassShippingParameter: mockGetMassShippingParameter,
  massShipOrder: mockMassShipOrder,
  shipShopeeOrder: mockShipShopeeOrder,
  getShipmentList: mockGetShipmentList,
}));

// Mock shopee-label
const mockGetMassTrackingNumber = mock(() =>
  Promise.resolve({
    response: {
      success_list: [
        { package_number: "PKG001", tracking_number: "TRACK001" },
      ],
      fail_list: [],
    },
  })
);

mock.module("../shopee-label", () => ({
  getTrackingNumber: mock(() => Promise.resolve(null)),
  getShippingParameter: mock(() =>
    Promise.resolve({
      response: {
        pickup: {
          address_list: [
            {
              address_id: 123,
              time_slot_list: [{ pickup_time_id: "slot1", flags: ["recommended"] }],
            },
          ],
        },
      },
    })
  ),
  getMassTrackingNumber: mockGetMassTrackingNumber,
}));

// Import AFTER mocks are set up
const { shipBatchOrders } = await import("../shipment.service");

describe("Bug Condition Exploration: Stale Status and Tracking Lost", () => {
  beforeEach(() => {
    searchPackageListCallCount = 0;
    mockGetShopeeOrderDetails.mockClear();
    mockSearchPackageList.mockClear();
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    mockGetMassTrackingNumber.mockClear();
    mockShipShopeeOrder.mockClear();
    mockDbSelect.mockClear();
    mockDbUpdate.mockClear();
    mockDbUpdateSet.mockClear();
    mockDbSelectFrom.mockClear();
    mockDbSelectWhere.mockClear();
    mockDbSelectResult.mockClear();
  });

  /**
   * Bug Condition 1: Stale SHIPPED/PROCESSED order reported as FAILED instead of SUCCESS
   *
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   *
   * Scenario: Order "250601STALE01" has local status READY_TO_SHIP but Shopee status is PROCESSED.
   * Current (buggy) behavior: The order is reported as FAILED with error message
   *   "Order sudah berstatus PROCESSED di Shopee (tidak perlu diatur pengiriman lagi)"
   * Expected (fixed) behavior: The order should be reported as SUCCESS with message
   *   "sudah berhasil dikirim sebelumnya" via a pre-sync phase BEFORE batch grouping.
   *
   * This test EXPECTS success=true. On unfixed code it will FAIL because the code
   * reports stale shipped orders as failures.
   */
  it("Property 1.1: Stale PROCESSED order should be reported as SUCCESS (will FAIL on unfixed code)", async () => {
    const staleOrderSn = "250601STALE01";
    const shopId = 12345;

    // Mock DB: order exists with READY_TO_SHIP status locally
    mockDbSelectResult.mockImplementation(() =>
      Promise.resolve([
        {
          id: 1,
          shopId,
          orderSn: staleOrderSn,
          orderStatus: "READY_TO_SHIP",
          totalAmount: 50000,
          buyerUsername: "buyer1",
          shippingCarrier: "SPX",
          trackingNumber: null,
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    // Mock getShopeeOrderDetails: Shopee says order is PROCESSED (already shipped)
    mockGetShopeeOrderDetails.mockImplementation(() =>
      Promise.resolve({
        response: {
          order_list: [
            { order_sn: staleOrderSn, order_status: "PROCESSED" },
          ],
        },
      })
    );

    // Mock searchPackageList: order NOT returned (because it's no longer package_status:2)
    mockSearchPackageList.mockImplementation(() => {
      searchPackageListCallCount++;
      return Promise.resolve({
        response: {
          packages_list: [], // Stale order not in ToProcess list
          pagination: { more: false, next_cursor: "" },
        },
      });
    });

    // Act
    const results = await shipBatchOrders([staleOrderSn], "pickup");

    // Assert: Expected behavior (after fix) - stale shipped order = SUCCESS
    const result = results.find((r) => r.orderSn === staleOrderSn);
    expect(result).toBeDefined();

    // BUG CONDITION: On unfixed code, this will FAIL because:
    // - The order falls to fallback (not found in searchPackageList)
    // - Fallback calls getShopeeOrderDetails and reports it as FAILED
    // - Error: "Order sudah berstatus PROCESSED di Shopee (tidak perlu diatur pengiriman lagi)"
    //
    // EXPECTED (after fix): Pre-sync phase detects stale status and reports SUCCESS
    expect(result!.success).toBe(true);
    expect(result!.message || result!.error || "").toContain("sudah berhasil dikirim");

    console.log("[BUG CONDITION 1 - Stale PROCESSED]");
    console.log(`  Order: ${staleOrderSn}`);
    console.log(`  Local status: READY_TO_SHIP`);
    console.log(`  Shopee status: PROCESSED`);
    console.log(`  Result success: ${result?.success}`);
    console.log(`  Result message: ${result?.message || result?.error}`);
    console.log(`  Expected: success=true, message contains "sudah berhasil dikirim"`);
  });

  /**
   * Bug Condition 2: Stale CANCELLED order not properly detected
   *
   * **Validates: Requirements 1.6, 2.3**
   *
   * Scenario: Order "250601CANCEL01" has local status READY_TO_SHIP but Shopee status is CANCELLED.
   * Current (buggy) behavior: The order either gets a generic Shopee API error or is reported
   *   with a non-specific error message.
   * Expected (fixed) behavior: The order should be reported as FAILED with clear message
   *   "sudah dibatalkan di Shopee" and DB should be updated to CANCELLED.
   */
  it("Property 1.2: Stale CANCELLED order should report 'sudah dibatalkan di Shopee' (will FAIL on unfixed code)", async () => {
    const cancelledOrderSn = "250601CANCEL01";
    const shopId = 12345;

    // Mock DB: order exists with READY_TO_SHIP status locally
    mockDbSelectResult.mockImplementation(() =>
      Promise.resolve([
        {
          id: 2,
          shopId,
          orderSn: cancelledOrderSn,
          orderStatus: "READY_TO_SHIP",
          totalAmount: 75000,
          buyerUsername: "buyer2",
          shippingCarrier: "JNE",
          trackingNumber: null,
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    // Mock getShopeeOrderDetails: Shopee says order is CANCELLED
    mockGetShopeeOrderDetails.mockImplementation(() =>
      Promise.resolve({
        response: {
          order_list: [
            { order_sn: cancelledOrderSn, order_status: "CANCELLED" },
          ],
        },
      })
    );

    // Mock searchPackageList: order NOT returned (cancelled orders not in ToProcess)
    mockSearchPackageList.mockImplementation(() => {
      searchPackageListCallCount++;
      return Promise.resolve({
        response: {
          packages_list: [],
          pagination: { more: false, next_cursor: "" },
        },
      });
    });

    // Mock shipSingleOrder to simulate failure (fallback path on unfixed code)
    mockShipShopeeOrder.mockImplementation(() =>
      Promise.reject(new Error("order_status_not_ready_to_ship"))
    );

    // Act
    const results = await shipBatchOrders([cancelledOrderSn], "pickup");

    // Assert: Expected behavior (after fix) - cancelled order = FAILED with specific message
    const result = results.find((r) => r.orderSn === cancelledOrderSn);
    expect(result).toBeDefined();

    // BUG CONDITION: On unfixed code, this will FAIL because:
    // - The error message won't contain "sudah dibatalkan di Shopee"
    // - Instead it will have a generic error like "Order sudah berstatus CANCELLED di Shopee (tidak perlu diatur pengiriman lagi)"
    //   or a Shopee API error
    //
    // EXPECTED (after fix): Pre-sync phase detects CANCELLED and reports with specific message
    expect(result!.success).toBe(false);
    expect(result!.error || "").toContain("sudah dibatalkan di Shopee");

    console.log("[BUG CONDITION 2 - Stale CANCELLED]");
    console.log(`  Order: ${cancelledOrderSn}`);
    console.log(`  Local status: READY_TO_SHIP`);
    console.log(`  Shopee status: CANCELLED`);
    console.log(`  Result success: ${result?.success}`);
    console.log(`  Result error: ${result?.error}`);
    console.log(`  Expected: success=false, error contains "sudah dibatalkan di Shopee"`);
  });

  /**
   * Bug Condition 3: Phase 4 tracking retrieval re-calls searchPackageList
   *
   * **Validates: Requirements 1.5, 2.6**
   *
   * Scenario: After successful batch ship (Phase 3), Phase 4 calls getPackageNumbersForOrders
   *   which calls searchPackageList again with package_status:2. But shipped orders are now
   *   package_status:3, so searchPackageList returns empty → no tracking numbers retrieved.
   *
   * Expected (fixed) behavior: Phase 4 should reuse package numbers from Phase 2 (cached)
   *   and NOT call searchPackageList again.
   */
  it("Property 1.3: Phase 4 should NOT re-call searchPackageList for tracking (will FAIL on unfixed code)", async () => {
    const orderSn = "250601VALID01";
    const shopId = 12345;
    const packageNumber = "PKG_VALID01";

    // Mock DB: order exists with READY_TO_SHIP status locally
    mockDbSelectResult.mockImplementation(() =>
      Promise.resolve([
        {
          id: 3,
          shopId,
          orderSn,
          orderStatus: "READY_TO_SHIP",
          totalAmount: 100000,
          buyerUsername: "buyer3",
          shippingCarrier: "SPX",
          trackingNumber: null,
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    // Mock getShopeeOrderDetails: order is genuinely READY_TO_SHIP
    mockGetShopeeOrderDetails.mockImplementation(() =>
      Promise.resolve({
        response: {
          order_list: [{ order_sn: orderSn, order_status: "READY_TO_SHIP" }],
        },
      })
    );

    // Phase 2: searchPackageList returns the order with package info
    // Phase 4: searchPackageList is called AGAIN but returns empty (bug!)
    let phase2Called = false;
    mockSearchPackageList.mockImplementation(() => {
      searchPackageListCallCount++;
      if (!phase2Called) {
        // Phase 2: return package info
        phase2Called = true;
        return Promise.resolve({
          response: {
            packages_list: [
              {
                order_sn: orderSn,
                package_number: packageNumber,
                logistics_channel_id: 80029,
                product_location_id: "VN0002BIZ",
              },
            ],
            pagination: { more: false, next_cursor: "" },
          },
        });
      } else {
        // Phase 4: order is now shipped (package_status:3), not returned by status:2 filter
        return Promise.resolve({
          response: {
            packages_list: [], // Empty! Bug: order no longer in ToProcess
            pagination: { more: false, next_cursor: "" },
          },
        });
      }
    });

    // Mock getMassShippingParameter: return valid parameters
    mockGetMassShippingParameter.mockImplementation(() =>
      Promise.resolve({
        response: {
          shipping_parameter_list: [
            {
              package_number: packageNumber,
              pickup: {
                address_list: [
                  {
                    address_id: 123,
                    time_slot_list: [
                      { pickup_time_id: "slot1", flags: ["recommended"] },
                    ],
                  },
                ],
              },
            },
          ],
        },
      })
    );

    // Mock massShipOrder: success (uses success_list/fail_list format)
    mockMassShipOrder.mockImplementation(() =>
      Promise.resolve({
        response: {
          success_list: [
            { package_number: packageNumber },
          ],
          fail_list: [],
        },
      })
    );

    // Mock getMassTrackingNumber: returns tracking for the package
    mockGetMassTrackingNumber.mockImplementation(() =>
      Promise.resolve({
        response: {
          success_list: [
            { package_number: packageNumber, tracking_number: "SPXID001234567" },
          ],
          fail_list: [],
        },
      })
    );

    // Act
    const results = await shipBatchOrders([orderSn], "pickup");

    // Assert: Expected behavior (after fix)
    const result = results.find((r) => r.orderSn === orderSn);
    expect(result).toBeDefined();
    expect(result!.success).toBe(true);

    // BUG CONDITION: On unfixed code, searchPackageList is called TWICE:
    // - Once in Phase 2 (getPackageNumbersForOrders for batch grouping)
    // - Once in Phase 4 (getPackageNumbersForOrders for tracking retrieval)
    //
    // The Phase 4 call returns empty because the order is now shipped (package_status:3)
    // so no tracking number is retrieved.
    //
    // EXPECTED (after fix): searchPackageList called only ONCE (Phase 2),
    // Phase 4 reuses cached package numbers from Phase 2.
    expect(searchPackageListCallCount).toBe(1); // Should only be called once (Phase 2)

    // Additionally, tracking number should be retrieved successfully
    expect(result!.trackingNumber).toBe("SPXID001234567");

    console.log("[BUG CONDITION 3 - Phase 4 Tracking Lost]");
    console.log(`  Order: ${orderSn}`);
    console.log(`  searchPackageList call count: ${searchPackageListCallCount}`);
    console.log(`  Expected calls: 1 (Phase 2 only)`);
    console.log(`  Tracking number: ${result?.trackingNumber}`);
    console.log(`  Expected: searchPackageList called once, tracking number retrieved`);
    console.log(
      `  Bug: Phase 4 re-calls searchPackageList which returns empty for shipped orders`
    );
  });
});


/**
 * Preservation Property Tests
 *
 * **Property 2: Preservation** - Valid READY_TO_SHIP Orders Processed Normally
 *
 * **IMPORTANT**: These tests MUST PASS on unfixed code. They capture baseline behavior
 * that must not regress after the fix is implemented.
 *
 * Preservation Properties Tested:
 * 1. Orders genuinely READY_TO_SHIP on both DB and Shopee go through normal flow
 *    (searchPackageList → mass_ship_order → getMassTrackingNumber) and return success
 * 2. mass_ship_order errors (non-stale, e.g. logistics mismatch) are reported as failures
 *    with original error messages preserved
 * 3. Orders with non-READY_TO_SHIP status in local DB are rejected at Phase 1 validation
 *    without calling Shopee APIs
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
describe("Preservation: Valid READY_TO_SHIP Orders Processed Normally", () => {
  beforeEach(() => {
    searchPackageListCallCount = 0;
    mockGetShopeeOrderDetails.mockClear();
    mockSearchPackageList.mockClear();
    mockGetMassShippingParameter.mockClear();
    mockMassShipOrder.mockClear();
    mockGetMassTrackingNumber.mockClear();
    mockShipShopeeOrder.mockClear();
    mockDbSelect.mockClear();
    mockDbUpdate.mockClear();
    mockDbUpdateSet.mockClear();
    mockDbSelectFrom.mockClear();
    mockDbSelectWhere.mockClear();
    mockDbSelectResult.mockClear();
  });

  /**
   * Preservation Property 2.1: Valid READY_TO_SHIP orders complete the normal batch ship flow
   *
   * **Validates: Requirements 3.1, 3.2, 3.4**
   *
   * For all orders where localStatus = READY_TO_SHIP AND shopeeStatus = READY_TO_SHIP,
   * the batch ship flow calls searchPackageList → mass_ship_order → getMassTrackingNumber
   * and returns success with the correct message.
   */
  it("Property 2.1: Valid READY_TO_SHIP order completes normal batch flow with success", async () => {
    const orderSn = "250601NORMAL01";
    const shopId = 12345;
    const packageNumber = "PKG_NORMAL01";

    // Mock DB: order exists with READY_TO_SHIP status locally
    mockDbSelectResult.mockImplementation(() =>
      Promise.resolve([
        {
          id: 10,
          shopId,
          orderSn,
          orderStatus: "READY_TO_SHIP",
          totalAmount: 120000,
          buyerUsername: "buyer_normal",
          shippingCarrier: "SPX",
          trackingNumber: null,
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    // Mock searchPackageList: returns valid package data for this order
    mockSearchPackageList.mockImplementation(() => {
      searchPackageListCallCount++;
      return Promise.resolve({
        response: {
          packages_list: [
            {
              order_sn: orderSn,
              package_number: packageNumber,
              logistics_channel_id: 80029,
              product_location_id: "ID0001BIZ",
            },
          ],
          pagination: { more: false, next_cursor: "" },
        },
      });
    });

    // Mock getMassShippingParameter: return valid pickup parameters
    mockGetMassShippingParameter.mockImplementation(() =>
      Promise.resolve({
        response: {
          pickup: {
            address_list: [
              {
                address_id: 456,
                time_slot_list: [
                  { pickup_time_id: "slot_abc", flags: ["recommended"] },
                ],
              },
            ],
          },
        },
      })
    );

    // Mock massShipOrder: success
    mockMassShipOrder.mockImplementation(() =>
      Promise.resolve({
        response: {
          success_list: [{ package_number: packageNumber }],
          fail_list: [],
        },
      })
    );

    // Mock getMassTrackingNumber: returns tracking number
    mockGetMassTrackingNumber.mockImplementation(() =>
      Promise.resolve({
        response: {
          success_list: [
            { package_number: packageNumber, tracking_number: "SPXID999888777" },
          ],
          fail_list: [],
        },
      })
    );

    // Act
    const results = await shipBatchOrders([orderSn], "pickup");

    // Assert: order is reported as success
    const result = results.find((r) => r.orderSn === orderSn);
    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
    expect(result!.message).toBeDefined();

    // Verify the normal flow was followed:
    // 1. searchPackageList was called (Phase 2)
    expect(searchPackageListCallCount).toBeGreaterThanOrEqual(1);
    // 2. massShipOrder was called (Phase 3)
    expect(mockMassShipOrder).toHaveBeenCalled();
    // 3. getMassTrackingNumber was called (Phase 4)
    expect(mockGetMassTrackingNumber).toHaveBeenCalled();

    console.log("[PRESERVATION 2.1 - Normal Flow Success]");
    console.log(`  Order: ${orderSn}`);
    console.log(`  Result success: ${result?.success}`);
    console.log(`  Result message: ${result?.message}`);
    console.log(`  searchPackageList calls: ${searchPackageListCallCount}`);
    console.log(`  massShipOrder called: ${mockMassShipOrder.mock.calls.length > 0}`);
    console.log(`  getMassTrackingNumber called: ${mockGetMassTrackingNumber.mock.calls.length > 0}`);
  });

  /**
   * Preservation Property 2.2: mass_ship_order errors (non-stale) preserve original error messages
   *
   * **Validates: Requirements 3.3, 3.5**
   *
   * For all non-stale API errors from mass_ship_order (e.g. logistics mismatch, invalid parameters),
   * the error message from Shopee is preserved in the result without modification.
   */
  it("Property 2.2: mass_ship_order errors preserve original error messages as failures", async () => {
    const orderSn = "250601FAIL01";
    const shopId = 12345;
    const packageNumber = "PKG_FAIL01";
    const originalErrorMessage = "logistics_channel_not_match: The logistics channel does not match";

    // Mock DB: order exists with READY_TO_SHIP status locally
    mockDbSelectResult.mockImplementation(() =>
      Promise.resolve([
        {
          id: 20,
          shopId,
          orderSn,
          orderStatus: "READY_TO_SHIP",
          totalAmount: 85000,
          buyerUsername: "buyer_fail",
          shippingCarrier: "JNE",
          trackingNumber: null,
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    // Mock searchPackageList: returns valid package data
    mockSearchPackageList.mockImplementation(() => {
      searchPackageListCallCount++;
      return Promise.resolve({
        response: {
          packages_list: [
            {
              order_sn: orderSn,
              package_number: packageNumber,
              logistics_channel_id: 80029,
              product_location_id: "ID0001BIZ",
            },
          ],
          pagination: { more: false, next_cursor: "" },
        },
      });
    });

    // Mock getMassShippingParameter: return valid parameters
    mockGetMassShippingParameter.mockImplementation(() =>
      Promise.resolve({
        response: {
          pickup: {
            address_list: [
              {
                address_id: 789,
                time_slot_list: [
                  { pickup_time_id: "slot_xyz", flags: ["recommended"] },
                ],
              },
            ],
          },
        },
      })
    );

    // Mock massShipOrder: FAILURE with specific error message (non-stale error)
    mockMassShipOrder.mockImplementation(() =>
      Promise.resolve({
        response: {
          success_list: [],
          fail_list: [
            {
              package_number: packageNumber,
              fail_reason: originalErrorMessage,
            },
          ],
        },
      })
    );

    // Act
    const results = await shipBatchOrders([orderSn], "pickup");

    // Assert: order is reported as failure with original error message preserved
    const result = results.find((r) => r.orderSn === orderSn);
    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    // The error message should contain the original Shopee error
    expect(result!.error).toBeDefined();
    expect(result!.error!).toContain(originalErrorMessage);

    console.log("[PRESERVATION 2.2 - Error Message Preserved]");
    console.log(`  Order: ${orderSn}`);
    console.log(`  Result success: ${result?.success}`);
    console.log(`  Result error: ${result?.error}`);
    console.log(`  Original error preserved: ${result?.error?.includes(originalErrorMessage)}`);
  });

  /**
   * Preservation Property 2.3: Non-READY_TO_SHIP orders rejected at Phase 1 without Shopee API calls
   *
   * **Validates: Requirements 3.1, 3.2**
   *
   * Orders with non-READY_TO_SHIP status in local DB are rejected at Phase 1 validation
   * without calling any Shopee APIs (searchPackageList, massShipOrder, etc.).
   */
  it("Property 2.3: Non-READY_TO_SHIP orders rejected at Phase 1 without calling Shopee APIs", async () => {
    const processedOrderSn = "250601PROCESSED01";
    const shopId = 12345;

    // Mock DB: order exists with PROCESSED status (not READY_TO_SHIP)
    mockDbSelectResult.mockImplementation(() =>
      Promise.resolve([
        {
          id: 30,
          shopId,
          orderSn: processedOrderSn,
          orderStatus: "PROCESSED",
          totalAmount: 60000,
          buyerUsername: "buyer_processed",
          shippingCarrier: "SPX",
          trackingNumber: "SPXID_EXISTING",
          payTime: new Date(),
          createTime: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    // Act
    const results = await shipBatchOrders([processedOrderSn], "pickup");

    // Assert: order is rejected at Phase 1
    const result = results.find((r) => r.orderSn === processedOrderSn);
    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    // Error message should indicate the order cannot be processed due to its status
    expect(result!.error).toBeDefined();
    expect(result!.error!).toContain("PROCESSED");

    // Verify NO Shopee APIs were called (rejected before Phase 2)
    expect(mockSearchPackageList).not.toHaveBeenCalled();
    expect(mockMassShipOrder).not.toHaveBeenCalled();
    expect(mockGetMassTrackingNumber).not.toHaveBeenCalled();
    expect(mockGetMassShippingParameter).not.toHaveBeenCalled();

    console.log("[PRESERVATION 2.3 - Phase 1 Rejection]");
    console.log(`  Order: ${processedOrderSn}`);
    console.log(`  Local status: PROCESSED`);
    console.log(`  Result success: ${result?.success}`);
    console.log(`  Result error: ${result?.error}`);
    console.log(`  searchPackageList called: ${mockSearchPackageList.mock.calls.length > 0}`);
    console.log(`  massShipOrder called: ${mockMassShipOrder.mock.calls.length > 0}`);
    console.log(`  getMassTrackingNumber called: ${mockGetMassTrackingNumber.mock.calls.length > 0}`);
  });
});
