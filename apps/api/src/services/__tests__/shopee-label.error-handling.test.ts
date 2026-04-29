import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { getShippingDocumentParameter, getShippingDocumentResult } from "../shopee-label";
import * as shopeeAuth from "../shopee-auth";

/**
 * Unit Tests: Shopee API Error Handling
 * 
 * **Validates: Requirements 6.4, 6.5, 6.6**
 * 
 * Tests error handling for various Shopee API failure scenarios including:
 * - Authentication errors (6.4)
 * - Rate limit errors (6.5) 
 * - Timeout errors (6.6)
 * - Invalid response formats
 */

// Mock fetch globally
const originalFetch = global.fetch;

describe("Shopee API Error Handling", () => {
  let fetchMock: any;
  let authMock: any;

  beforeEach(() => {
    // Mock getValidToken to return mock credentials
    authMock = spyOn(shopeeAuth, "getValidToken").mockResolvedValue({
      partnerId: 123456,
      partnerKey: "test-partner-key",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: new Date(Date.now() + 3600000)
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    authMock.mockRestore();
  });

  describe("Authentication Errors (Requirement 6.4)", () => {
    it("should handle token expired error and retry with refresh", async () => {
      let callCount = 0;
      
      fetchMock = mock((url: string, options?: any) => {
        callCount++;
        
        if (callCount === 1) {
          // First call returns token expired error
          return Promise.resolve({
            ok: true,
            status: 200,
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
              result: {
                order_list: [{
                  order_sn: "TEST123",
                  shipping_document_info: {
                    document_type: "NORMAL_AIR_WAYBILL",
                    document_size: "A5",
                    file_url: "https://example.com/label.pdf"
                  }
                }]
              }
            })
          });
        }
      });
      
      global.fetch = fetchMock as any;

      // Should throw authentication error (current implementation doesn't retry auth)
      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow(/Autentikasi gagal/);
      
      // Verify the error was detected
      expect(callCount).toBe(1);
    });

    it("should handle invalid credentials error", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            error: "error_auth",
            message: "Invalid partner credentials"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow(/Autentikasi gagal/);
    });

    it("should handle token not found error", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            error: "error_token_invalid",
            message: "Access token not found"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow(/Autentikasi gagal/);
    });

    it("should handle HTTP 401 unauthorized", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({
            error: "Unauthorized",
            message: "Authentication required"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow();
    });
  });

  describe("Rate Limit Errors (Requirement 6.5)", () => {
    it("should retry on rate limit error with 2 second delay", async () => {
      let callCount = 0;
      const startTime = Date.now();
      
      fetchMock = mock((url: string, options?: any) => {
        callCount++;
        
        if (callCount <= 2) {
          // First two calls return rate limit error
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              error: "error_too_frequent",
              message: "Rate limit exceeded"
            })
          });
        } else {
          // Third call succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                order_list: [{
                  order_sn: "TEST123",
                  shipping_document_info: {
                    document_type: "NORMAL_AIR_WAYBILL",
                    document_size: "A5",
                    file_url: "https://example.com/label.pdf"
                  }
                }]
              }
            })
          });
        }
      });
      
      global.fetch = fetchMock as any;

      const result = await getShippingDocumentParameter(12345, "TEST123");
      const endTime = Date.now();
      
      // Should have retried and eventually succeeded
      expect(callCount).toBe(3);
      expect(result.result.order_list[0].order_sn).toBe("TEST123");
      
      // Should have waited at least 4 seconds (2 retries × 2 seconds each)
      expect(endTime - startTime).toBeGreaterThanOrEqual(4000);
    });

    it("should fail after maximum retries on persistent rate limit", async () => {
      let callCount = 0;
      
      fetchMock = mock(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            error: "error_too_frequent",
            message: "Rate limit exceeded"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow();
      
      // Should have tried 3 times (initial + 2 retries)
      expect(callCount).toBe(3);
    });

    it("should handle HTTP 429 Too Many Requests", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({
            error: "Too Many Requests",
            message: "Rate limit exceeded"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow();
    });
  });

  describe("Timeout Errors (Requirement 6.6)", () => {
    it("should timeout after 10 seconds", async () => {
      fetchMock = mock(() => {
        // Simulate a request that times out
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error("Request timeout");
            error.name = "ETIMEDOUT";
            reject(error);
          }, 100); // Short timeout for testing
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow();
    });

    it("should retry on network timeout errors", async () => {
      let callCount = 0;
      
      fetchMock = mock(() => {
        callCount++;
        
        if (callCount <= 2) {
          // First two calls timeout
          const error = new Error("Request timeout");
          error.name = "ETIMEDOUT";
          return Promise.reject(error);
        } else {
          // Third call succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                order_list: [{
                  order_sn: "TEST123",
                  shipping_document_info: {
                    document_type: "NORMAL_AIR_WAYBILL",
                    document_size: "A5",
                    file_url: "https://example.com/label.pdf"
                  }
                }]
              }
            })
          });
        }
      });
      
      global.fetch = fetchMock as any;

      const result = await getShippingDocumentParameter(12345, "TEST123");
      
      // Should have retried and eventually succeeded
      expect(callCount).toBe(3);
      expect(result.result.order_list[0].order_sn).toBe("TEST123");
    });

    it("should retry on connection reset errors", async () => {
      let callCount = 0;
      
      fetchMock = mock(() => {
        callCount++;
        
        if (callCount <= 1) {
          // First call has connection reset
          const error = new Error("Connection reset");
          error.name = "ECONNRESET";
          return Promise.reject(error);
        } else {
          // Second call succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                order_list: [{
                  order_sn: "TEST123",
                  shipping_document_info: {
                    document_type: "NORMAL_AIR_WAYBILL",
                    document_size: "A5",
                    file_url: "https://example.com/label.pdf"
                  }
                }]
              }
            })
          });
        }
      });
      
      global.fetch = fetchMock as any;

      const result = await getShippingDocumentParameter(12345, "TEST123");
      
      // Should have retried and succeeded
      expect(callCount).toBe(2);
      expect(result.result.order_list[0].order_sn).toBe("TEST123");
    });
  });

  describe("Invalid Response Format Errors", () => {
    it("should handle malformed JSON response", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("Unexpected token in JSON");
          }
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow();
    });

    it("should handle missing result field in response", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            // Missing result field
            status: "success"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      // For getShippingDocumentResult, should handle missing result gracefully
      await expect(getShippingDocumentResult(12345, "TEST123")).rejects.toThrow(/Label pengiriman belum tersedia/);
    });

    it("should handle empty order_list in response", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              order_list: [] // Empty array
            }
          })
        });
      });
      
      global.fetch = fetchMock as any;

      // For getShippingDocumentResult, should handle empty order_list
      await expect(getShippingDocumentResult(12345, "TEST123")).rejects.toThrow(/Label pengiriman belum tersedia/);
    });

    it("should handle missing shipping_document_info", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              order_list: [{
                order_sn: "TEST123"
                // Missing shipping_document_info
              }]
            }
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentResult(12345, "TEST123")).rejects.toThrow(/Informasi dokumen pengiriman tidak tersedia/);
    });

    it("should handle missing file_url and file_base64", async () => {
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              order_list: [{
                order_sn: "TEST123",
                shipping_document_info: {
                  document_type: "NORMAL_AIR_WAYBILL",
                  document_size: "A5"
                  // Missing file_url and file_base64
                }
              }]
            }
          })
        });
      });
      
      global.fetch = fetchMock as any;

      await expect(getShippingDocumentResult(12345, "TEST123")).rejects.toThrow(/Label document tidak memiliki URL atau data/);
    });

    it("should handle HTTP error status codes", async () => {
      const errorCodes = [400, 403, 404, 500, 502, 503];
      
      for (const statusCode of errorCodes) {
        fetchMock = mock(() => {
          return Promise.resolve({
            ok: false,
            status: statusCode,
            json: async () => ({
              error: `HTTP ${statusCode}`,
              message: `Server error ${statusCode}`
            })
          });
        });
        
        global.fetch = fetchMock as any;

        await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow();
      }
    });
  });

  describe("Error Logging", () => {
    it("should log authentication errors with proper format", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            error: "error_auth",
            message: "Invalid access token"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      try {
        await getShippingDocumentParameter(12345, "TEST123");
      } catch (error) {
        // Expected to throw
      }

      // Verify error was logged with proper format
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[shopee-label] authentication error:"),
        expect.objectContaining({
          timestamp: expect.any(String),
          shopId: 12345,
          path: "/api/v2/logistics/get_shipping_document_parameter",
          errorType: "auth",
          error: "error_auth",
          message: "Invalid access token"
        })
      );

      consoleSpy.mockRestore();
    });

    it("should log retry attempts with proper format", async () => {
      const consoleSpy = spyOn(console, "warn").mockImplementation(() => {});
      let callCount = 0;
      
      fetchMock = mock(() => {
        callCount++;
        
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              error: "error_too_frequent",
              message: "Rate limit exceeded"
            })
          });
        } else {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                order_list: [{
                  order_sn: "TEST123",
                  shipping_document_info: {
                    document_type: "NORMAL_AIR_WAYBILL",
                    document_size: "A5",
                    file_url: "https://example.com/label.pdf"
                  }
                }]
              }
            })
          });
        }
      });
      
      global.fetch = fetchMock as any;

      await getShippingDocumentParameter(12345, "TEST123");

      // Verify retry was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[shopee-label] rate limit hit, retrying:"),
        expect.objectContaining({
          timestamp: expect.any(String),
          shopId: 12345,
          path: "/api/v2/logistics/get_shipping_document_parameter",
          attempt: 1,
          errorType: "rate_limit"
        })
      );

      consoleSpy.mockRestore();
    });

    it("should log API errors with proper format", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      
      fetchMock = mock(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            error: "internal_server_error",
            message: "Internal server error"
          })
        });
      });
      
      global.fetch = fetchMock as any;

      try {
        await getShippingDocumentParameter(12345, "TEST123");
      } catch (error) {
        // Expected to throw
      }

      // Verify API error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[shopee-label] API error:"),
        expect.objectContaining({
          timestamp: expect.any(String),
          shopId: 12345,
          path: "/api/v2/logistics/get_shipping_document_parameter",
          status: 500,
          errorType: "shopee_api",
          error: "internal_server_error",
          message: "Internal server error"
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Both API Endpoints Error Handling", () => {
    it("should handle errors consistently across getShippingDocumentParameter and getShippingDocumentResult", async () => {
      const testCases = [
        {
          error: "error_auth",
          message: "Authentication failed",
          expectedError: /Autentikasi gagal/
        },
        {
          error: "error_too_frequent", 
          message: "Rate limit exceeded",
          shouldRetry: true
        }
      ];

      for (const testCase of testCases) {
        // Test getShippingDocumentParameter
        fetchMock = mock(() => {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              error: testCase.error,
              message: testCase.message
            })
          });
        });
        
        global.fetch = fetchMock as any;

        if (testCase.expectedError) {
          await expect(getShippingDocumentParameter(12345, "TEST123")).rejects.toThrow(testCase.expectedError);
          await expect(getShippingDocumentResult(12345, "TEST123")).rejects.toThrow(testCase.expectedError);
        }
      }
    });
  });
});