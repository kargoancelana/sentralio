/**
 * Ads Expense Service
 * 
 * Handles Shopee Ads expense aggregation with cache-first lookup strategy.
 * Implements date range splitting, cache classification, and multi-shop aggregation.
 */

import { db } from "../db/client";
import { shopeeAdsDailyExpense } from "../db/schema";
import { and, between, eq } from "drizzle-orm";
import {
  getCpcAdsHourlyPerformance,
  getCpcAdsDailyPerformance,
  type ShopeeAdsApiResult,
} from "./shopee-ads";

// ============================================================================
// Domain Constants
// ============================================================================

/** Time-to-live for today's cache entries (15 minutes) */
export const TODAY_CACHE_TTL_MS = 15 * 60 * 1000;

/** Maximum date range for daily API calls (30 days) */
export const DAILY_API_MAX_RANGE_DAYS = 30;

/** Number of months to look back for ads data (6 months) */
export const SIX_MONTHS_BACK = 6;

/** Wait time before retrying rate-limited requests (60 seconds) */
export const RATE_LIMIT_RETRY_WAIT_MS = 60_000;

/** Set of error codes that indicate rate limiting */
export const RATE_LIMIT_ERRORS = new Set([
  "error_rate_limit",
  "ads.rate_limit.exceed_partner_api",
  "ads.rate_limit.exceed_shop_api",
  "ads.rate_limit.exceed_api",
]);

// ============================================================================
// Type Definitions
// ============================================================================

/** WIB calendar date in "YYYY-MM-DD" format (Asia/Jakarta timezone) */
export type WibDate = string;

/** Date range with inclusive start and end dates */
export interface DateRange {
  startDate: WibDate;
  endDate: WibDate;
}

/** Sub-range result from splitRange function */
export interface SubRange {
  startDate: WibDate;
  endDate: WibDate;
}

/** Result of date classification */
export interface DateClassification {
  /** Dates with valid cache (fresh) */
  freshDates: WibDate[];
  /** Dates that need to be fetched (missing or stale) */
  needFetchDates: WibDate[];
  /** Dates beyond the six-month cutoff (cache-only) */
  beyondCutoffDates: WibDate[];
}

/** Cache row structure */
export interface CacheRow {
  date: WibDate;
  expense: number;
  fetchedAt: Date;
}

/** Information about a shop that was skipped due to an error */
export interface SkippedShop {
  shopId: number;
  errorCode: string;
  message: string;
}

/** Result of getTotalAdsExpense aggregation across multiple shops */
export interface AdsExpenseTotal {
  /** Total non-negative expense (rupiah, integer). 0 if shopIds empty or all shops failed. */
  total: number;
  /** List of shops that were skipped due to final failure (after retry). */
  skippedShops: SkippedShop[];
  /** True if all shops in shopIds failed. */
  allShopsFailed: boolean;
}

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Validates that a string is a valid WIB_Date (YYYY-MM-DD format representing a real calendar date).
 * 
 * @param dateStr - The date string to validate
 * @throws Error if the date string is invalid
 */
