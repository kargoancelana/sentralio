/**
 * Shopee Ads API Wrapper
 * 
 * This module provides date conversion utilities and API wrappers for Shopee Ads endpoints.
 * All dates are handled as WIB (Asia/Jakarta timezone) in YYYY-MM-DD format internally,
 * and converted to/from Shopee's DD-MM-YYYY format at the API boundary.
 */

import { shopeeRequest } from './shopee-raw';

/** WIB calendar date dalam bentuk string "YYYY-MM-DD". */
export type WibDate = string;

/** Format tanggal yang dipakai Shopee Ads API: string "DD-MM-YYYY". */
export type ShopeeDateString = string;

/**
 * Convert WibDate (YYYY-MM-DD) to Shopee format (DD-MM-YYYY).
 * 
 * Validates that:
 * - Input is not null/undefined/empty
 * - Input matches YYYY-MM-DD format syntax
 * - Input represents a real Gregorian calendar date (leap-year aware)
 * 
 * @param d - WibDate string in YYYY-MM-DD format
 * @returns Shopee date string in DD-MM-YYYY format
 * @throws Error if input is invalid or does not represent a real calendar date
 * 
 * @example
 * formatShopeeDate("2024-03-15") // returns "15-03-2024"
 * formatShopeeDate("2024-02-31") // throws Error (invalid date)
 * formatShopeeDate("31-02-2024") // throws Error (wrong format)
 */
export function formatShopeeDate(d: WibDate): ShopeeDateString {
  // Validate input is not null/undefined/empty
  if (d == null || d === "") {
    throw new Error("formatShopeeDate: input is null, undefined, or empty");
  }

  // Validate format syntax: YYYY-MM-DD
  const wibPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = wibPattern.exec(d);
  
  if (!match) {
    throw new Error(
      `formatShopeeDate: input "${d}" does not match expected format YYYY-MM-DD`
    );
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Validate calendar date components
  if (month < 1 || month > 12) {
    throw new Error(
      `formatShopeeDate: month ${month} is out of range (must be 1-12) in "${d}"`
    );
  }

  if (day < 1 || day > 31) {
    throw new Error(
      `formatShopeeDate: day ${day} is out of range (must be 1-31) in "${d}"`
    );
  }

  // Special case: reject obviously invalid dates like 00-00-0000
  if (year === 0 || month === 0 || day === 0) {
    throw new Error(
      `formatShopeeDate: invalid calendar date "${d}" (year, month, or day is zero)`
    );
  }

  // Validate that the date represents a real Gregorian calendar date
  // Use Date object to check if the date is valid (handles leap years)
  const dateObj = new Date(year, month - 1, day);
  
  // Check if the Date object represents the same date we parsed
  // (Date constructor auto-corrects invalid dates, e.g., Feb 31 -> Mar 3)
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    throw new Error(
      `formatShopeeDate: "${d}" does not represent a real Gregorian calendar date`
    );
  }

  // Convert to DD-MM-YYYY format
  return `${dayStr}-${monthStr}-${yearStr}`;
}

/**
 * Parse Shopee date format (DD-MM-YYYY) to WibDate (YYYY-MM-DD).
 * 
 * Validates that:
 * - Input is not null/undefined/empty
 * - Input matches DD-MM-YYYY format syntax
 * - Input represents a real Gregorian calendar date (leap-year aware)
 * 
 * @param s - Shopee date string in DD-MM-YYYY format
 * @returns WibDate string in YYYY-MM-DD format
 * @throws Error if input is invalid or does not represent a real calendar date
 * 
 * @example
 * parseShopeeDate("15-03-2024") // returns "2024-03-15"
 * parseShopeeDate("31-02-2024") // throws Error (invalid date)
 * parseShopeeDate("2024-03-15") // throws Error (wrong format)
 */
export function parseShopeeDate(s: ShopeeDateString): WibDate {
  // Validate input is not null/undefined/empty
  if (s == null || s === "") {
    throw new Error("parseShopeeDate: input is null, undefined, or empty");
  }

  // Validate format syntax: DD-MM-YYYY
  const shopeePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = shopeePattern.exec(s);
  
  if (!match) {
    throw new Error(
      `parseShopeeDate: input "${s}" does not match expected format DD-MM-YYYY`
    );
  }

  const [, dayStr, monthStr, yearStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Validate calendar date components
  if (month < 1 || month > 12) {
    throw new Error(
      `parseShopeeDate: month ${month} is out of range (must be 1-12) in "${s}"`
    );
  }

  if (day < 1 || day > 31) {
    throw new Error(
      `parseShopeeDate: day ${day} is out of range (must be 1-31) in "${s}"`
    );
  }

  // Special case: reject obviously invalid dates like 00-00-0000
  if (year === 0 || month === 0 || day === 0) {
    throw new Error(
      `parseShopeeDate: invalid calendar date "${s}" (year, month, or day is zero)`
    );
  }

  // Validate that the date represents a real Gregorian calendar date
  // Use Date object to check if the date is valid (handles leap years)
  const dateObj = new Date(year, month - 1, day);
  
  // Check if the Date object represents the same date we parsed
  // (Date constructor auto-corrects invalid dates, e.g., Feb 31 -> Mar 3)
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    throw new Error(
      `parseShopeeDate: "${s}" does not represent a real Gregorian calendar date`
    );
  }

  // Convert to YYYY-MM-DD format
  return `${yearStr}-${monthStr}-${dayStr}`;
}

/**
 * Normalized result: map from WibDate to total expense (Rupiah, integer after Math.round).
 */
