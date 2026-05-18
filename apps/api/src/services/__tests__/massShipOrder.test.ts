import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { massShipOrder } from "../shopee-raw";
import * as shopeeAuth from "../shopee-auth";

/**
 * Unit Tests: massShipOrder
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * 
 * Tests the massShipOrder function which arranges shipment for multiple packages
 * in a single API call. This is the batch version of ship_order.
 * 
 * Test Coverage:
 * - Valid batch with all packages succeeding (Requirement 2.1, 2.2)
 * - Partial failure scenario with mixed success/fail (Requirement 2.3, 2.4)
 * - Complete failure scenario (Requirement 2.3)
 * - Error handling for API failures (Requirement 2.4)
 */

// Mock fetch globally
const originalFetch = global.fetch;

describe("massShipOrder - Valid Batch with All Success", () => {
  let fetchMock: any;
  let authMock: any;
  let capturedRequests: Array<{ url: string; body: any; method: string }> = [];

  beforeEach(() => {
    capturedRequests = [];
    
    // Mock getValidToken to return mock credentials
    authMock = spyOn(shopeeAuth, "getValidToken").mockResolvedValue({
      partnerId: 123456,
      partnerKey: "test-partner-key",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      shopId: 12345,
      expiresAt: new Date(Date.now() + 3600000)
    });
    
    // Mock fetch to capture requests and return successful response
    fetchMock = mock((url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      // Return successful mock response with all packages succeeding
      const packageList = body.package_list || [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            success_list: packageList.map((pkg: any) => ({
              package_number: pkg.package_number
            })),
            fail_list: []
          }
        })
      });
    });
    
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    authMock.mockRestore();
    capturedRequests = [];
  });

  it("should successfully arrange shipment for all packages with pickup method", async () => {
    /**
     * **Validates: Requirement 2.1, 2.2**
     * 
     * Test that massShipOrder correctly handles a batch where all packages
     * succeed with pickup shipment method.
     */
    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: {
          address_id: 123,
          pickup_time_id: "slot_1"
        }
      },
      {
        package_number: "PKG002",
        pickup: {
          address_id: 123,
          pickup_time_id: "slot_1"
        }
      },
      {
        package_number: "PKG003",
        pickup: {
          address_id: 123,
          pickup_time_id: "slot_1"
        }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once
    expect(capturedRequests.length).toBe(1);
    
    // Verify request method and endpoint
    const request = capturedRequests[0];
    expect(request.method).toBe("POST");
    expect(request.url).toContain("/api/v2/logistics/mass_ship_order");
    
    // Verify request body contains correct parameters
    expect(request.body.package_list).toBeDefined();
    expect(request.body.package_list.length).toBe(3);
    expect(request.body.logistics_channel_id).toBe(logisticsChannelId);
    expect(request.body.product_location_id).toBe(productLocationId);
    
    // Verify all packages have pickup parameters
    request.body.package_list.forEach((pkg: any) => {
      expect(pkg.pickup).toBeDefined();
      expect(pkg.pickup.address_id).toBe(123);
      expect(pkg.pickup.pickup_time_id).toBe("slot_1");
    });
    
    // Verify response structure
    expect(result.response).toBeDefined();
    expect(result.response.success_list).toBeDefined();
    expect(result.response.fail_list).toBeDefined();
    expect(result.response.success_list.length).toBe(3);
    expect(result.response.fail_list.length).toBe(0);
    
    // Verify all packages are in success_list
    const successPackages = result.response.success_list.map((s: any) => s.package_number);
    expect(successPackages).toContain("PKG001");
    expect(successPackages).toContain("PKG002");
    expect(successPackages).toContain("PKG003");
  });

  it("should successfully arrange shipment for all packages with dropoff method", async () => {
    /**
     * **Validates: Requirement 2.1, 2.2**
     * 
     * Test that massShipOrder correctly handles a batch where all packages
     * succeed with dropoff shipment method.
     */
    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        dropoff: {
          branch_id: 456,
          sender_real_name: "John Doe"
        }
      },
      {
        package_number: "PKG002",
        dropoff: {
          branch_id: 456,
          sender_real_name: "John Doe"
        }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once
    expect(capturedRequests.length).toBe(1);
    
    // Verify request body contains dropoff parameters
    const request = capturedRequests[0];
    expect(request.body.package_list.length).toBe(2);
    request.body.package_list.forEach((pkg: any) => {
      expect(pkg.dropoff).toBeDefined();
      expect(pkg.dropoff.branch_id).toBe(456);
      expect(pkg.dropoff.sender_real_name).toBe("John Doe");
    });
    
    // Verify response
    expect(result.response.success_list.length).toBe(2);
    expect(result.response.fail_list.length).toBe(0);
  });

  it("should handle maximum batch size of 50 packages", async () => {
    /**
     * **Validates: Requirement 2.1, 2.2**
     * 
     * Test that massShipOrder correctly handles the maximum batch size
     * of 50 packages allowed by Shopee API.
     */
    const shopId = 12345;
    const packages = Array.from({ length: 50 }, (_, i) => ({
      package_number: `PKG${String(i + 1).padStart(3, '0')}`,
      pickup: {
        address_id: 123,
        pickup_time_id: "slot_1"
      }
    }));
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once (batch call)
    expect(capturedRequests.length).toBe(1);
    
    // Verify request contains all 50 packages
    const request = capturedRequests[0];
    expect(request.body.package_list.length).toBe(50);
    
    // Verify response contains all 50 packages in success_list
    expect(result.response.success_list.length).toBe(50);
    expect(result.response.fail_list.length).toBe(0);
  });
});

