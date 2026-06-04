import { describe, it, expect, mock } from "bun:test";
import {
  getCpcAdsHourlyPerformance,
  getCpcAdsDailyPerformance,
  type ShopeeAdsApiSuccess,
  type ShopeeAdsApiError,
} from "../shopee-ads";

/**
 * Unit tests for Shopee Ads API wrapper functions
 * 
 * These tests verify response normalization, error mapping, and basic functionality
 * of getCpcAdsHourlyPerformance and getCpcAdsDailyPerformance.
 * 
 * Note: These are unit tests with mocked shopeeRequest. Integration tests with
 * real API calls would be in a separate file.
 */

// Mock shopeeRequest to avoid actual API calls
const mockShopeeRequest = mock();

// Replace the import with our mock
mock.module("../shopee-raw", () => ({
  shopeeRequest: mockShopeeRequest,
}));

describe("getCpcAdsHourlyPerformance", () => {
  it("should sum hourly expenses and return map with single date key", async () => {
    // Mock successful response with multiple hourly entries
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { hour: 0, expense: 1500.5 },
        { hour: 1, expense: 2300.7 },
        { hour: 2, expense: 1800.3 },
      ],
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const data = result.data;
      expect(data.expensesByDate.size).toBe(1);
      expect(data.expensesByDate.has("2024-03-15")).toBe(true);
      
      // Sum: 1500.5 + 2300.7 + 1800.3 = 5601.5, rounded = 5602
      expect(data.expensesByDate.get("2024-03-15")).toBe(5602);
    }
  });

  it("should treat missing hours as 0 expense", async () => {
    // Mock response with only a few hours (not all 24)
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { hour: 0, expense: 1000 },
        { hour: 5, expense: 2000 },
      ],
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // Only sum the returned hours: 1000 + 2000 = 3000
      expect(result.data.expensesByDate.get("2024-03-15")).toBe(3000);
    }
  });

  it("should apply Math.round and clamp to >= 0", async () => {
    // Test rounding
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { hour: 0, expense: 1500.4 }, // rounds down
        { hour: 1, expense: 1500.6 }, // rounds up
      ],
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // 1500.4 + 1500.6 = 3001.0, rounded = 3001
      expect(result.data.expensesByDate.get("2024-03-15")).toBe(3001);
    }
  });

  it("should clamp negative values to 0", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { hour: 0, expense: -100 },
        { hour: 1, expense: 50 },
      ],
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // -100 + 50 = -50, rounded = -50, clamped = 0
      expect(result.data.expensesByDate.get("2024-03-15")).toBe(0);
    }
  });

  it("should return error for Shopee API error response", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      error: "ads.performance.error_date_too_old",
      message: "Date is too old",
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2020-01-01");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("ads.performance.error_date_too_old");
      expect(result.message).toBe("Date is too old");
    }
  });

  it("should handle rate limit errors", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      error: "error_rate_limit",
      message: "Rate limit exceeded",
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("error_rate_limit");
    }
  });

  it("should handle network errors", async () => {
    mockShopeeRequest.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("network_error");
      expect(result.message).toContain("Network timeout");
    }
  });

  it("should handle empty response array", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: [],
    });

    const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data.expensesByDate.get("2024-03-15")).toBe(0);
    }
  });
});

describe("getCpcAdsDailyPerformance", () => {
  it("should parse dates and build expense map", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { date: "15-03-2024", expense: 5000 },
        { date: "16-03-2024", expense: 6000 },
        { date: "17-03-2024", expense: 7000 },
      ],
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const data = result.data;
      expect(data.expensesByDate.size).toBe(3);
      expect(data.expensesByDate.get("2024-03-15")).toBe(5000);
      expect(data.expensesByDate.get("2024-03-16")).toBe(6000);
      expect(data.expensesByDate.get("2024-03-17")).toBe(7000);
    }
  });

  it("should NOT add dates that Shopee did not return (caller treats as 0)", async () => {
    // Shopee returns only 2 out of 3 dates
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { date: "15-03-2024", expense: 5000 },
        { date: "17-03-2024", expense: 7000 },
        // 16-03-2024 is missing
      ],
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const data = result.data;
      expect(data.expensesByDate.size).toBe(2);
      expect(data.expensesByDate.has("2024-03-15")).toBe(true);
      expect(data.expensesByDate.has("2024-03-16")).toBe(false); // NOT in map
      expect(data.expensesByDate.has("2024-03-17")).toBe(true);
    }
  });

  it("should apply Math.round and clamp to >= 0 per date", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { date: "15-03-2024", expense: 5000.4 }, // rounds down
        { date: "16-03-2024", expense: 6000.6 }, // rounds up
        { date: "17-03-2024", expense: -100 },   // clamps to 0
      ],
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data.expensesByDate.get("2024-03-15")).toBe(5000);
      expect(result.data.expensesByDate.get("2024-03-16")).toBe(6001);
      expect(result.data.expensesByDate.get("2024-03-17")).toBe(0);
    }
  });

  it("should return error for Shopee API error response", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      error: "ads.performance.error_same_start_end_dates",
      message: "Start and end dates cannot be the same",
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-15");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("ads.performance.error_same_start_end_dates");
    }
  });

  it("should handle error_not_found", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      error: "error_not_found",
      message: "No ad data found for this shop",
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("error_not_found");
    }
  });

  it("should handle network errors", async () => {
    mockShopeeRequest.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.errorCode).toBe("network_error");
      expect(result.message).toContain("Connection refused");
    }
  });

  it("should handle empty response array", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: [],
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data.expensesByDate.size).toBe(0);
    }
  });

  it("should warn about unexpected dates outside requested range", async () => {
    // Mock console.warn to capture warnings
    const originalWarn = console.warn;
    const warnings: any[] = [];
    console.warn = (...args: any[]) => warnings.push(args);

    mockShopeeRequest.mockResolvedValueOnce({
      response: [
        { date: "15-03-2024", expense: 5000 },
        { date: "16-03-2024", expense: 6000 },
        { date: "20-03-2024", expense: 9000 }, // Outside requested range
      ],
    });

    const result = await getCpcAdsDailyPerformance(123456, "2024-03-15", "2024-03-17");

    // Restore console.warn
    console.warn = originalWarn;

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // All dates should be in the map (we don't filter them out)
      expect(result.data.expensesByDate.size).toBe(3);
      expect(result.data.unexpectedDates).toContain("2024-03-20");
    }

    // Check that warning was logged
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0][0]).toContain("unexpected dates");
  });
});

describe("Error code mapping", () => {
  const errorCodes = [
    "error_rate_limit",
    "ads.rate_limit.exceed_partner_api",
    "ads.rate_limit.exceed_shop_api",
    "ads.rate_limit.exceed_api",
    "error_not_found",
    "ads.performance.error_date_too_old",
    "ads.performance.error_same_start_end_dates",
  ];

  for (const errorCode of errorCodes) {
    it(`should map ${errorCode} correctly`, async () => {
      mockShopeeRequest.mockResolvedValueOnce({
        error: errorCode,
        message: `Test message for ${errorCode}`,
      });

      const result = await getCpcAdsHourlyPerformance(123456, "2024-03-15");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.errorCode).toBe(errorCode);
      }
    });
  }
});