export interface AdsExpenseByDate {
  /** Map dari WibDate ke total expense (Rupiah, integer setelah Math.round dan clamp >= 0) */
  expensesByDate: Map<WibDate, number>;
  /** Set tanggal yang dikembalikan Shopee tapi tidak diminta — di-log untuk debugging, di-drop. */
  unexpectedDates?: WibDate[];
}

export interface ShopeeAdsApiSuccess {
  kind: "success";
  data: AdsExpenseByDate;
}

export interface ShopeeAdsApiError {
  kind: "error";
  /** Kode error mentah dari Shopee, contoh "ads.performance.error_date_too_old", "error_rate_limit", "error_not_found". */
  errorCode: string;
  message: string;
}

export type ShopeeAdsApiResult = ShopeeAdsApiSuccess | ShopeeAdsApiError;

/**
 * Call v2.ads.get_all_cpc_ads_hourly_performance for a single (shop, date).
 * 
 * Returns a map with exactly one key = `date`, value = Σ entries[].expense (Math.round, clamp to >= 0).
 * Hours that are not returned are treated as expense 0.
 * 
 * @param shopId - Shop identifier
 * @param date - WibDate in YYYY-MM-DD format
 * @returns ShopeeAdsApiResult with success data or error
 */
export async function getCpcAdsHourlyPerformance(
  shopId: number,
  date: WibDate,
): Promise<ShopeeAdsApiResult> {
  try {
    // Convert WibDate to Shopee format (DD-MM-YYYY)
    const performanceDate = formatShopeeDate(date);
    
    // Call Shopee API
    const response = await shopeeRequest({
      shopId,
      method: "GET",
      path: "/api/v2/ads/get_all_cpc_ads_hourly_performance",
      query: { performance_date: performanceDate },
    });

    // Check for error in response
    if (response.error) {
      return {
        kind: "error",
        errorCode: response.error,
        message: response.message || "Unknown error from Shopee Ads API",
      };
    }

    // Sum all hourly expenses
    const entries = response.response || [];
    let totalExpense = 0;
    
    for (const entry of entries) {
      const expense = entry.expense || 0;
      totalExpense += expense;
    }

    // Apply Math.round and clamp to >= 0
    const roundedExpense = Math.max(0, Math.round(totalExpense));

    // Return map with single key = date
    const expensesByDate = new Map<WibDate, number>();
    expensesByDate.set(date, roundedExpense);

    return {
      kind: "success",
      data: { expensesByDate },
    };
  } catch (err: any) {
    return {
      kind: "error",
      errorCode: "network_error",
      message: err?.message || "Network error calling Shopee Ads API",
    };
  }
}

/**
 * Call v2.ads.get_all_cpc_ads_daily_performance for a date range.
 * 
 * Caller guarantees `startDate < endDate` and `(endDate - startDate + 1) <= 30`.
 * Parse `entry.date` via `parseShopeeDate`, build `expensesByDate` map.
 * Dates not returned by Shopee are NOT added to the map (caller treats absence as 0).
 * 
 * @param shopId - Shop identifier
 * @param startDate - WibDate in YYYY-MM-DD format
 * @param endDate - WibDate in YYYY-MM-DD format
 * @returns ShopeeAdsApiResult with success data or error
 */
export async function getCpcAdsDailyPerformance(
  shopId: number,
  startDate: WibDate,
  endDate: WibDate,
): Promise<ShopeeAdsApiResult> {
  try {
    // Convert WibDate to Shopee format (DD-MM-YYYY)
    const startDateShopee = formatShopeeDate(startDate);
    const endDateShopee = formatShopeeDate(endDate);
    
    // Call Shopee API
    const response = await shopeeRequest({
      shopId,
      method: "GET",
      path: "/api/v2/ads/get_all_cpc_ads_daily_performance",
      query: {
        start_date: startDateShopee,
        end_date: endDateShopee,
      },
    });

    // Check for error in response
    if (response.error) {
      return {
        kind: "error",
        errorCode: response.error,
        message: response.message || "Unknown error from Shopee Ads API",
      };
    }

    // Build map from date to expense
    const entries = response.response || [];
    const expensesByDate = new Map<WibDate, number>();
    const unexpectedDates: WibDate[] = [];

    // Build set of expected dates for validation
    const expectedDates = new Set<WibDate>();
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      expectedDates.add(`${year}-${month}-${day}`);
    }

    for (const entry of entries) {
      // Parse Shopee date format (DD-MM-YYYY) to WibDate (YYYY-MM-DD)
      const wibDate = parseShopeeDate(entry.date);
      const expense = entry.expense || 0;
      
      // Apply Math.round and clamp to >= 0
      const roundedExpense = Math.max(0, Math.round(expense));
      
      // Only add dates that Shopee returned (caller treats absence as 0)
      expensesByDate.set(wibDate, roundedExpense);

      // Track unexpected dates for debugging
      if (!expectedDates.has(wibDate)) {
        unexpectedDates.push(wibDate);
      }
    }

    // Log unexpected dates if any
    if (unexpectedDates.length > 0) {
      console.warn(
        `[getCpcAdsDailyPerformance] Shopee returned ${unexpectedDates.length} unexpected dates:`,
        unexpectedDates
      );
    }

    return {
      kind: "success",
      data: {
        expensesByDate,
        unexpectedDates: unexpectedDates.length > 0 ? unexpectedDates : undefined,
      },
    };
  } catch (err: any) {
    return {
      kind: "error",
      errorCode: "network_error",
      message: err?.message || "Network error calling Shopee Ads API",
    };
  }
}
