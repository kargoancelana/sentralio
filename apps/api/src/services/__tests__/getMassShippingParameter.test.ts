import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { getMassShippingParameter } from "../shopee-raw";
import * as shopeeAuth from "../shopee-auth";

/**
 * Unit Tests: getMassShippingParameter
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * Tests the getMassShippingParameter function which retrieves shipping parameters
 * for multiple packages in a single API call. This is the batch version of
 * get_shipping_parameter.
 * 
 * Test Coverage:
 * - Valid inputs with 1, 28, and 50 package numbers (Requirement 1.1)
 * - Error handling for API failures (Requirement 1.3)
 * - Retry logic for network errors (Requirement 1.3)
 * - Auth error handling and token refresh (Requirement 1.4)
 */

// Mock fetch globally
const originalFetch = global.fetch;

describe("getMassShippingParameter - Valid Inputs", () => {
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
      
      // Return successful mock response with shipping parameters
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            info_needed: {
              pickup: ["address_id", "pickup_time_id"]
            },
            pickup: {
              address_list: [{
                address_id: 123,
                region: "Jakarta",
                city: "Jakarta Selatan",
                address: "Jl. Test No. 123",
                time_slot_list: [{
                  pickup_time_id: "slot_1",
                  date: "2024-01-15",
                  time_text: "09:00-12:00",
                  flags: ["recommended"]
                }]
              }]
            }
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

  it("should handle valid input with 1 package number", async () => {
    /**
     * **Validates: Requirement 1.1**
     * 
     * Test that getMassShippingParameter correctly handles a single package.
     * This is the minimum batch size.
     */
    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once
    expect(capturedRequests.length).toBe(1);
    
    // Verify request method and endpoint
    const request = capturedRequests[0];
    expect(request.method).toBe("POST");
    expect(request.url).toContain("/api/v2/logistics/get_mass_shipping_parameter");
    
    // Verify request body contains correct parameters
    expect(request.body.package_list).toBeDefined();
    expect(request.body.package_list.length).toBe(1);
    expect(request.body.package_list[0].package_number).toBe("PKG001");
    expect(request.body.logistics_channel_id).toBe(logisticsChannelId);
    expect(request.body.product_location_id).toBe(productLocationId);
    
    // Verify response structure
    expect(result.response).toBeDefined();
    expect(result.response.info_needed).toBeDefined();
    expect(result.response.pickup).toBeDefined();
  });

  it("should handle valid input with 28 package numbers", async () => {
    /**
     * **Validates: Requirement 1.1**
     * 
     * Test that getMassShippingParameter correctly handles 28 packages.
     * This is a typical batch size for warehouse operations.
     */
    const shopId = 12345;
    const packageNumbers = Array.from({ length: 28 }, (_, i) => `PKG${String(i + 1).padStart(3, '0')}`);
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once (batch call)
    expect(capturedRequests.length).toBe(1);
    
    // Verify request contains all 28 packages
    const request = capturedRequests[0];
    expect(request.body.package_list).toBeDefined();
    expect(request.body.package_list.length).toBe(28);
    
    // Verify all package numbers are included
    const requestedPackages = request.body.package_list.map((p: any) => p.package_number);
    expect(requestedPackages).toEqual(packageNumbers);
    
    // Verify logistics configuration
    expect(request.body.logistics_channel_id).toBe(logisticsChannelId);
    expect(request.body.product_location_id).toBe(productLocationId);
    
    // Verify response structure
    expect(result.response).toBeDefined();
  });

  it("should handle valid input with 50 package numbers (max batch size)", async () => {
    /**
     * **Validates: Requirement 1.1**
     * 
     * Test that getMassShippingParameter correctly handles 50 packages.
     * This is the maximum batch size allowed by Shopee API.
     */
    const shopId = 12345;
    const packageNumbers = Array.from({ length: 50 }, (_, i) => `PKG${String(i + 1).padStart(3, '0')}`);
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify API was called exactly once (batch call)
    expect(capturedRequests.length).toBe(1);
    
    // Verify request contains all 50 packages
    const request = capturedRequests[0];
    expect(request.body.package_list).toBeDefined();
    expect(request.body.package_list.length).toBe(50);
    
    // Verify all package numbers are included
    const requestedPackages = request.body.package_list.map((p: any) => p.package_number);
    expect(requestedPackages).toEqual(packageNumbers);
    
    // Verify response structure
    expect(result.response).toBeDefined();
  });

  it("should include shop_id in URL query parameters", async () => {
    /**
     * **Validates: Requirement 1.2**
     * 
     * Test that shop_id is correctly included in the API request URL.
     */
    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    const request = capturedRequests[0];
    const url = new URL(request.url);
    
    // Verify shop_id is in query parameters
    expect(url.searchParams.has("shop_id")).toBe(true);
    expect(url.searchParams.get("shop_id")).toBe(String(shopId));
  });

  it("should return pickup parameters when available", async () => {
    /**
     * **Validates: Requirement 1.2**
     * 
     * Test that the function correctly returns pickup parameters from the API response.
     */
    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify pickup parameters are returned
    expect(result.response.pickup).toBeDefined();
    expect(result.response.pickup.address_list).toBeDefined();
    expect(result.response.pickup.address_list.length).toBeGreaterThan(0);
    
    const address = result.response.pickup.address_list[0];
    expect(address.address_id).toBeDefined();
    expect(address.time_slot_list).toBeDefined();
    expect(address.time_slot_list.length).toBeGreaterThan(0);
  });

  it("should return dropoff parameters when available", async () => {
    /**
     * **Validates: Requirement 1.2**
     * 
     * Test that the function correctly returns dropoff parameters from the API response.
     */
    // Mock response with dropoff parameters
    fetchMock = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            info_needed: {
              dropoff: ["branch_id", "sender_real_name"]
            },
            dropoff: {
              branch_list: [{
                branch_id: 456,
                region: "Jakarta",
                city: "Jakarta Pusat",
                address: "Jl. Dropoff No. 456"
              }],
              sender_real_name: "Test Sender"
            }
          }
        })
      });
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50002;
    const productLocationId = "LOC002";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify dropoff parameters are returned
    expect(result.response.dropoff).toBeDefined();
    expect(result.response.dropoff.branch_list).toBeDefined();
    expect(result.response.dropoff.branch_list.length).toBeGreaterThan(0);
    
    const branch = result.response.dropoff.branch_list[0];
    expect(branch.branch_id).toBeDefined();
    expect(result.response.dropoff.sender_real_name).toBeDefined();
  });
});

