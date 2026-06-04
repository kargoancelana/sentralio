import { describe, it, expect } from "bun:test";
import { formatShopeeDate, parseShopeeDate } from "../shopee-ads";

/**
 * Unit tests for Shopee Ads date conversion functions
 * 
 * These tests verify the basic functionality of formatShopeeDate and parseShopeeDate
 * before the comprehensive property-based tests are implemented.
 */

describe("formatShopeeDate", () => {
  it("should convert valid YYYY-MM-DD to DD-MM-YYYY", () => {
    expect(formatShopeeDate("2024-03-15")).toBe("15-03-2024");
    expect(formatShopeeDate("2023-12-31")).toBe("31-12-2023");
    expect(formatShopeeDate("2024-01-01")).toBe("01-01-2024");
  });

  it("should handle leap year dates correctly", () => {
    expect(formatShopeeDate("2024-02-29")).toBe("29-02-2024"); // 2024 is a leap year
    expect(formatShopeeDate("2020-02-29")).toBe("29-02-2020"); // 2020 is a leap year
  });

  it("should reject invalid leap year dates", () => {
    expect(() => formatShopeeDate("2023-02-29")).toThrow(); // 2023 is not a leap year
    expect(() => formatShopeeDate("2021-02-29")).toThrow(); // 2021 is not a leap year
  });

  it("should reject null, undefined, or empty input", () => {
    expect(() => formatShopeeDate(null as any)).toThrow("null, undefined, or empty");
    expect(() => formatShopeeDate(undefined as any)).toThrow("null, undefined, or empty");
    expect(() => formatShopeeDate("")).toThrow("null, undefined, or empty");
  });

  it("should reject wrong format", () => {
    expect(() => formatShopeeDate("15-03-2024")).toThrow("does not match expected format YYYY-MM-DD");
    expect(() => formatShopeeDate("2024/03/15")).toThrow("does not match expected format YYYY-MM-DD");
    expect(() => formatShopeeDate("20240315")).toThrow("does not match expected format YYYY-MM-DD");
  });

  it("should reject invalid calendar dates", () => {
    expect(() => formatShopeeDate("2024-02-31")).toThrow("does not represent a real Gregorian calendar date");
    expect(() => formatShopeeDate("2024-13-01")).toThrow("month 13 is out of range");
    expect(() => formatShopeeDate("2024-00-01")).toThrow("month 0 is out of range");
    expect(() => formatShopeeDate("2024-01-32")).toThrow("day 32 is out of range");
    expect(() => formatShopeeDate("2024-01-00")).toThrow("day 0 is out of range");
    expect(() => formatShopeeDate("2024-04-31")).toThrow("does not represent a real Gregorian calendar date"); // April has 30 days
  });

  it("should reject dates with zero components", () => {
    expect(() => formatShopeeDate("0000-01-01")).toThrow("year, month, or day is zero");
    expect(() => formatShopeeDate("2024-00-01")).toThrow("month 0 is out of range");
    expect(() => formatShopeeDate("2024-01-00")).toThrow("day 0 is out of range");
  });
});

describe("parseShopeeDate", () => {
  it("should convert valid DD-MM-YYYY to YYYY-MM-DD", () => {
    expect(parseShopeeDate("15-03-2024")).toBe("2024-03-15");
    expect(parseShopeeDate("31-12-2023")).toBe("2023-12-31");
    expect(parseShopeeDate("01-01-2024")).toBe("2024-01-01");
  });

  it("should handle leap year dates correctly", () => {
    expect(parseShopeeDate("29-02-2024")).toBe("2024-02-29"); // 2024 is a leap year
    expect(parseShopeeDate("29-02-2020")).toBe("2020-02-29"); // 2020 is a leap year
  });

  it("should reject invalid leap year dates", () => {
    expect(() => parseShopeeDate("29-02-2023")).toThrow(); // 2023 is not a leap year
    expect(() => parseShopeeDate("29-02-2021")).toThrow(); // 2021 is not a leap year
  });

  it("should reject null, undefined, or empty input", () => {
    expect(() => parseShopeeDate(null as any)).toThrow("null, undefined, or empty");
    expect(() => parseShopeeDate(undefined as any)).toThrow("null, undefined, or empty");
    expect(() => parseShopeeDate("")).toThrow("null, undefined, or empty");
  });

  it("should reject wrong format", () => {
    expect(() => parseShopeeDate("2024-03-15")).toThrow("does not match expected format DD-MM-YYYY");
    expect(() => parseShopeeDate("2024/03/15")).toThrow("does not match expected format DD-MM-YYYY");
    expect(() => parseShopeeDate("20240315")).toThrow("does not match expected format DD-MM-YYYY");
  });

  it("should reject invalid calendar dates", () => {
    expect(() => parseShopeeDate("31-02-2024")).toThrow("does not represent a real Gregorian calendar date");
    expect(() => parseShopeeDate("01-13-2024")).toThrow("month 13 is out of range");
    expect(() => parseShopeeDate("01-00-2024")).toThrow("month 0 is out of range");
    expect(() => parseShopeeDate("32-01-2024")).toThrow("day 32 is out of range");
    expect(() => parseShopeeDate("00-01-2024")).toThrow("day 0 is out of range");
    expect(() => parseShopeeDate("31-04-2024")).toThrow("does not represent a real Gregorian calendar date"); // April has 30 days
  });

  it("should reject dates with zero components", () => {
    expect(() => parseShopeeDate("01-01-0000")).toThrow("year, month, or day is zero");
    expect(() => parseShopeeDate("01-00-2024")).toThrow("month 0 is out of range");
    expect(() => parseShopeeDate("00-01-2024")).toThrow("day 0 is out of range");
  });
});

describe("Round-trip conversion", () => {
  it("should maintain identity for forward round-trip (WibDate -> Shopee -> WibDate)", () => {
    const testDates = [
      "2024-03-15",
      "2023-12-31",
      "2024-01-01",
      "2024-02-29", // leap year
      "2023-02-28", // non-leap year
      "2024-06-30",
      "2024-07-31",
    ];

    for (const wibDate of testDates) {
      const shopeeDate = formatShopeeDate(wibDate);
      const backToWib = parseShopeeDate(shopeeDate);
      expect(backToWib).toBe(wibDate);
    }
  });

  it("should maintain identity for reverse round-trip (Shopee -> WibDate -> Shopee)", () => {
    const testDates = [
      "15-03-2024",
      "31-12-2023",
      "01-01-2024",
      "29-02-2024", // leap year
      "28-02-2023", // non-leap year
      "30-06-2024",
      "31-07-2024",
    ];

    for (const shopeeDate of testDates) {
      const wibDate = parseShopeeDate(shopeeDate);
      const backToShopee = formatShopeeDate(wibDate);
      expect(backToShopee).toBe(shopeeDate);
    }
  });
});