describe("massShipOrder - Partial Failure Scenarios", () => {
  let fetchMock: any;
  let authMock: any;
  let capturedRequests: Array<{ url: string; body: any; method: string }> = [];

  beforeEach(() => {
    capturedRequests = [];
    
    // Mock getValidToken to return mock credentials
    authMock = spyOn(shopeeAuth, "getValidToken").mockResolvedValue({
      partnerId: 123456,
      partnerKey: "test-partner-key",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      shopId: 12345,
      expiresAt: new Date(Date.now() + 3600000)
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    authMock.mockRestore();
    capturedRequests = [];
  });

  it("should handle partial failure with mixed success and fail lists", async () => {
    /**
     * **Validates: Requirement 2.3, 2.4**
     * 
     * Test that massShipOrder correctly handles a scenario where some packages
     * succeed and some fail. The response should contain both success_list and
     * fail_list with appropriate error messages.
     */
    
    // Mock fetch to return partial failure response
    fetchMock = mock((url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      // Return response with some successes and some failures
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            success_list: [
              { package_number: "PKG001" },
              { package_number: "PKG003" }
            ],
            fail_list: [
              { 
                package_number: "PKG002",
                fail_reason: "Invalid pickup address"
              },
              { 
                package_number: "PKG004",
                fail_reason: "Logistics channel not available"
              }
            ]
          }
        })
      });
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      },
      {
        package_number: "PKG002",
        pickup: { address_id: 999, pickup_time_id: "slot_1" } // Invalid address
      },
      {
        package_number: "PKG003",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      },
      {
        package_number: "PKG004",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once
    expect(capturedRequests.length).toBe(1);
    
    // Verify response structure
    expect(result.response).toBeDefined();
    expect(result.response.success_list).toBeDefined();
    expect(result.response.fail_list).toBeDefined();
    
    // Verify success_list contains 2 packages
    expect(result.response.success_list.length).toBe(2);
    const successPackages = result.response.success_list.map((s: any) => s.package_number);
    expect(successPackages).toContain("PKG001");
    expect(successPackages).toContain("PKG003");
    
    // Verify fail_list contains 2 packages with error messages
    expect(result.response.fail_list.length).toBe(2);
    const failedPackage1 = result.response.fail_list.find((f: any) => f.package_number === "PKG002");
    const failedPackage2 = result.response.fail_list.find((f: any) => f.package_number === "PKG004");
    
    expect(failedPackage1).toBeDefined();
    expect(failedPackage1.fail_reason).toBe("Invalid pickup address");
    
    expect(failedPackage2).toBeDefined();
    expect(failedPackage2.fail_reason).toBe("Logistics channel not available");
    
    // Verify total count matches input
    const totalProcessed = result.response.success_list.length + result.response.fail_list.length;
    expect(totalProcessed).toBe(packages.length);
  });

  it("should handle scenario where most packages fail", async () => {
    /**
     * **Validates: Requirement 2.3, 2.4**
     * 
     * Test that massShipOrder correctly handles a scenario where most packages
     * fail but a few succeed.
     */
    
    // Mock fetch to return mostly failures
    fetchMock = mock((url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            success_list: [
              { package_number: "PKG001" }
            ],
            fail_list: [
              { package_number: "PKG002", fail_reason: "Order already shipped" },
              { package_number: "PKG003", fail_reason: "Order cancelled" },
              { package_number: "PKG004", fail_reason: "Invalid logistics configuration" },
              { package_number: "PKG005", fail_reason: "Package not found" }
            ]
          }
        })
      });
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = Array.from({ length: 5 }, (_, i) => ({
      package_number: `PKG${String(i + 1).padStart(3, '0')}`,
      pickup: { address_id: 123, pickup_time_id: "slot_1" }
    }));
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify response
    expect(result.response.success_list.length).toBe(1);
    expect(result.response.fail_list.length).toBe(4);
    
    // Verify all failed packages have error messages
    result.response.fail_list.forEach((failed: any) => {
      expect(failed.package_number).toBeDefined();
      expect(failed.fail_reason).toBeDefined();
      expect(typeof failed.fail_reason).toBe("string");
      expect(failed.fail_reason.length).toBeGreaterThan(0);
    });
  });
});

