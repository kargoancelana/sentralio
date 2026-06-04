import { describe, it, expect } from "bun:test";
import {
  classifyDates,
  groupContiguous,
  TODAY_CACHE_TTL_MS,
  DAILY_API_MAX_RANGE_DAYS,
  SIX_MONTHS_BACK,
  RATE_LIMIT_RETRY_WAIT_MS,
  RATE_LIMIT_ERRORS,
  type DateRange,
  type CacheRow,
} from "../ads-expense.service";

/**
 * Unit tests for ads-expense.service.ts helper functions
 * 
 * Tests classifyDates and groupContiguous functions
 */

describe("Domain Constants", () => {
  it("should export correct constant values", () => {
    expect(TODAY_CACHE_TTL_MS).toBe(15 * 60 * 1000);
    expect(DAILY_API_MAX_RANGE_DAYS).toBe(30);
    expect(SIX_MONTHS_BACK).toBe(6);
    expect(RATE_LIMIT_RETRY_WAIT_MS).toBe(60_000);
    expect(RATE_LIMIT_ERRORS.size).toBe(4);
    expect(RATE_LIMIT_ERRORS.has("error_rate_limit")).toBe(true);
    expect(RATE_LIMIT_ERRORS.has("ads.rate_limit.exceed_partner_api")).toBe(true);
    expect(RATE_LIMIT_ERRORS.has("ads.rate_limit.exceed_shop_api")).toBe(true);
    expect(RATE_LIMIT_ERRORS.has("ads.rate_limit.exceed_api")).toBe(true);
  });
});