describe("getMassShippingParameter - Error Handling", () => {
  let fetchMock: any;
  let authMock: any;

  beforeEach(() => {
    // Mock getValidToken
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
  });

  it("should handle API error responses (4xx)", async () => {
    /**
     * **Validates: Requirement 1.3**
     * 
     * Test that the function correctly handles 4xx client error responses.
     */
    fetchMock = mock(() => {
      return Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({
          error: "error_param",
          message: "Invalid logistics_channel_id"
        })
      });
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 99999; // Invalid
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify error response is returned
    expect(result.error).toBeDefined();
    expect(result.message).toBeDefined();
  });

  it("should handle API error responses (5xx) with retry", async () => {
    /**
     * **Validates: Requirement 1.3**
     * 
     * Test that the function retries on 5xx server errors.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      
      if (callCount <= 2) {
        // First two calls return 5xx error
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            error: "internal_server_error",
            message: "Server error"
          })
        });
      } else {
        // Third call succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              info_needed: {
                pickup: ["address_id", "pickup_time_id"]
              },
              pickup: {
                address_list: [{
                  address_id: 123,
                  region: "Jakarta",
                  city: "Jakarta Selatan",
                  address: "Jl. Test No. 123",
                  time_slot_list: [{
                    pickup_time_id: "slot_1",
                    date: "2024-01-15",
                    time_text: "09:00-12:00"
                  }]
                }]
              }
            }
          })
        });
      }
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify retry occurred and eventually succeeded
    expect(callCount).toBe(3);
    expect(result.response).toBeDefined();
  });

  it("should fail after maximum retries on persistent 5xx errors", async () => {
    /**
     * **Validates: Requirement 1.3**
     * 
     * Test that the function fails after 3 retry attempts on persistent server errors.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({
          error: "service_unavailable",
          message: "Service temporarily unavailable"
        })
      });
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    try {
      await getMassShippingParameter(
        shopId,
        packageNumbers,
        logisticsChannelId,
        productLocationId
      );
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      // Verify retry attempts were made
      expect(callCount).toBe(3);
      expect(error.message).toContain("Server error");
    }
  });
});

describe("getMassShippingParameter - Network Error Retry", () => {
  let fetchMock: any;
  let authMock: any;

  beforeEach(() => {
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
  });

  it("should retry on network timeout errors", async () => {
    /**
     * **Validates: Requirement 1.3**
     * 
     * Test that the function retries on network timeout errors.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      
      if (callCount === 1) {
        // First call times out
        const error = new Error("Request timeout");
        error.name = "ETIMEDOUT";
        return Promise.reject(error);
      } else {
        // Second call succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              info_needed: {
                pickup: ["address_id", "pickup_time_id"]
              },
              pickup: {
                address_list: [{
                  address_id: 123,
                  region: "Jakarta",
                  city: "Jakarta Selatan",
                  address: "Jl. Test No. 123",
                  time_slot_list: [{
                    pickup_time_id: "slot_1",
                    date: "2024-01-15",
                    time_text: "09:00-12:00"
                  }]
                }]
              }
            }
          })
        });
      }
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify retry occurred and succeeded
    expect(callCount).toBe(2);
    expect(result.response).toBeDefined();
  });

  it("should retry on connection reset errors", async () => {
    /**
     * **Validates: Requirement 1.3**
     * 
     * Test that the function retries on connection reset errors.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      
      if (callCount <= 2) {
        // First two calls have connection reset
        const error = new Error("Connection reset");
        error.name = "ECONNRESET";
        return Promise.reject(error);
      } else {
        // Third call succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              info_needed: {
                pickup: ["address_id", "pickup_time_id"]
              },
              pickup: {
                address_list: [{
                  address_id: 123,
                  region: "Jakarta",
                  city: "Jakarta Selatan",
                  address: "Jl. Test No. 123",
                  time_slot_list: [{
                    pickup_time_id: "slot_1",
                    date: "2024-01-15",
                    time_text: "09:00-12:00"
                  }]
                }]
              }
            }
          })
        });
      }
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify retry occurred and succeeded
    expect(callCount).toBe(3);
    expect(result.response).toBeDefined();
  });

  it("should fail after maximum retries on persistent network errors", async () => {
    /**
     * **Validates: Requirement 1.3**
     * 
     * Test that the function fails after 3 retry attempts on persistent network errors.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      const error = new Error("Network error");
      error.name = "ENETUNREACH";
      return Promise.reject(error);
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    try {
      await getMassShippingParameter(
        shopId,
        packageNumbers,
        logisticsChannelId,
        productLocationId
      );
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      // Verify retry attempts were made
      expect(callCount).toBe(3);
      expect(error.message).toContain("Network error");
    }
  });
});

describe("getMassShippingParameter - Auth Error Handling", () => {
  let fetchMock: any;
  let authMock: any;
  let refreshTokenMock: any;

  beforeEach(() => {
    authMock = spyOn(shopeeAuth, "getValidToken").mockResolvedValue({
      partnerId: 123456,
      partnerKey: "test-partner-key",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      shopId: 12345,
      expiresAt: new Date(Date.now() + 3600000)
    });

    refreshTokenMock = spyOn(shopeeAuth, "refreshAccessToken").mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    authMock.mockRestore();
    refreshTokenMock.mockRestore();
  });

  it("should detect auth errors and trigger token refresh", async () => {
    /**
     * **Validates: Requirement 1.4**
     * 
     * Test that the function detects authentication errors and triggers token refresh.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      
      if (callCount === 1) {
        // First call returns auth error
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({
            error: "error_auth",
            message: "Invalid access token"
          })
        });
      } else {
        // Second call (after refresh) succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              info_needed: {
                pickup: ["address_id", "pickup_time_id"]
              },
              pickup: {
                address_list: [{
                  address_id: 123,
                  region: "Jakarta",
                  city: "Jakarta Selatan",
                  address: "Jl. Test No. 123",
                  time_slot_list: [{
                    pickup_time_id: "slot_1",
                    date: "2024-01-15",
                    time_text: "09:00-12:00"
                  }]
                }]
              }
            }
          })
        });
      }
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify token refresh was triggered
    expect(refreshTokenMock).toHaveBeenCalled();
    
    // Verify retry occurred and succeeded
    expect(callCount).toBe(2);
    expect(result.response).toBeDefined();
  });

  it("should handle token expired error in response body", async () => {
    /**
     * **Validates: Requirement 1.4**
     * 
     * Test that the function detects auth errors in 200 response body.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      
      if (callCount === 1) {
        // First call returns 200 but with auth error in body
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            error: "error_auth",
            message: "Access token expired"
          })
        });
      } else {
        // Second call (after refresh) succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              info_needed: {
                pickup: ["address_id", "pickup_time_id"]
              },
              pickup: {
                address_list: [{
                  address_id: 123,
                  region: "Jakarta",
                  city: "Jakarta Selatan",
                  address: "Jl. Test No. 123",
                  time_slot_list: [{
                    pickup_time_id: "slot_1",
                    date: "2024-01-15",
                    time_text: "09:00-12:00"
                  }]
                }]
              }
            }
          })
        });
      }
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify token refresh was triggered
    expect(refreshTokenMock).toHaveBeenCalled();
    
    // Verify retry occurred and succeeded
    expect(callCount).toBe(2);
    expect(result.response).toBeDefined();
  });

  it("should handle invalid timestamp auth error", async () => {
    /**
     * **Validates: Requirement 1.4**
     * 
     * Test that the function detects invalid timestamp auth errors.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      
      if (callCount === 1) {
        // First call returns invalid timestamp error
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            error: "error_param",
            message: "invalid timestamp"
          })
        });
      } else {
        // Second call (after refresh) succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              info_needed: {
                pickup: ["address_id", "pickup_time_id"]
              },
              pickup: {
                address_list: [{
                  address_id: 123,
                  region: "Jakarta",
                  city: "Jakarta Selatan",
                  address: "Jl. Test No. 123",
                  time_slot_list: [{
                    pickup_time_id: "slot_1",
                    date: "2024-01-15",
                    time_text: "09:00-12:00"
                  }]
                }]
              }
            }
          })
        });
      }
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify token refresh was triggered
    expect(refreshTokenMock).toHaveBeenCalled();
    
    // Verify retry occurred and succeeded
    expect(callCount).toBe(2);
    expect(result.response).toBeDefined();
  });

  it("should not retry auth errors more than once", async () => {
    /**
     * **Validates: Requirement 1.4**
     * 
     * Test that the function only retries auth errors once to prevent infinite loops.
     */
    let callCount = 0;
    
    fetchMock = mock(() => {
      callCount++;
      // Always return auth error
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({
          error: "error_auth",
          message: "Invalid credentials"
        })
      });
    });
    global.fetch = fetchMock as any;

    const shopId = 12345;
    const packageNumbers = ["PKG001"];
    const logisticsChannelId = 50001;
    const productLocationId = "LOC001";

    const result = await getMassShippingParameter(
      shopId,
      packageNumbers,
      logisticsChannelId,
      productLocationId
    );

    // Verify only 2 calls were made (initial + 1 retry after refresh)
    expect(callCount).toBe(2);
    
    // Verify token refresh was triggered once
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);
    
    // Verify error response is returned
    expect(result.error).toBeDefined();
  });
});