describe("massShipOrder - Complete Failure Scenarios", () => {
  let fetchMock: any;
  let authMock: any;
  let capturedRequests: Array<{ url: string; body: any; method: string }> = [];

  beforeEach(() => {
    capturedRequests = [];
    
    // Mock getValidToken to return mock credentials
    authMock = spyOn(shopeeAuth, "getValidToken").mockResolvedValue({
      partnerId: 123456,
      partnerKey: "test-partner-key",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      shopId: 12345,
      expiresAt: new Date(Date.now() + 3600000)
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    authMock.mockRestore();
    capturedRequests = [];
  });

  it("should handle complete failure where all packages fail", async () => {
    /**
     * **Validates: Requirement 2.3**
     * 
     * Test that massShipOrder correctly handles a scenario where all packages
     * fail to ship.
     */
    
    // Mock fetch to return all failures
    fetchMock = mock((url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      const packageList = body.package_list || [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            success_list: [],
            fail_list: packageList.map((pkg: any) => ({
              package_number: pkg.package_number,
              fail_reason: "Logistics service temporarily unavailable"
            }))
          }
        })
      });
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      },
      {
        package_number: "PKG002",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      },
      {
        package_number: "PKG003",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called
    expect(capturedRequests.length).toBe(1);
    
    // Verify response structure
    expect(result.response).toBeDefined();
    expect(result.response.success_list).toBeDefined();
    expect(result.response.fail_list).toBeDefined();
    
    // Verify all packages are in fail_list
    expect(result.response.success_list.length).toBe(0);
    expect(result.response.fail_list.length).toBe(3);
    
    // Verify all failed packages have error messages
    const failedPackages = result.response.fail_list.map((f: any) => f.package_number);
    expect(failedPackages).toContain("PKG001");
    expect(failedPackages).toContain("PKG002");
    expect(failedPackages).toContain("PKG003");
    
    result.response.fail_list.forEach((failed: any) => {
      expect(failed.fail_reason).toBe("Logistics service temporarily unavailable");
    });
  });

  it("should handle API error response", async () => {
    /**
     * **Validates: Requirement 2.4**
     * 
     * Test that massShipOrder correctly handles API error responses
     * (e.g., invalid parameters, authentication errors).
     */
    
    // Mock fetch to return API error
    fetchMock = mock((url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({
          error: "error_invalid_param",
          message: "Invalid logistics_channel_id"
        })
      });
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      }
    ];
    const logisticsChannelId = 99999; // Invalid channel ID
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called
    expect(capturedRequests.length).toBe(1);
    
    // Verify error response is returned
    expect(result.error).toBeDefined();
    expect(result.error).toBe("error_invalid_param");
    expect(result.message).toBeDefined();
  });

  it("should handle network timeout errors", async () => {
    /**
     * **Validates: Requirement 2.4**
     * 
     * Test that massShipOrder correctly handles network timeout errors
     * and retries the request.
     */
    
    let attemptCount = 0;
    
    // Mock fetch to timeout on first 2 attempts, succeed on 3rd
    fetchMock = mock((url: string, options?: any) => {
      attemptCount++;
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      if (attemptCount < 3) {
        // Simulate timeout by rejecting the promise
        return Promise.reject(new Error("Network timeout"));
      }
      
      // Third attempt succeeds
      const packageList = body.package_list || [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            success_list: packageList.map((pkg: any) => ({
              package_number: pkg.package_number
            })),
            fail_list: []
          }
        })
      });
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called 3 times (2 failures + 1 success)
    expect(capturedRequests.length).toBe(3);
    
    // Verify final result is successful
    expect(result.response).toBeDefined();
    expect(result.response.success_list.length).toBe(1);
    expect(result.response.fail_list.length).toBe(0);
  });

  it("should throw error after max retry attempts", async () => {
    /**
     * **Validates: Requirement 2.4**
     * 
     * Test that massShipOrder throws an error after exhausting all retry
     * attempts for network errors.
     */
    
    // Mock fetch to always timeout
    fetchMock = mock((url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      return Promise.reject(new Error("Network timeout"));
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    // Expect the function to throw after max retries
    try {
      await massShipOrder(
        shopId,
        packages,
        logisticsChannelId,
        productLocationId
      );
      
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      // Verify error was thrown
      expect(error).toBeDefined();
      expect(error.message).toContain("Network timeout");
      
      // Verify API was called 3 times (max retry attempts)
      expect(capturedRequests.length).toBe(3);
    }
  });

  it("should handle server error (500) with retry", async () => {
    /**
     * **Validates: Requirement 2.4**
     * 
     * Test that massShipOrder correctly handles server errors (5xx)
     * and retries the request.
     */
    
    let attemptCount = 0;
    
    // Mock fetch to return 500 on first attempt, succeed on second
    fetchMock = mock((url: string, options?: any) => {
      attemptCount++;
      const body = options?.body ? JSON.parse(options.body) : {};
      capturedRequests.push({ 
        url, 
        body,
        method: options?.method || "GET"
      });
      
      if (attemptCount === 1) {
        // First attempt: server error
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            error: "internal_server_error",
            message: "Server temporarily unavailable"
          })
        });
      }
      
      // Second attempt succeeds
      const packageList = body.package_list || [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            success_list: packageList.map((pkg: any) => ({
              package_number: pkg.package_number
            })),
            fail_list: []
          }
        })
      });
    });
    
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packages = [
      {
        package_number: "PKG001",
        pickup: { address_id: 123, pickup_time_id: "slot_1" }
      }
    ];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await massShipOrder(
      shopId,
      packages,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called 2 times (1 failure + 1 success)
    expect(capturedRequests.length).toBe(2);
    
    // Verify final result is successful
    expect(result.response).toBeDefined();
    expect(result.response.success_list.length).toBe(1);
    expect(result.response.fail_list.length).toBe(0);
  });
});