function validateWibDate(dateStr: any): asserts dateStr is WibDate {
  if (dateStr === null || dateStr === undefined) {
    throw new Error("Date argument is null or undefined");
  }
  
  if (typeof dateStr !== "string") {
    throw new Error(`Date argument must be a string, got ${typeof dateStr}`);
  }
  
  if (dateStr === "") {
    throw new Error("Date argument is empty string");
  }
  
  // Check format: YYYY-MM-DD
  const formatRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!formatRegex.test(dateStr)) {
    throw new Error(`Date "${dateStr}" does not match YYYY-MM-DD format`);
  }
  
  // Parse components
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  
  // Validate ranges
  if (month < 1 || month > 12) {
    throw new Error(`Date "${dateStr}" has invalid month ${month} (must be 1-12)`);
  }
  
  if (day < 1 || day > 31) {
    throw new Error(`Date "${dateStr}" has invalid day ${day} (must be 1-31)`);
  }
  
  // Validate it's a real calendar date using Date object
  const dateObj = new Date(`${dateStr}T00:00:00Z`);
  
  // Check if Date construction succeeded
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Date "${dateStr}" is not a valid calendar date`);
  }
  
  // Verify the components match (catches invalid dates like 2024-02-31)
  const utcYear = dateObj.getUTCFullYear();
  const utcMonth = dateObj.getUTCMonth() + 1; // getUTCMonth is 0-indexed
  const utcDay = dateObj.getUTCDate();
  
  if (utcYear !== year || utcMonth !== month || utcDay !== day) {
    throw new Error(`Date "${dateStr}" does not represent a real calendar date`);
  }
}

/**
 * Calculates the number of calendar days between two dates (inclusive).
 * 
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Number of days from startDate to endDate inclusive
 */
function daysBetween(startDate: WibDate, endDate: WibDate): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.round(diffDays) + 1; // +1 because both dates are inclusive
}

/**
 * Adds a number of days to a date.
 * 
 * @param date - Date in YYYY-MM-DD format
 * @param days - Number of days to add
 * @returns New date in YYYY-MM-DD format
 */
function addDays(date: WibDate, days: number): WibDate {
  const dateObj = new Date(`${date}T00:00:00Z`);
  dateObj.setUTCDate(dateObj.getUTCDate() + days);
  
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}

/**
 * Splits a date range into sub-ranges with maximum length.
 * 
 * Pure function that partitions [startDate, endDate] into ordered sub-ranges
 * where each sub-range has at most maxDays calendar days (inclusive).
 * 
 * Requirements:
 * - Returns ordered list sorted ascending by startDate
 * - Every calendar day covered exactly once (no gaps, no overlaps)
 * - Each sub-range satisfies: subStart <= subEnd and (subEnd - subStart + 1) <= maxDays
 * - When range fits in maxDays, returns single sub-range
 * - Throws Error for invalid inputs
 * 
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @param maxDays - Maximum days per sub-range (1-365 inclusive)
 * @returns Ordered array of sub-ranges
 * @throws Error if startDate > endDate, maxDays < 1, maxDays > 365, or invalid date arguments
 * 
 * @example
 * splitRange("2024-01-01", "2024-01-05", 3)
 * // Returns: [
 * //   { startDate: "2024-01-01", endDate: "2024-01-03" },
 * //   { startDate: "2024-01-04", endDate: "2024-01-05" }
 * // ]
 * 
 * @example
 * splitRange("2024-01-01", "2024-01-02", 5)
 * // Returns: [{ startDate: "2024-01-01", endDate: "2024-01-02" }]
 */
export function splitRange(
  startDate: WibDate,
  endDate: WibDate,
  maxDays: number
): SubRange[] {
  // Validate date arguments
  validateWibDate(startDate);
  validateWibDate(endDate);
  
  // Validate maxDays
  if (!Number.isInteger(maxDays)) {
    throw new Error(`maxDays must be an integer, got ${maxDays}`);
  }
  
  if (maxDays < 1) {
    throw new Error(`maxDays must be >= 1, got ${maxDays}`);
  }
  
  if (maxDays > 365) {
    throw new Error(`maxDays must be <= 365, got ${maxDays}`);
  }
  
  // Check startDate <= endDate
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  
  if (startMs > endMs) {
    throw new Error(`startDate "${startDate}" is after endDate "${endDate}"`);
  }
  
  // Calculate total days in range (inclusive)
  const totalDays = daysBetween(startDate, endDate);
  
  // If range fits in maxDays, return single sub-range
  if (totalDays <= maxDays) {
    return [{ startDate, endDate }];
  }
  
  // Split into multiple sub-ranges
  const subRanges: SubRange[] = [];
  let currentStart = startDate;
  
  while (true) {
    const remainingDays = daysBetween(currentStart, endDate);
    
    if (remainingDays <= maxDays) {
      // Last sub-range
      subRanges.push({ startDate: currentStart, endDate });
      break;
    }
    
    // Create a sub-range of exactly maxDays
    const currentEnd = addDays(currentStart, maxDays - 1);
    subRanges.push({ startDate: currentStart, endDate: currentEnd });
    
    // Move to next sub-range (day after currentEnd)
    currentStart = addDays(currentEnd, 1);
  }
  
  return subRanges;
}

/**
 * Classifies dates in a range based on cache state and cutoff rules.
 * 
 * Pure function that categorizes each date in the range into one of:
 * - beyondCutoffDates: dates strictly older than sixMonthCutoff (cache-only, no fetch)
 * - freshDates: cached AND (not today OR today with fresh TTL)
 * - needFetchDates: missing OR stale (today with expired TTL) AND not beyond cutoff
 * 
 * Requirements:
 * - Each date falls into exactly one category
 * - beyondCutoff takes precedence over all other rules
 * - freshDates: cached AND (date != todayWib OR (now - fetchedAt) < todayCacheTtlMs)
 * - needFetchDates: (missing OR stale) AND date >= sixMonthCutoff
 * 
 * @param range - Date range to classify
 * @param cacheRows - Existing cache rows (readonly)
 * @param now - Current timestamp for TTL calculation
 * @param sixMonthCutoff - Dates before this are cache-only
 * @param todayCacheTtlMs - TTL for today's cache entries
 * @param todayWib - Today's date in WIB timezone
 * @returns Classification of all dates in range
 * @throws Error if inputs are null/invalid
 * 
 * @example
 * classifyDates(
 *   { startDate: "2024-01-01", endDate: "2024-01-03" },
 *   [{ date: "2024-01-01", expense: 100, fetchedAt: new Date("2024-01-01T10:00:00Z") }],
 *   new Date("2024-01-03T12:00:00Z"),
 *   "2023-07-01",
 *   900_000,
 *   "2024-01-03"
 * )
 * // Returns: {
 * //   freshDates: ["2024-01-01"],
 * //   needFetchDates: ["2024-01-02", "2024-01-03"],
 * //   beyondCutoffDates: []
 * // }
 */
export function classifyDates(
  range: DateRange,
  cacheRows: ReadonlyArray<CacheRow>,
  now: Date,
  sixMonthCutoff: WibDate,
  todayCacheTtlMs: number,
  todayWib: WibDate
): DateClassification {
  // Validate inputs
  if (!range || typeof range !== "object") {
    throw new Error("range must be a valid DateRange object");
  }
  
  validateWibDate(range.startDate);
  validateWibDate(range.endDate);
  validateWibDate(sixMonthCutoff);
  validateWibDate(todayWib);
  
  if (!(now instanceof Date) || isNaN(now.getTime())) {
    throw new Error("now must be a valid Date object");
  }
  
  if (!Number.isFinite(todayCacheTtlMs) || todayCacheTtlMs < 0) {
    throw new Error("todayCacheTtlMs must be a non-negative finite number");
  }
  
  if (!Array.isArray(cacheRows)) {
    throw new Error("cacheRows must be an array");
  }
  
  // Build cache lookup map
  const cacheMap = new Map<WibDate, CacheRow>();
  for (const row of cacheRows) {
    if (!row || typeof row !== "object") {
      throw new Error("cacheRows contains invalid row");
    }
    validateWibDate(row.date);
    if (!(row.fetchedAt instanceof Date)) {
      throw new Error(`cacheRows contains row with invalid fetchedAt for date ${row.date}`);
    }
    cacheMap.set(row.date, row);
  }
  
  // Generate all dates in range
  const allDates: WibDate[] = [];
  let currentDate = range.startDate;
  const endMs = new Date(`${range.endDate}T00:00:00Z`).getTime();
  
  while (true) {
    allDates.push(currentDate);
    
    const currentMs = new Date(`${currentDate}T00:00:00Z`).getTime();
    if (currentMs >= endMs) {
      break;
    }
    
    currentDate = addDays(currentDate, 1);
  }
  
  // Classify each date
  const freshDates: WibDate[] = [];
  const needFetchDates: WibDate[] = [];
  const beyondCutoffDates: WibDate[] = [];
  
  const cutoffMs = new Date(`${sixMonthCutoff}T00:00:00Z`).getTime();
  const nowMs = now.getTime();
  
  for (const date of allDates) {
    const dateMs = new Date(`${date}T00:00:00Z`).getTime();
    
    // Rule 1: beyondCutoff if date < sixMonthCutoff
    if (dateMs < cutoffMs) {
      beyondCutoffDates.push(date);
      continue;
    }
    
    const cachedRow = cacheMap.get(date);
    
    // Rule 2: missing → needFetch (if not beyond cutoff)
    if (!cachedRow) {
      needFetchDates.push(date);
      continue;
    }
    
    // Rule 3: cached_fresh if cached AND (date != todayWib OR (now - fetchedAt) < todayCacheTtlMs)
    if (date !== todayWib) {
      // Not today → always fresh if cached
      freshDates.push(date);
      continue;
    }
    
    // date === todayWib → check TTL
    const fetchedAtMs = cachedRow.fetchedAt.getTime();
    const ageMs = nowMs - fetchedAtMs;
    
    if (ageMs < todayCacheTtlMs) {
      // Today with fresh TTL → fresh
      freshDates.push(date);
    } else {
      // Today with expired TTL → stale → needFetch
      needFetchDates.push(date);
    }
  }
  
  return {
    freshDates,
    needFetchDates,
    beyondCutoffDates,
  };
}

/**
 * Groups a sorted list of dates into maximal contiguous spans.
 * 
 * Pure function that partitions a sorted unique list of dates into
 * contiguous date ranges where each span contains consecutive calendar days.
 * 
 * Requirements:
 * - Input must be sorted ascending and contain no duplicates
 * - Returns list of (startDate, endDate) spans
 * - Union of all spans equals input set
 * - Each span is contiguous (no gaps within span)
 * - No two adjacent spans can be merged (maximal)
 * 
 * @param dates - Sorted unique array of dates in YYYY-MM-DD format
 * @returns Array of contiguous date spans
 * @throws Error if input is null/invalid or contains duplicates
 * 
 * @example
 * groupContiguous(["2024-01-01", "2024-01-02", "2024-01-05", "2024-01-06"])
 * // Returns: [
 * //   { startDate: "2024-01-01", endDate: "2024-01-02" },
 * //   { startDate: "2024-01-05", endDate: "2024-01-06" }
 * // ]
 * 
 * @example
 * groupContiguous(["2024-01-01"])
 * // Returns: [{ startDate: "2024-01-01", endDate: "2024-01-01" }]
 * 
 * @example
 * groupContiguous([])
 * // Returns: []
 */
export function groupContiguous(dates: WibDate[]): SubRange[] {
  // Validate input
  if (!Array.isArray(dates)) {
    throw new Error("dates must be an array");
  }
  
  // Empty input → empty output
  if (dates.length === 0) {
    return [];
  }
  
  // Validate all dates and check for duplicates
  const seen = new Set<string>();
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    validateWibDate(date);
    
    if (seen.has(date)) {
      throw new Error(`dates contains duplicate: ${date}`);
    }
    seen.add(date);
    
    // Check sorted order
    if (i > 0) {
      const prevMs = new Date(`${dates[i - 1]}T00:00:00Z`).getTime();
      const currMs = new Date(`${date}T00:00:00Z`).getTime();
      
      if (currMs <= prevMs) {
        throw new Error(`dates must be sorted ascending, but ${dates[i - 1]} >= ${date}`);
      }
    }
  }
  
  // Group into contiguous spans
  const spans: SubRange[] = [];
  let spanStart = dates[0];
  let spanEnd = dates[0];
  
  for (let i = 1; i < dates.length; i++) {
    const currentDate = dates[i];
    const expectedNext = addDays(spanEnd, 1);
    
    if (currentDate === expectedNext) {
      // Contiguous → extend current span
      spanEnd = currentDate;
    } else {
      // Gap → close current span and start new one
      spans.push({ startDate: spanStart, endDate: spanEnd });
      spanStart = currentDate;
      spanEnd = currentDate;
    }
  }
  
  // Close final span
  spans.push({ startDate: spanStart, endDate: spanEnd });
  
  return spans;
}

// ============================================================================
// Database Cache Helpers
// ============================================================================

/**
 * Reads cached ads expense data from the database for a given shop and date range.
 * 
 * Performs a Drizzle SELECT on `shopeeAdsDailyExpense` filtered by `shop_id` and
 * `date BETWEEN startDate AND endDate`, returning an array of cache rows.
 * 
 * Requirements:
 * - Filters by shop_id and date range (inclusive)
 * - Returns array of { date, expense, fetchedAt } objects
 * - Returns empty array if no cached data exists
 * 
 * @param shopId - The Shopee shop ID
 * @param startDate - Start date in YYYY-MM-DD format (inclusive)
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @returns Array of cache rows with date, expense, and fetchedAt
 * @throws Error if inputs are invalid
 * 
 * @example
 * const cached = await readCache(12345, "2024-01-01", "2024-01-31");
 * // Returns: [
 * //   { date: "2024-01-01", expense: 50000, fetchedAt: Date(...) },
 * //   { date: "2024-01-02", expense: 75000, fetchedAt: Date(...) }
 * // ]
 * 
 * **Validates: Requirements 2.4, 2.9**
 */
export async function readCache(
  shopId: number,
  startDate: WibDate,
  endDate: WibDate
): Promise<CacheRow[]> {
  // Validate inputs
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new Error(`shopId must be a positive integer, got ${shopId}`);
  }
  
  validateWibDate(startDate);
  validateWibDate(endDate);
  
  // Query cache table
  const rows = await db
    .select({
      date: shopeeAdsDailyExpense.date,
      expense: shopeeAdsDailyExpense.expense,
      fetchedAt: shopeeAdsDailyExpense.fetchedAt,
    })
    .from(shopeeAdsDailyExpense)
    .where(
      and(
        eq(shopeeAdsDailyExpense.shopId, shopId),
        between(shopeeAdsDailyExpense.date, startDate, endDate)
      )
    );
  
  // Transform to CacheRow format
  return rows.map((row) => ({
    date: row.date,
    expense: row.expense,
    fetchedAt: row.fetchedAt,
  }));
}

/**
 * Upserts (inserts or updates) a cache entry for a given shop and date.
 * 
 * Performs `INSERT ... ON DUPLICATE KEY UPDATE` using Drizzle's `onDuplicateKeyUpdate`.
 * Clamps expense to >= 0 and rounds to integer before writing.
 * 
 * Requirements:
 * - Upserts row with (shop_id, date) as composite primary key
 * - On conflict: updates expense and fetched_at
 * - Clamps expense to >= 0 (negative values become 0)
 * - Rounds expense using Math.round before write
 * 
 * @param shopId - The Shopee shop ID
 * @param date - Date in YYYY-MM-DD format
 * @param expense - Raw expense value (will be rounded and clamped)
 * @param fetchedAt - Timestamp when the data was fetched
 * @throws Error if inputs are invalid
 * 
 * @example
 * await upsertCache(12345, "2024-01-15", 123456.78, new Date());
 * // Inserts or updates row with expense = 123457 (rounded)
 * 
 * @example
 * await upsertCache(12345, "2024-01-16", -500, new Date());
 * // Inserts or updates row with expense = 0 (clamped)
 * 
 * **Validates: Requirements 2.4, 2.9**
 */
export async function upsertCache(
  shopId: number,
  date: WibDate,
  expense: number,
  fetchedAt: Date
): Promise<void> {
  // Validate inputs
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new Error(`shopId must be a positive integer, got ${shopId}`);
  }
  
  validateWibDate(date);
  
  if (!Number.isFinite(expense)) {
    throw new Error(`expense must be a finite number, got ${expense}`);
  }
  
  if (!(fetchedAt instanceof Date) || isNaN(fetchedAt.getTime())) {
    throw new Error("fetchedAt must be a valid Date object");
  }
  
  // Clamp expense to >= 0 and round
  const clampedExpense = Math.max(0, Math.round(expense));
  
  // Upsert using Drizzle's onDuplicateKeyUpdate
  await db
    .insert(shopeeAdsDailyExpense)
    .values({
      shopId,
      date,
      expense: clampedExpense,
      fetchedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        expense: clampedExpense,
        fetchedAt,
      },
    });
}

// ============================================================================
// WIB Date Helpers (mirroring profit.service.ts pattern)
// ============================================================================

/** Intl formatter for Asia/Jakarta timezone */
const WIB_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Extracts date/time parts in Asia/Jakarta timezone.
 * Mirrors getWibParts pattern from profit.service.ts.
 */
function getWibParts(date: Date): { yyyy: string; mm: string; dd: string } {
  const parts = WIB_DATE_PARTS_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    yyyy: get('year'),
    mm: get('month'),
    dd: get('day'),
  };
}

/**
 * Returns "YYYY-MM-DD" in WIB timezone.
 */
function toWibDateOnly(date: Date): WibDate {
  const { yyyy, mm, dd } = getWibParts(date);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Computes the six-month cutoff date from today in WIB timezone.
 * Subtracts 6 calendar months, clamping day to end of month if needed.
 */
function computeSixMonthCutoff(todayWib: WibDate): WibDate {
  const [yearStr, monthStr, dayStr] = todayWib.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  
  // Subtract 6 months
  month -= SIX_MONTHS_BACK;
  
  // Handle year rollover
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  
  // Clamp day to last day of target month
  const daysInMonth = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  
  const monthPadded = String(month).padStart(2, '0');
  const dayPadded = String(clampedDay).padStart(2, '0');
  
  return `${year}-${monthPadded}-${dayPadded}`;
}

/**
 * Delay helper for rate-limit retry.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Shop Expense Computation
// ============================================================================

/**
 * Computes total ads expense for a single shop across a date range.
 * 
 * Implements cache-first lookup strategy:
 * 1. Read all cache rows for the shop/range
 * 2. Classify dates into fresh/needFetch/beyondCutoff
 * 3. For needFetch dates: group into contiguous spans, split if > 30 days
 * 4. For each sub-range: call hourly (single day) or daily (multi-day) API
 * 5. Handle rate-limit retry (once per sub-range), error_not_found (upsert 0), other errors (fail shop)
 * 6. Upsert fetched data to cache
 * 7. Sum expenses across all dates in range
 * 
 * Requirements:
 * - Cache-first: only fetch dates that are missing or stale
 * - Six-month cutoff: dates < cutoff are cache-only (no Shopee call)
 * - Today TTL: today's cache expires after 15 minutes
 * - Rate-limit retry: wait 60s and retry once on rate-limit errors
 * - error_not_found: treat as expense=0, not a failure
 * - Other errors: stop fetching for this shop, return failure
 * 
 * @param shopId - The Shopee shop ID
 * @param startDate - Start date in YYYY-MM-DD format (inclusive)
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @returns Total expense for the shop, or throws on failure
 * @throws Error with code for caller to classify as skipped shop
 * 
 * **Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5**
 */
export async function getShopExpense(
  shopId: number,
  startDate: WibDate,
  endDate: WibDate
): Promise<number> {
  // Validate inputs
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new Error(`shopId must be a positive integer, got ${shopId}`);
  }
  validateWibDate(startDate);
  validateWibDate(endDate);
  
  // Compute now, todayWib, sixMonthCutoff via Asia/Jakarta timezone
  const now = new Date();
  const todayWib = toWibDateOnly(now);
  const sixMonthCutoff = computeSixMonthCutoff(todayWib);
  
  // Step 1: Read cache rows once
  const cacheRows = await readCache(shopId, startDate, endDate);
  
  // Step 2: Classify dates
  const classification = classifyDates(
    { startDate, endDate },
    cacheRows,
    now,
    sixMonthCutoff,
    TODAY_CACHE_TTL_MS,
    todayWib
  );
  
  const { freshDates, needFetchDates, beyondCutoffDates } = classification;
  
  // Step 3: If no dates need fetching, compute total from cache
  if (needFetchDates.length === 0) {
    // Build expense map from cache
    const expenseMap = new Map<WibDate, number>();
    for (const row of cacheRows) {
      expenseMap.set(row.date, row.expense);
    }
    
    // Sum expenses for all dates in range
    let total = 0;
    
    // Fresh dates: use cache
    for (const date of freshDates) {
      total += expenseMap.get(date) ?? 0;
    }
    
    // Beyond cutoff dates: use cache (or 0 if missing per Requirement 7.2)
    for (const date of beyondCutoffDates) {
      total += expenseMap.get(date) ?? 0;
    }
    
    return total;
  }
  
  // Step 4: Group needFetch dates into contiguous spans
  const spans = groupContiguous(needFetchDates);
  
  // Step 5: Split spans that exceed DAILY_API_MAX_RANGE_DAYS
  const subRanges: SubRange[] = [];
  for (const span of spans) {
    const spanDays = daysBetween(span.startDate, span.endDate);
    if (spanDays > DAILY_API_MAX_RANGE_DAYS) {
      // Split this span
      const splits = splitRange(span.startDate, span.endDate, DAILY_API_MAX_RANGE_DAYS);
      subRanges.push(...splits);
    } else {
      subRanges.push(span);
    }
  }
  
  // Step 6: Fetch each sub-range
  const fetchedExpenses = new Map<WibDate, number>();
  
  for (const subRange of subRanges) {
    const { startDate: subStart, endDate: subEnd } = subRange;
    
    // Choose API based on range length
    let result: ShopeeAdsApiResult;
    let retryCount = 0;
    const maxRetries = 1;
    
    while (retryCount <= maxRetries) {
      if (subStart === subEnd) {
        // Single day → hourly API
        result = await getCpcAdsHourlyPerformance(shopId, subStart);
      } else {
        // Multi-day → daily API
        result = await getCpcAdsDailyPerformance(shopId, subStart, subEnd);
      }
      
      // Handle result
      if (result.kind === "success") {
        // Success: extract expenses
        const { expensesByDate } = result.data;
        
        // For each date in sub-range, get expense (default 0 if not returned)
        const allDatesInSubRange: WibDate[] = [];
        let currentDate = subStart;
        while (true) {
          allDatesInSubRange.push(currentDate);
          if (currentDate === subEnd) break;
          currentDate = addDays(currentDate, 1);
        }
        
        for (const date of allDatesInSubRange) {
          const expense = expensesByDate.get(date) ?? 0;
          fetchedExpenses.set(date, expense);
          
          // Upsert to cache
          try {
            await upsertCache(shopId, date, expense, now);
          } catch (cacheErr: any) {
            // DB error during cache write → throw cache_write_error
            const err = new Error(`cache_write_error: ${cacheErr?.message}`);
            (err as any).code = "cache_write_error";
            throw err;
          }
        }
        
        // Success, break retry loop
        break;
      } else {
        // Error case
        const { errorCode, message } = result;
        
        // Handle rate-limit errors with retry
        if (RATE_LIMIT_ERRORS.has(errorCode)) {
          if (retryCount < maxRetries) {
            console.warn(
              `[ads-expense] shopId=${shopId} range=${subStart}..${subEnd} rate-limited (${errorCode}), retrying after 60s`
            );
            await delay(RATE_LIMIT_RETRY_WAIT_MS);
            retryCount++;
            continue; // Retry
          } else {
            // Retry exhausted → final failure
            console.error(
              `[ads-expense] shopId=${shopId} range=${subStart}..${subEnd} rate-limit retry exhausted`
            );
            const err = new Error(`Rate limit retry exhausted: ${errorCode}`);
            (err as any).code = errorCode;
            throw err;
          }
        }
        
        // Handle error_not_found: upsert 0 for all dates in sub-range
        if (errorCode === "error_not_found") {
          console.info(
            `[ads-expense] shopId=${shopId} range=${subStart}..${subEnd} returned error_not_found, treating as expense=0`
          );
          
          const allDatesInSubRange: WibDate[] = [];
          let currentDate = subStart;
          while (true) {
            allDatesInSubRange.push(currentDate);
            if (currentDate === subEnd) break;
            currentDate = addDays(currentDate, 1);
          }
          
          for (const date of allDatesInSubRange) {
            fetchedExpenses.set(date, 0);
            
            try {
              await upsertCache(shopId, date, 0, now);
            } catch (cacheErr: any) {
              const err = new Error(`cache_write_error: ${cacheErr?.message}`);
              (err as any).code = "cache_write_error";
              throw err;
            }
          }
          
          // Not a failure, break retry loop
          break;
        }
        
        // Any other error → final failure for this shop
        console.error(
          `[ads-expense] shopId=${shopId} range=${subStart}..${subEnd} failed with ${errorCode}: ${message}`
        );
        const err = new Error(`Shopee API error: ${errorCode} - ${message}`);
        (err as any).code = errorCode;
        throw err;
      }
    }
  }
  
  // Step 7: Compute total from fresh + beyondCutoff + fetched
  const expenseMap = new Map<WibDate, number>();
  
  // Add cache rows
  for (const row of cacheRows) {
    expenseMap.set(row.date, row.expense);
  }
  
  // Overlay fetched expenses (overwrites cache for needFetch dates)
  for (const [date, expense] of fetchedExpenses) {
    expenseMap.set(date, expense);
  }
  
  // Sum all dates in range
  let total = 0;
  let currentDate = startDate;
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  
  while (true) {
    const expense = expenseMap.get(currentDate) ?? 0;
    total += expense;
    
    const currentMs = new Date(`${currentDate}T00:00:00Z`).getTime();
    if (currentMs >= endMs) break;
    
    currentDate = addDays(currentDate, 1);
  }
  
  return total;
}

// ============================================================================
// Multi-Shop Aggregation
// ============================================================================

/**
 * Clamps a value to be >= 0.
 */
function clampGteZero(value: number): number {
  return Math.max(0, value);
}

/**
 * Computes total ads expense across multiple shops for a date range.
 * 
 * Implements multi-shop aggregation with per-shop resilience:
 * 1. Deduplicate shopIds using Set
 * 2. Return early if shopIds is empty (total=0, no Shopee calls)
 * 3. Loop through shops sequentially (to limit rate-limit pressure)
 * 4. For each shop: call getShopExpense, catch errors, classify as skip
 * 5. Aggregate successful shop totals
 * 6. Return total (clamped >= 0, capped at Number.MAX_SAFE_INTEGER), skipped shops, and allShopsFailed flag
 * 
 * Requirements:
 * - Deduplicates shopIds
 * - Empty input short-circuits to { total: 0, skippedShops: [], allShopsFailed: false }
 * - Sequential per-shop loop (not parallel) to avoid overwhelming Shopee API
 * - Collects successes and skipped shops with { shopId, errorCode, message }
 * - Returns { total: clampGteZero(Σ successful totals), skippedShops, allShopsFailed }
 * - Caps aggregate at Number.MAX_SAFE_INTEGER
 * - Logs one warning line per skip: [ads-expense] shopId=X range=Y..Z skipped due to <errorCode>: <message>
 * 
 * @param shopIds - Array of shop IDs (may contain duplicates)
 * @param startDate - Start date in YYYY-MM-DD format (inclusive)
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @returns AdsExpenseTotal with total, skippedShops, and allShopsFailed
 * 
 * @example
 * const result = await getTotalAdsExpense([123, 456, 123], "2024-01-01", "2024-01-31");
 * // Returns: {
 * //   total: 500000,
 * //   skippedShops: [],
 * //   allShopsFailed: false
 * // }
 * 
 * @example
 * const result = await getTotalAdsExpense([], "2024-01-01", "2024-01-31");
 * // Returns: { total: 0, skippedShops: [], allShopsFailed: false }
 * 
 * @example
 * const result = await getTotalAdsExpense([123, 456], "2024-01-01", "2024-01-31");
 * // If shop 456 fails with expired token:
 * // Returns: {
 * //   total: 250000,  // only shop 123's total
 * //   skippedShops: [{ shopId: 456, errorCode: "error_auth", message: "..." }],
 * //   allShopsFailed: false
 * // }
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.5**
 */
export async function getTotalAdsExpense(
  shopIds: number[],
  startDate: WibDate,
  endDate: WibDate,
): Promise<AdsExpenseTotal> {
  // Validate inputs
  if (!Array.isArray(shopIds)) {
    throw new Error("shopIds must be an array");
  }
  
  validateWibDate(startDate);
  validateWibDate(endDate);
  
  // Step 1: Deduplicate shopIds
  const uniqueShopIds = [...new Set(shopIds)];
  
  // Step 2: Empty input short-circuit (Requirement 5.5)
  if (uniqueShopIds.length === 0) {
    return {
      total: 0,
      skippedShops: [],
      allShopsFailed: false,
    };
  }
  
  // Step 3: Sequential per-shop loop
  const successfulTotals: number[] = [];
  const skippedShops: SkippedShop[] = [];
  
  for (const shopId of uniqueShopIds) {
    try {
      // Validate shopId
      if (!Number.isInteger(shopId) || shopId <= 0) {
        console.warn(
          `[ads-expense] shopId=${shopId} range=${startDate}..${endDate} skipped due to invalid_shop_id: shopId must be a positive integer`
        );
        skippedShops.push({
          shopId,
          errorCode: "invalid_shop_id",
          message: "shopId must be a positive integer",
        });
        continue;
      }
      
      // Call getShopExpense
      const shopTotal = await getShopExpense(shopId, startDate, endDate);
      
      // Validate result
      if (!Number.isFinite(shopTotal)) {
        console.warn(
          `[ads-expense] shopId=${shopId} range=${startDate}..${endDate} skipped due to invalid_result: getShopExpense returned non-finite value`
        );
        skippedShops.push({
          shopId,
          errorCode: "invalid_result",
          message: "getShopExpense returned non-finite value",
        });
        continue;
      }
      
      // Success: add to totals
      successfulTotals.push(shopTotal);
      
    } catch (err: any) {
      // Extract error code and message
      const errorCode = err?.code || "unknown_error";
      const message = err?.message || "Unknown error occurred";
      
      // Log warning (Requirement 6.1)
      console.warn(
        `[ads-expense] shopId=${shopId} range=${startDate}..${endDate} skipped due to ${errorCode}: ${message}`
      );
      
      // Add to skipped shops (Requirement 6.2)
      skippedShops.push({
        shopId,
        errorCode,
        message,
      });
    }
  }
  
  // Step 4: Aggregate successful totals
  let total = 0;
  for (const shopTotal of successfulTotals) {
    total += shopTotal;
  }
  
  // Clamp to >= 0 (Requirement 5.4)
  total = clampGteZero(total);
  
  // Cap at Number.MAX_SAFE_INTEGER (Requirement 5.4)
  if (total > Number.MAX_SAFE_INTEGER) {
    console.warn(
      `[ads-expense] Total expense ${total} exceeds MAX_SAFE_INTEGER, capping to ${Number.MAX_SAFE_INTEGER}`
    );
    total = Number.MAX_SAFE_INTEGER;
  }
  
  // Step 5: Determine allShopsFailed (Requirement 5.6, 6.5)
  const allShopsFailed = skippedShops.length === uniqueShopIds.length;
  
  // Step 6: Return result
  return {
    total,
    skippedShops,
    allShopsFailed,
  };
}