describe("classifyDates", () => {
  it("should classify dates beyond cutoff", () => {
    const range: DateRange = { startDate: "2023-01-01", endDate: "2023-01-03" };
    const cacheRows: CacheRow[] = [];
    const now = new Date("2024-01-15T12:00:00Z");
    const sixMonthCutoff = "2023-07-15";
    const todayWib = "2024-01-15";

    const result = classifyDates(range, cacheRows, now, sixMonthCutoff, TODAY_CACHE_TTL_MS, todayWib);

    expect(result.beyondCutoffDates).toEqual(["2023-01-01", "2023-01-02", "2023-01-03"]);
    expect(result.freshDates).toEqual([]);
    expect(result.needFetchDates).toEqual([]);
  });

  it("should classify missing dates as needFetch", () => {
    const range: DateRange = { startDate: "2024-01-01", endDate: "2024-01-03" };
    const cacheRows: CacheRow[] = [];
    const now = new Date("2024-01-15T12:00:00Z");
    const sixMonthCutoff = "2023-07-15";
    const todayWib = "2024-01-15";

    const result = classifyDates(range, cacheRows, now, sixMonthCutoff, TODAY_CACHE_TTL_MS, todayWib);

    expect(result.beyondCutoffDates).toEqual([]);
    expect(result.freshDates).toEqual([]);
    expect(result.needFetchDates).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("should classify cached non-today dates as fresh", () => {
    const range: DateRange = { startDate: "2024-01-01", endDate: "2024-01-03" };
    const cacheRows: CacheRow[] = [
      { date: "2024-01-01", expense: 100, fetchedAt: new Date("2024-01-01T10:00:00Z") },
      { date: "2024-01-02", expense: 200, fetchedAt: new Date("2024-01-02T10:00:00Z") },
    ];
    const now = new Date("2024-01-15T12:00:00Z");
    const sixMonthCutoff = "2023-07-15";
    const todayWib = "2024-01-15";

    const result = classifyDates(range, cacheRows, now, sixMonthCutoff, TODAY_CACHE_TTL_MS, todayWib);

    expect(result.beyondCutoffDates).toEqual([]);
    expect(result.freshDates).toEqual(["2024-01-01", "2024-01-02"]);
    expect(result.needFetchDates).toEqual(["2024-01-03"]);
  });

  it("should classify today with fresh TTL as fresh", () => {
    const range: DateRange = { startDate: "2024-01-15", endDate: "2024-01-15" };
    const cacheRows: CacheRow[] = [
      { date: "2024-01-15", expense: 100, fetchedAt: new Date("2024-01-15T12:00:00Z") },
    ];
    const now = new Date("2024-01-15T12:10:00Z"); // 10 minutes later
    const sixMonthCutoff = "2023-07-15";
    const todayWib = "2024-01-15";

    const result = classifyDates(range, cacheRows, now, sixMonthCutoff, TODAY_CACHE_TTL_MS, todayWib);

    expect(result.beyondCutoffDates).toEqual([]);
    expect(result.freshDates).toEqual(["2024-01-15"]);
    expect(result.needFetchDates).toEqual([]);
  });

  it("should classify today with expired TTL as needFetch", () => {
    const range: DateRange = { startDate: "2024-01-15", endDate: "2024-01-15" };
    const cacheRows: CacheRow[] = [
      { date: "2024-01-15", expense: 100, fetchedAt: new Date("2024-01-15T12:00:00Z") },
    ];
    const now = new Date("2024-01-15T12:20:00Z"); // 20 minutes later (> 15 min TTL)
    const sixMonthCutoff = "2023-07-15";
    const todayWib = "2024-01-15";

    const result = classifyDates(range, cacheRows, now, sixMonthCutoff, TODAY_CACHE_TTL_MS, todayWib);

    expect(result.beyondCutoffDates).toEqual([]);
    expect(result.freshDates).toEqual([]);
    expect(result.needFetchDates).toEqual(["2024-01-15"]);
  });

  it("should throw on invalid inputs", () => {
    const validRange: DateRange = { startDate: "2024-01-01", endDate: "2024-01-03" };
    const validCacheRows: CacheRow[] = [];
    const validNow = new Date("2024-01-15T12:00:00Z");
    const validCutoff = "2023-07-15";
    const validTodayWib = "2024-01-15";

    expect(() => classifyDates(null as any, validCacheRows, validNow, validCutoff, TODAY_CACHE_TTL_MS, validTodayWib)).toThrow();
    expect(() => classifyDates(validRange, null as any, validNow, validCutoff, TODAY_CACHE_TTL_MS, validTodayWib)).toThrow();
    expect(() => classifyDates(validRange, validCacheRows, null as any, validCutoff, TODAY_CACHE_TTL_MS, validTodayWib)).toThrow();
    expect(() => classifyDates(validRange, validCacheRows, validNow, null as any, TODAY_CACHE_TTL_MS, validTodayWib)).toThrow();
    expect(() => classifyDates(validRange, validCacheRows, validNow, validCutoff, -1, validTodayWib)).toThrow();
    expect(() => classifyDates(validRange, validCacheRows, validNow, validCutoff, TODAY_CACHE_TTL_MS, null as any)).toThrow();
  });
});

describe("groupContiguous", () => {
  it("should return empty array for empty input", () => {
    const result = groupContiguous([]);
    expect(result).toEqual([]);
  });

  it("should return single span for single date", () => {
    const result = groupContiguous(["2024-01-01"]);
    expect(result).toEqual([{ startDate: "2024-01-01", endDate: "2024-01-01" }]);
  });

  it("should return single span for contiguous dates", () => {
    const result = groupContiguous(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(result).toEqual([{ startDate: "2024-01-01", endDate: "2024-01-03" }]);
  });

  it("should split non-contiguous dates into multiple spans", () => {
    const result = groupContiguous(["2024-01-01", "2024-01-02", "2024-01-05", "2024-01-06"]);
    expect(result).toEqual([
      { startDate: "2024-01-01", endDate: "2024-01-02" },
      { startDate: "2024-01-05", endDate: "2024-01-06" },
    ]);
  });

  it("should handle multiple gaps", () => {
    const result = groupContiguous(["2024-01-01", "2024-01-03", "2024-01-05", "2024-01-07"]);
    expect(result).toEqual([
      { startDate: "2024-01-01", endDate: "2024-01-01" },
      { startDate: "2024-01-03", endDate: "2024-01-03" },
      { startDate: "2024-01-05", endDate: "2024-01-05" },
      { startDate: "2024-01-07", endDate: "2024-01-07" },
    ]);
  });

  it("should throw on invalid inputs", () => {
    expect(() => groupContiguous(null as any)).toThrow("dates must be an array");
    expect(() => groupContiguous(["2024-01-01", "invalid"])).toThrow();
    expect(() => groupContiguous(["2024-01-01", "2024-01-01"])).toThrow("duplicate");
    expect(() => groupContiguous(["2024-01-02", "2024-01-01"])).toThrow("sorted ascending");
  });
});
