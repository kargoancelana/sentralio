/**
 * Profit Service
 *
 * Orchestrates data fetching, cost resolution via Cost_Resolver (single path),
 * and delegates calculation to pure functions in profit-calculator.ts.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 17.1, 17.2, 17.3, 17.4, 17.5,
 *               17.6, 17.7, 17.8, 18.1, 18.2, 18.3, 24.2, 24.3
 */

import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";

// ─── Timezone-safe date helpers (WIB / Asia/Jakarta) ─────────────────────────
//
// Reports filter and group by Asia/Jakarta calendar dates. We must NOT rely on
// the API host's system timezone (it could be UTC in production). Two helpers
// below convert a JS Date into WIB-localised strings deterministically.
//
// Why: with the MySQL connection pinned to +07:00, mysql2 returns timestamp
// columns as JS Date objects whose UTC instant equals the WIB wall-clock time
// stored in the column. Reading those Dates with `getDate()` etc. uses the
// host's system TZ, which is wrong on UTC hosts. Using Intl with the explicit
// Asia/Jakarta timezone is correct on any host.

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

function getWibParts(date: Date): { yyyy: string; mm: string; dd: string; hh: string; min: string; ss: string } {
  const parts = WIB_DATE_PARTS_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // Intl returns hour "24" instead of "00" at midnight in some runtimes
  const hh = get('hour') === '24' ? '00' : get('hour');
  return {
    yyyy: get('year'),
    mm: get('month'),
    dd: get('day'),
    hh,
    min: get('minute'),
    ss: get('second'),
  };
}

/** Returns "YYYY-MM-DD" in WIB. Used for grouping orders by their WIB calendar date. */
function toWibDateOnly(date: Date): string {
  const { yyyy, mm, dd } = getWibParts(date);
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns "YYYY-MM-DDTHH:mm:ss" in WIB. Used for serialising timestamps to API responses. */
function formatDateLocal(date: Date): string {
  const { yyyy, mm, dd, hh, min, ss } = getWibParts(date);
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

/**
 * Converts a WIB calendar-date range (e.g. start='2026-04-01', end='2026-04-30')
 * into the equivalent UTC DATETIME literal pair that bracket the same instant
 * range. We need this because:
 *
 *  - Reports filter by WIB calendar dates ("April" means "1 Apr 00:00 WIB to
 *    30 Apr 23:59:59 WIB").
 *  - Timestamp columns store the UTC instant (mysql2 strips/preserves the UTC
 *    representation for JS Date <-> DATETIME mapping).
 *  - Raw SQL date-literal comparisons run in the SQL session timezone, which
 *    on this deployment is `SYSTEM` (= UTC on production hosts).
 *
 * So filtering with `escrow_release_time >= '2026-04-01 00:00:00'` interprets
 * the literal as UTC, missing rows whose WIB wall-clock is on/after 1 Apr but
 * whose UTC clock is still 31 Mar (i.e. midnight to 06:59 WIB on the 1st).
 *
 * This helper shifts the WIB midnight boundary back 7 hours so the literal
 * matches the correct UTC instant.
 *
 * Returns: { startUtc: 'YYYY-MM-DD HH:MM:SS', endUtc: 'YYYY-MM-DD HH:MM:SS' }
 */
function wibDateRangeToUtcLiterals(startWibDate: string, endWibDate: string): { startUtc: string; endUtc: string } {
  // Inputs are "YYYY-MM-DD" representing WIB calendar dates.
  // WIB midnight = UTC 17:00 the previous day.
  // 1 Apr 00:00 WIB = 31 Mar 17:00 UTC
  // 30 Apr 23:59:59 WIB = 30 Apr 16:59:59 UTC
  const fmtUtc = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const renderUtc = (instant: Date): string => {
    const parts = fmtUtc.formatToParts(instant);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    const hh = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hh}:${get('minute')}:${get('second')}`;
  };
  // Construct UTC instant for each WIB boundary by string concat with +07:00 offset.
  const startInstant = new Date(`${startWibDate}T00:00:00+07:00`);
  const endInstant = new Date(`${endWibDate}T23:59:59+07:00`);
  return {
    startUtc: renderUtc(startInstant),
    endUtc: renderUtc(endInstant),
  };
}

import {
  productGroups,
  products,
  shopeeCredentials,
  shopeeOrderFees,
  shopeeOrderItems,
  shopeeOrders,
} from "../../db/schema";
import { resolveOrders as Cost_Resolver_resolveOrders } from "./cost-resolver.service";
import type { OrderForResolve, ResolvedOrder } from "./cost-resolver.service";
import type {
  PaginatedOrderProfitResponse,
  ProductPerformanceResponse,
  ProfitSummaryResponse,
  ShopeeDeductionsResponse,
  ShopPerformanceResponse,
} from "./profit.types";
import {
  aggregateProductPerformance,
  aggregateProfitSummary,
  aggregateShopPerformance,
  calculateOrderProfit,
} from "./profit-calculator";
import type { GroupByLevel, OrderCostInput } from "./profit-calculator";
import { getTotalAdsExpense } from "../../services/ads-expense.service";
import type { AdsExpenseTotal } from "../../services/ads-expense.service";

// ─── Exported Query Params Interface ──────────────────────────────────────────

export interface ProfitQueryParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  shopId?: number;
}

// ─── Internal Row Types ────────────────────────────────────────────────────────

type OrderRow = {
  id: number;
  orderSn: string;
  shopId: number;
  totalAmount: number;
  createTime: Date;
  escrowReleaseTime: Date | null;
};

type OrderItemRow = {
  id: number;
  orderSn: string;
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  qty: number;
  itemPrice: number;
  itemId: string | null;
  modelId: string | null;
};

type OrderFeesRow = {
  commissionFee: number;
  serviceFee: number;
  sellerOrderProcessingFee: number;
  actualShippingFee: number;
  shopeeShippingRebate: number;
  sellerVoucher: number;
  amsCommissionFee: number;
  sellerReturnRefund: number;
  /** Signed: negative = seller bears shipping (deduction); positive = refund (income). */
  finalShippingFee: number;
};

const DEFAULT_FEES: OrderFeesRow = {
  commissionFee: 0,
  serviceFee: 0,
  sellerOrderProcessingFee: 0,
  actualShippingFee: 0,
  shopeeShippingRebate: 0,
  sellerVoucher: 0,
  amsCommissionFee: 0,
  sellerReturnRefund: 0,
  finalShippingFee: 0,
};

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface ProfitDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface FetchedOrder {
  orderSn: string;
  shopId: number;
  shopName: string;
  createTime: Date;
  escrowReleaseTime: Date | null;
  items: FetchedOrderItem[];
  fees: FetchedOrderFees | null;
}

export interface FetchedOrderItem {
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  qty: number;
  itemPrice: number;
  itemId: string | null;
  modelId: string | null;
}

export interface FetchedOrderFees {
  commissionFee: number;
  serviceFee: number;
  sellerOrderProcessingFee: number;
  actualShippingFee: number;
  shopeeShippingRebate: number;
  sellerVoucher: number;
  amsCommissionFee: number;
  sellerReturnRefund: number;
}

// ─── fetchCompletedOrders ─────────────────────────────────────────────────────

/**
 * Fetches COMPLETED orders within the date range, with their items and fees.
 * escrowReleaseTime is filtered as: escrowReleaseTime >= startDate 00:00:00 AND escrowReleaseTime <= endDate 23:59:59
 * Only orders where escrowReleaseTime IS NOT NULL are returned.
 * Fees are LEFT-JOIN style: if no fee record exists, fees is null.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export async function fetchCompletedOrders(
  range: ProfitDateRange,
  shopId?: number,
): Promise<FetchedOrder[]> {
  const { startDate, endDate } = range;
  console.log("[fetchCompletedOrders] start");

  // Convert WIB calendar-date range to UTC DATETIME literals so SQL filters
  // match correctly regardless of session timezone (escrow_release_time is
  // stored as a UTC instant).
  const { startUtc, endUtc } = wibDateRangeToUtcLiterals(startDate, endDate);
  console.log(`[fetchCompletedOrders] WIB range ${startDate}..${endDate} → UTC ${startUtc}..${endUtc}`);

  const conditions = [
    eq(shopeeOrders.orderStatus, "COMPLETED"),
    isNotNull(shopeeOrders.escrowReleaseTime),
    sql`${shopeeOrders.escrowReleaseTime} >= ${startUtc}`,
    sql`${shopeeOrders.escrowReleaseTime} <= ${endUtc}`,
  ];

  if (shopId !== undefined) {
    conditions.push(eq(shopeeOrders.shopId, shopId));
  }

  const orderRows = await db
    .select({
      orderSn: shopeeOrders.orderSn,
      shopId: shopeeOrders.shopId,
      createTime: shopeeOrders.createTime,
      escrowReleaseTime: shopeeOrders.escrowReleaseTime,
    })
    .from(shopeeOrders)
    .where(and(...conditions));

  console.log("[fetchCompletedOrders] found", orderRows.length, "orders");

  if (orderRows.length === 0) return [];

  const orderSns = orderRows.map((o) => o.orderSn);
  const shopIds = [...new Set(orderRows.map((o) => o.shopId))];

  console.log("[fetchCompletedOrders] fetching items, fees, shop names...");

  // Fetch sequentially to avoid connection pool exhaustion
  const itemsMap = await fetchOrderItems(orderSns);
  const feesMap = await fetchOrderFees(orderSns);
  const shopNamesMap = await fetchShopNames(shopIds);

  console.log("[fetchCompletedOrders] done fetching, building result");

  return orderRows.map((order) => {
    const rawItems = itemsMap.get(order.orderSn) ?? [];
    const rawFees = feesMap.get(order.orderSn);

    const feesObj: FetchedOrderFees | null = rawFees
      ? {
          commissionFee: rawFees.commissionFee,
          serviceFee: rawFees.serviceFee,
          sellerOrderProcessingFee: rawFees.sellerOrderProcessingFee,
          actualShippingFee: rawFees.actualShippingFee,
          shopeeShippingRebate: rawFees.shopeeShippingRebate,
          sellerVoucher: rawFees.sellerVoucher,
          amsCommissionFee: rawFees.amsCommissionFee,
          sellerReturnRefund: rawFees.sellerReturnRefund,
        }
      : null;

    const items: FetchedOrderItem[] = rawItems.map((item) => ({
      itemName: item.itemName,
      modelName: item.modelName,
      modelSku: item.modelSku,
      qty: item.qty,
      itemPrice: item.itemPrice,
      itemId: item.itemId,
      modelId: item.modelId,
    }));

    return {
      orderSn: order.orderSn,
      shopId: order.shopId,
      shopName: shopNamesMap.get(order.shopId) ?? `Shop #${order.shopId}`,
      createTime: order.createTime,
      escrowReleaseTime: order.escrowReleaseTime ?? null,
      items,
      fees: feesObj,
    };
  });
}

// ─── buildOrdersForResolve ────────────────────────────────────────────────────

/**
 * Converts FetchedOrder[] into OrderForResolve[] for Cost_Resolver.resolveOrders.
 * No SKU normalization or transformation — passes item identity as-is.
 *
 * Requirements: 15.1, 15.2
 */
function buildOrdersForResolve(orders: FetchedOrder[]): OrderForResolve[] {
  return orders.map((order) => ({
    orderSn: order.orderSn,
    shopId: order.shopId,
    orderDate: toWibDateOnly(order.createTime),
    items: order.items.map((item) => ({
      itemId: item.itemId,
      modelId: item.modelId,
      modelSku: item.modelSku, // snapshot SKU — fallback when (itemId, modelId) does not resolve via products
      qty: item.qty,
      itemPrice: item.itemPrice,
    })),
  }));
}

// ─── buildOrderCostInput ──────────────────────────────────────────────────────

/**
 * Builds an OrderCostInput from a FetchedOrder and its ResolvedOrder.
 * Uses packingCostPerOrder (single value per order) from resolver.
 * adCost is always 0 (placeholder).
 *
 * Requirements: 15.3, 15.4, 16.1, 16.2
 */
export function buildOrderCostInput(
  order: FetchedOrder,
  resolved: ResolvedOrder,
): OrderCostInput {
  const fees = order.fees;
  return {
    items: order.items.map((item, i) => {
      const resolvedItem = resolved.itemCosts[i];
      return {
        itemPrice: item.itemPrice,
        qty: item.qty,
        hppPerUnit: resolvedItem?.hppPerUnit ?? 0,
        hppFound: resolvedItem?.hppFound ?? false,
      };
    }),
    packingCostPerOrder: resolved.packingCost.packingCost,
    commissionFee: fees?.commissionFee ?? 0,
    serviceFee: fees?.serviceFee ?? 0,
    sellerOrderProcessingFee: fees?.sellerOrderProcessingFee ?? 0,
    actualShippingFee: fees?.actualShippingFee ?? 0,
    shopeeShippingRebate: fees?.shopeeShippingRebate ?? 0,
    sellerVoucher: fees?.sellerVoucher ?? 0,
    amsCommissionFee: fees?.amsCommissionFee ?? 0,
    adCost: 0,
  };
}

// ─── fetchOrdersInRange ────────────────────────────────────────────────────────

/**
 * Fetches all COMPLETED orders within the given date range, optionally
 * filtered by shopId. Filters by escrow_release_time (NOT NULL) instead of create_time.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
async function fetchOrdersInRange(
  startDate: string,
  endDate: string,
  shopId?: number,
): Promise<OrderRow[]> {
  // Convert WIB calendar-date range to UTC DATETIME literals — see comments in
  // `wibDateRangeToUtcLiterals` and `fetchCompletedOrders` above for why.
  const { startUtc, endUtc } = wibDateRangeToUtcLiterals(startDate, endDate);

  const conditions = [
    eq(shopeeOrders.orderStatus, "COMPLETED"),
    isNotNull(shopeeOrders.escrowReleaseTime),
    sql`${shopeeOrders.escrowReleaseTime} >= ${startUtc}`,
    sql`${shopeeOrders.escrowReleaseTime} <= ${endUtc}`,
  ];

  if (shopId !== undefined) {
    conditions.push(eq(shopeeOrders.shopId, shopId));
  }

  const rows = await db
    .select({
      id: shopeeOrders.id,
      orderSn: shopeeOrders.orderSn,
      shopId: shopeeOrders.shopId,
      totalAmount: shopeeOrders.totalAmount,
      createTime: shopeeOrders.createTime,
      escrowReleaseTime: shopeeOrders.escrowReleaseTime,
    })
    .from(shopeeOrders)
    .where(and(...conditions))
    .orderBy(desc(shopeeOrders.escrowReleaseTime));

  return rows;
}

// ─── fetchOrderItems ───────────────────────────────────────────────────────────

/**
 * Fetches order items for the given order SNs, grouped by orderSn.
 * Returns empty Map if orderSns array is empty.
 */
async function fetchOrderItems(orderSns: string[]): Promise<Map<string, OrderItemRow[]>> {
  if (orderSns.length === 0) return new Map();

  const map = new Map<string, OrderItemRow[]>();

  // Chunk to avoid MySQL query size limits
  const CHUNK_SIZE = 200;
  for (let i = 0; i < orderSns.length; i += CHUNK_SIZE) {
    const chunk = orderSns.slice(i, i + CHUNK_SIZE);
    const rows = await db
      .select({
        id: shopeeOrderItems.id,
        orderSn: shopeeOrderItems.orderSn,
        itemName: shopeeOrderItems.itemName,
        modelName: shopeeOrderItems.modelName,
        modelSku: shopeeOrderItems.modelSku,
        qty: shopeeOrderItems.qty,
        itemPrice: shopeeOrderItems.itemPrice,
        itemId: shopeeOrderItems.itemId,
        modelId: shopeeOrderItems.modelId,
      })
      .from(shopeeOrderItems)
      .where(inArray(shopeeOrderItems.orderSn, chunk));

    for (const row of rows) {
      const existing = map.get(row.orderSn) ?? [];
      existing.push(row);
      map.set(row.orderSn, existing);
    }
  }

  return map;
}

// ─── fetchOrderFees ────────────────────────────────────────────────────────────

/**
 * Fetches fee records for the given order SNs.
 * Returns a Map keyed by orderSn. Orders not in the fees table get default
 * zero fees. Returns empty Map if orderSns array is empty.
 */
async function fetchOrderFees(orderSns: string[]): Promise<Map<string, OrderFeesRow>> {
  const map = new Map<string, OrderFeesRow>();

  // Fill all with default zero fees — shopee_order_fees data will be populated
  // when escrow detail sync is implemented. For now, all fees are 0.
  for (const sn of orderSns) {
    map.set(sn, { ...DEFAULT_FEES });
  }

  if (orderSns.length === 0) return map;

  try {
    // Try to fetch from shopee_order_fees table (may be empty or locked)
    const CHUNK_SIZE = 200;
    for (let i = 0; i < orderSns.length; i += CHUNK_SIZE) {
      const chunk = orderSns.slice(i, i + CHUNK_SIZE);
      // Use a timeout via AbortController-like pattern: race with a timeout promise
      const queryPromise = db
        .select({
          orderSn: shopeeOrderFees.orderSn,
          commissionFee: shopeeOrderFees.commissionFee,
          serviceFee: shopeeOrderFees.serviceFee,
          sellerOrderProcessingFee: shopeeOrderFees.sellerOrderProcessingFee,
          actualShippingFee: shopeeOrderFees.actualShippingFee,
          shopeeShippingRebate: shopeeOrderFees.shopeeShippingRebate,
          sellerVoucher: shopeeOrderFees.sellerVoucher,
          amsCommissionFee: shopeeOrderFees.amsCommissionFee,
          sellerReturnRefund: shopeeOrderFees.sellerReturnRefund,
          finalShippingFee: shopeeOrderFees.finalShippingFee,
        })
        .from(shopeeOrderFees)
        .where(inArray(shopeeOrderFees.orderSn, chunk));

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
      const rows = await Promise.race([queryPromise, timeoutPromise]);

      if (rows === null) {
        console.warn("[fetchOrderFees] Query timed out, using default fees");
        break;
      }

      for (const row of rows) {
        map.set(row.orderSn, {
          commissionFee: row.commissionFee,
          serviceFee: row.serviceFee,
          sellerOrderProcessingFee: row.sellerOrderProcessingFee,
          actualShippingFee: row.actualShippingFee,
          shopeeShippingRebate: row.shopeeShippingRebate,
          sellerVoucher: row.sellerVoucher,
          amsCommissionFee: row.amsCommissionFee,
          sellerReturnRefund: row.sellerReturnRefund,
          finalShippingFee: row.finalShippingFee,
        });
      }
    }
  } catch (err: any) {
    console.warn("[fetchOrderFees] Error:", err?.message);
  }

  return map;
}

// ─── fetchShopNames ────────────────────────────────────────────────────────────

/**
 * Fetches shop names for the given shop IDs.
 * Falls back to "Shop #${shopId}" if the shop is not in the credentials table.
 * Returns empty Map if shopIds array is empty.
 */
async function fetchShopNames(shopIds: number[]): Promise<Map<number, string>> {
  if (shopIds.length === 0) return new Map();

  const rows = await db
    .select({
      shopId: shopeeCredentials.shopId,
      shopName: shopeeCredentials.shopName,
    })
    .from(shopeeCredentials)
    .where(inArray(shopeeCredentials.shopId, shopIds));

  const map = new Map<number, string>();
  for (const row of rows) {
    map.set(row.shopId, row.shopName ?? `Shop #${row.shopId}`);
  }

  // Fill in missing shop IDs with fallback names
  for (const id of shopIds) {
    if (!map.has(id)) {
      map.set(id, `Shop #${id}`);
    }
  }

  return map;
}

// ─── resolveAdsShopIds ─────────────────────────────────────────────────────────

/**
 * Resolves the list of shop IDs for ads expense calculation.
 * 
 * When callerShopId is provided, returns [callerShopId] (single-element array).
 * Otherwise, SELECT shop_id from shopeeCredentials and return the list as-is
 * (including length 1).
 * 
 * Requirements: 5.2, 5.3
 */
async function resolveAdsShopIds(callerShopId?: number): Promise<number[]> {
  if (callerShopId !== undefined) {
    return [callerShopId];
  }
  
  const rows = await db
    .select({ shopId: shopeeCredentials.shopId })
    .from(shopeeCredentials);
  
  return rows.map((r) => r.shopId);
}

// ─── AdsCostOutcome ────────────────────────────────────────────────────────────

/**
 * Result of safely computing total ad cost with error handling.
 */
interface AdsCostOutcome {
  totalAdCost: number;            // safe value to assign to summary
  status: "ok" | "partial" | "failed";
  skippedShopIds: number[];
  errorMessage?: string;
}

/**
 * Safely computes total ad cost with comprehensive error handling.
 * 
 * Wraps getTotalAdsExpense in try/catch and validates the result:
 * - On exception: { totalAdCost: 0, status: "failed", skippedShopIds: [], errorMessage }
 * - On non-finite or negative total: { totalAdCost: 0, status: "failed", skippedShopIds }
 * - On result.allShopsFailed === true: { totalAdCost: 0, status: "failed", skippedShopIds }
 * - On partial (some skipped): { totalAdCost: result.total, status: "partial", skippedShopIds }
 * - On full success: { totalAdCost: result.total, status: "ok", skippedShopIds: [] }
 * 
 * Requirements: 1.5, 5.6, 11.4
 */
async function computeTotalAdCostSafely(
  callerShopId: number | undefined,
  startDate: string,
  endDate: string,
): Promise<AdsCostOutcome> {
  try {
    const shopIds = await resolveAdsShopIds(callerShopId);
    const result = await getTotalAdsExpense(shopIds, startDate, endDate);
    
    // Validate result.total is finite and non-negative
    if (!Number.isFinite(result.total) || result.total < 0) {
      return {
        totalAdCost: 0,
        status: "failed",
        skippedShopIds: result.skippedShops.map((s) => s.shopId),
      };
    }
    
    // Check if all shops failed
    if (result.allShopsFailed) {
      return {
        totalAdCost: 0,
        status: "failed",
        skippedShopIds: result.skippedShops.map((s) => s.shopId),
      };
    }
    
    // Partial success (some shops skipped)
    if (result.skippedShops.length > 0) {
      return {
        totalAdCost: result.total,
        status: "partial",
        skippedShopIds: result.skippedShops.map((s) => s.shopId),
      };
    }
    
    // Full success
    return {
      totalAdCost: result.total,
      status: "ok",
      skippedShopIds: [],
    };
  } catch (err: any) {
    console.warn("[profit] getTotalAdsExpense threw:", err?.message);
    return {
      totalAdCost: 0,
      status: "failed",
      skippedShopIds: [],
      errorMessage: err?.message,
    };
  }
}

// ─── getProfitSummary ──────────────────────────────────────────────────────────

/**
 * Fetches completed orders in date range, resolves costs via Cost_Resolver
 * (single path, no fallback), calculates profit per order, and aggregates
 * into a single summary.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 17.1, 17.2, 17.3, 17.4, 17.5,
 *               17.6, 17.7, 17.8, 18.1, 18.2, 18.3
 */
export async function getProfitSummary(
  params: ProfitQueryParams,
): Promise<ProfitSummaryResponse> {
  const { startDate, endDate, shopId } = params;

  // Compute ads cost BEFORE checking orders.length (Requirement 1.4)
  const adsOutcome = await computeTotalAdCostSafely(shopId, startDate, endDate);

  const orders = await fetchCompletedOrders({ startDate, endDate }, shopId);

  if (orders.length === 0) {
    return {
      success: true,
      data: {
        dateRange: { start: startDate, end: endDate },
        shopId: shopId ?? null,
        totalRevenue: 0,
        totalShopeeDeductions: 0,
        totalHpp: 0,
        totalPackingCost: 0,
        totalAdCost: adsOutcome.totalAdCost,
        totalNetProfit: -adsOutcome.totalAdCost,
        profitMarginPercent: 0,
        orderCount: 0,
        totalQty: 0,
        hasUnresolvedHpp: false,
        unmappedOrderCount: 0,
        unmappedItemCount: 0,
        adsCostStatus: adsOutcome.status,
        adsCostSkippedShopIds: adsOutcome.skippedShopIds,
      },
    };
  }

  // Single-path resolution via Cost_Resolver — no fallback, bubble exceptions
  const ordersForResolve = buildOrdersForResolve(orders);
  const resolvedMap = await Cost_Resolver_resolveOrders(ordersForResolve);

  let unmappedOrderCount = 0;
  let unmappedItemCount = 0;

  const orderProfitResults = orders.map((order) => {
    const resolved = resolvedMap.get(order.orderSn);
    if (!resolved) {
      // Should not happen — resolveOrders guarantees 1:1 with input
      throw new Error(`[getProfitSummary] Missing resolved data for order ${order.orderSn}`);
    }

    // Count unmapped items for this order
    const orderUnmappedItems = resolved.itemCosts.filter((c) => !c.mapped);
    if (resolved.hasUnresolvedHpp) {
      unmappedOrderCount += 1;
    }
    unmappedItemCount += orderUnmappedItems.length;

    return calculateOrderProfit(buildOrderCostInput(order, resolved));
  });

  const summary = aggregateProfitSummary(orderProfitResults);

  // Calculate total quantity (pcs) from all orders' items
  const totalQty = orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => itemSum + item.qty, 0);
  }, 0);

  // Recompute totalNetProfit with real totalAdCost (Requirement 1.2)
  const totalNetProfit = 
    summary.totalRevenue - 
    summary.totalShopeeDeductions - 
    summary.totalHpp - 
    summary.totalPackingCost - 
    adsOutcome.totalAdCost;

  return {
    success: true,
    data: {
      dateRange: { start: startDate, end: endDate },
      shopId: shopId ?? null,
      totalRevenue: summary.totalRevenue,
      totalShopeeDeductions: summary.totalShopeeDeductions,
      totalHpp: summary.totalHpp,
      totalPackingCost: summary.totalPackingCost,
      totalAdCost: adsOutcome.totalAdCost,
      totalNetProfit,
      profitMarginPercent: summary.totalRevenue > 0 
        ? (totalNetProfit / summary.totalRevenue) * 100 
        : 0,
      orderCount: summary.orderCount,
      totalQty,
      hasUnresolvedHpp: summary.hasUnresolvedHpp,
      unmappedOrderCount,
      unmappedItemCount,
      adsCostStatus: adsOutcome.status,
      adsCostSkippedShopIds: adsOutcome.skippedShopIds,
    },
  };
}

// ─── getOrderProfitList ────────────────────────────────────────────────────────

/**
 * Returns a paginated list of orders with full profit breakdown per order.
 * Uses Cost_Resolver.resolveOrders as single resolution path.
 *
 * Requirements: 15.1, 15.2, 15.3, 17.5, 17.6, 24.2, 24.3
 */
export async function getOrderProfitList(
  params: ProfitQueryParams & { page?: number; limit?: number },
): Promise<PaginatedOrderProfitResponse> {
  const { startDate, endDate, shopId } = params;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;

  const allOrders = await fetchOrdersInRange(startDate, endDate, shopId);
  const total = allOrders.length;
  const totalPages = Math.ceil(total / limit);
  const paginatedOrders = allOrders.slice((page - 1) * limit, page * limit);

  if (paginatedOrders.length === 0) {
    return {
      success: true,
      data: {
        orders: [],
        pagination: { page, limit, total, totalPages },
      },
    };
  }

  const orderSns = paginatedOrders.map((o) => o.orderSn);
  const shopIds = [...new Set(paginatedOrders.map((o) => o.shopId))];

  const [itemsMap, feesMap, shopNamesMap] = await Promise.all([
    fetchOrderItems(orderSns),
    fetchOrderFees(orderSns),
    fetchShopNames(shopIds),
  ]);

  // Build FetchedOrder[] for the paginated batch
  const fetchedOrders: FetchedOrder[] = paginatedOrders.map((order) => {
    const rawItems = itemsMap.get(order.orderSn) ?? [];
    const rawFees = feesMap.get(order.orderSn) ?? { ...DEFAULT_FEES };
    return {
      orderSn: order.orderSn,
      shopId: order.shopId,
      shopName: shopNamesMap.get(order.shopId) ?? `Shop #${order.shopId}`,
      createTime: order.createTime,
      escrowReleaseTime: order.escrowReleaseTime ?? null,
      items: rawItems.map((item) => ({
        itemName: item.itemName,
        modelName: item.modelName,
        modelSku: item.modelSku,
        qty: item.qty,
        itemPrice: item.itemPrice,
        itemId: item.itemId,
        modelId: item.modelId,
      })),
      fees: {
        commissionFee: rawFees.commissionFee,
        serviceFee: rawFees.serviceFee,
        sellerOrderProcessingFee: rawFees.sellerOrderProcessingFee,
        actualShippingFee: rawFees.actualShippingFee,
        shopeeShippingRebate: rawFees.shopeeShippingRebate,
        sellerVoucher: rawFees.sellerVoucher,
        amsCommissionFee: rawFees.amsCommissionFee,
        sellerReturnRefund: rawFees.sellerReturnRefund,
      },
    };
  });

  // Single-path batch resolution — bubble exceptions
  const ordersForResolve = buildOrdersForResolve(fetchedOrders);
  const resolvedMap = await Cost_Resolver_resolveOrders(ordersForResolve);

  const orderResults = fetchedOrders.map((order) => {
    const resolved = resolvedMap.get(order.orderSn);
    if (!resolved) {
      throw new Error(`[getOrderProfitList] Missing resolved data for order ${order.orderSn}`);
    }

    const profitResult = calculateOrderProfit(buildOrderCostInput(order, resolved));

    // Build unmappedItems list from items where !mapped
    const unmappedItems = order.items
      .map((item, i) => ({ item, resolvedCost: resolved.itemCosts[i] }))
      .filter(({ resolvedCost }) => resolvedCost && !resolvedCost.mapped)
      .map(({ item }) => ({
        itemName: item.itemName,
        modelName: item.modelName ?? null,
        modelId: item.modelId ?? null,
      }));

    return {
      orderSn: order.orderSn,
      shopId: order.shopId,
      shopName: order.shopName,
      createTime: formatDateLocal(order.createTime),
      escrowReleaseTime: order.escrowReleaseTime ? formatDateLocal(order.escrowReleaseTime) : null,
      revenue: profitResult.revenue,
      shopeeDeductions: profitResult.totalShopeeDeductions,
      hpp: profitResult.totalHpp,
      packingCost: profitResult.totalPackingCost,
      adCost: profitResult.totalAdCost,
      netProfit: profitResult.netProfit,
      profitMarginPercent: profitResult.profitMarginPercent,
      hasUnresolvedHpp: resolved.hasUnresolvedHpp,
      unmappedItems,
      items: order.items.map((item, i) => {
        const resolvedCost = resolved.itemCosts[i];
        return {
          itemName: item.itemName,
          modelName: item.modelName,
          modelSku: item.modelSku,
          qty: item.qty,
          itemPrice: item.itemPrice,
          hppPerUnit: resolvedCost?.hppPerUnit ?? 0,
          packingCostPerUnit: 0, // packing cost is now per-order, not per-item
          hppFound: resolvedCost?.hppFound ?? false,
        };
      }),
      deductionBreakdown: profitResult.deductionBreakdown,
    };
  });

  return {
    success: true,
    data: {
      orders: orderResults,
      pagination: { page, limit, total, totalPages },
    },
  };
}

// ─── getShopPerformance ────────────────────────────────────────────────────────

/**
 * Aggregates profit metrics grouped by shop and sorts by specified metric.
 * Uses Cost_Resolver.resolveOrders as single resolution path.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 8.3, 15.1, 15.2
 */
export async function getShopPerformance(
  params: Omit<ProfitQueryParams, "shopId"> & { sortBy?: string },
): Promise<ShopPerformanceResponse> {
  const { startDate, endDate, sortBy } = params;

  const orders = await fetchOrdersInRange(startDate, endDate);

  if (orders.length === 0) {
    return {
      success: true,
      data: {
        shops: [],
        sortBy: sortBy ?? "revenue",
      },
    };
  }

  const orderSns = orders.map((o) => o.orderSn);
  const shopIds = [...new Set(orders.map((o) => o.shopId))];

  const [itemsMap, feesMap, shopNamesMap] = await Promise.all([
    fetchOrderItems(orderSns),
    fetchOrderFees(orderSns),
    fetchShopNames(shopIds),
  ]);

  // Build FetchedOrder[] for batch resolution
  const fetchedOrders: FetchedOrder[] = orders.map((order) => {
    const rawItems = itemsMap.get(order.orderSn) ?? [];
    const rawFees = feesMap.get(order.orderSn) ?? { ...DEFAULT_FEES };
    return {
      orderSn: order.orderSn,
      shopId: order.shopId,
      shopName: shopNamesMap.get(order.shopId) ?? `Shop #${order.shopId}`,
      createTime: order.createTime,
      escrowReleaseTime: order.escrowReleaseTime ?? null,
      items: rawItems.map((item) => ({
        itemName: item.itemName,
        modelName: item.modelName,
        modelSku: item.modelSku,
        qty: item.qty,
        itemPrice: item.itemPrice,
        itemId: item.itemId,
        modelId: item.modelId,
      })),
      fees: {
        commissionFee: rawFees.commissionFee,
        serviceFee: rawFees.serviceFee,
        sellerOrderProcessingFee: rawFees.sellerOrderProcessingFee,
        actualShippingFee: rawFees.actualShippingFee,
        shopeeShippingRebate: rawFees.shopeeShippingRebate,
        sellerVoucher: rawFees.sellerVoucher,
        amsCommissionFee: rawFees.amsCommissionFee,
        sellerReturnRefund: rawFees.sellerReturnRefund,
      },
    };
  });

  // Single-path batch resolution — bubble exceptions
  const ordersForResolve = buildOrdersForResolve(fetchedOrders);
  const resolvedMap = await Cost_Resolver_resolveOrders(ordersForResolve);

  const shopOrderGroups = fetchedOrders.map((order) => {
    const resolved = resolvedMap.get(order.orderSn);
    if (!resolved) {
      throw new Error(`[getShopPerformance] Missing resolved data for order ${order.orderSn}`);
    }

    const profitResult = calculateOrderProfit(buildOrderCostInput(order, resolved));

    return {
      shopId: order.shopId,
      shopName: order.shopName,
      profitResult,
    };
  });

  const shops = aggregateShopPerformance(shopOrderGroups, sortBy);

  return {
    success: true,
    data: {
      shops,
      sortBy: sortBy ?? "revenue",
    },
  };
}

// ─── getProductPerformance ─────────────────────────────────────────────────────

/**
 * Aggregates profit metrics grouped by product (MSKU, product group, or variation).
 * Uses Cost_Resolver.resolveOrders as single resolution path.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.4, 15.1, 15.2
 */
export async function getProductPerformance(
  params: ProfitQueryParams & { groupBy?: GroupByLevel; sortBy?: string },
): Promise<ProductPerformanceResponse> {
  const { startDate, endDate, shopId, groupBy = "msku", sortBy } = params;

  const orders = await fetchOrdersInRange(startDate, endDate, shopId);

  if (orders.length === 0) {
    return {
      success: true,
      data: {
        products: [],
        groupBy,
        sortBy: sortBy ?? "netProfit",
      },
    };
  }

  const orderSns = orders.map((o) => o.orderSn);
  const shopIds = [...new Set(orders.map((o) => o.shopId))];

  const [itemsMap, shopNamesMap] = await Promise.all([
    fetchOrderItems(orderSns),
    fetchShopNames(shopIds),
  ]);

  // Build FetchedOrder[] for batch resolution
  const fetchedOrders: FetchedOrder[] = orders.map((order) => {
    const rawItems = itemsMap.get(order.orderSn) ?? [];
    return {
      orderSn: order.orderSn,
      shopId: order.shopId,
      shopName: shopNamesMap.get(order.shopId) ?? `Shop #${order.shopId}`,
      createTime: order.createTime,
      escrowReleaseTime: order.escrowReleaseTime ?? null,
      items: rawItems.map((item) => ({
        itemName: item.itemName,
        modelName: item.modelName,
        modelSku: item.modelSku,
        qty: item.qty,
        itemPrice: item.itemPrice,
        itemId: item.itemId,
        modelId: item.modelId,
      })),
      fees: null,
    };
  });

  // Single-path batch resolution — bubble exceptions
  const ordersForResolve = buildOrdersForResolve(fetchedOrders);
  const resolvedMap = await Cost_Resolver_resolveOrders(ordersForResolve);

  // Collect all item groups with resolved costs
  const productItemGroups: Array<{
    productName: string;
    variantName: string | null;
    modelSku: string | null;
    productGroupId: number | null;
    totalRevenue: number;
    netProfit: number;
    qty: number;
  }> = [];

  for (const order of fetchedOrders) {
    const resolved = resolvedMap.get(order.orderSn);
    if (!resolved) {
      throw new Error(`[getProductPerformance] Missing resolved data for order ${order.orderSn}`);
    }

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i]!;
      const resolvedCost = resolved.itemCosts[i];

      const hppPerUnit = resolvedCost?.hppPerUnit ?? 0;
      const revenue = item.itemPrice * item.qty;
      const hppTotal = hppPerUnit * item.qty;
      // Per-item net profit for product aggregation = revenue - hpp
      // (packing cost is per-order, not attributed per-item in product view)
      const itemNetProfit = revenue - hppTotal;

      // Resolve product group and product name for grouping
      let productGroupId: number | null = null;
      let productName = item.itemName;
      const variantName = item.modelName;

      if (item.modelSku) {
        const productRows = await db
          .select({ groupId: products.groupId, groupName: productGroups.name })
          .from(products)
          .innerJoin(productGroups, eq(products.groupId, productGroups.id))
          .where(
            and(
              eq(products.shopId, order.shopId),
              eq(products.modelSku, item.modelSku),
            ),
          )
          .limit(1);

        const productRow = productRows[0];
        if (productRow) {
          productGroupId = productRow.groupId;
          productName = productRow.groupName;
        }
      }

      productItemGroups.push({
        productName,
        variantName: variantName ?? null,
        modelSku: item.modelSku ?? null,
        productGroupId,
        totalRevenue: revenue,
        netProfit: itemNetProfit,
        qty: item.qty,
      });
    }
  }

  const products_result = aggregateProductPerformance(productItemGroups, groupBy, sortBy);

  return {
    success: true,
    data: {
      products: products_result,
      groupBy,
      sortBy: sortBy ?? "netProfit",
    },
  };
}

// ─── getShopeeDeductions ───────────────────────────────────────────────────────

/**
 * Aggregates Shopee fee deductions for orders in the date range.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 8.5
 */
export async function getShopeeDeductions(
  params: ProfitQueryParams,
): Promise<ShopeeDeductionsResponse> {
  const { startDate, endDate, shopId } = params;

  const orders = await fetchOrdersInRange(startDate, endDate, shopId);

  if (orders.length === 0) {
    return {
      success: true,
      data: {
        totalCommission: 0,
        totalServiceFee: 0,
        totalProcessingFee: 0,
        totalAmsCommission: 0,
        totalSellerReturnRefund: 0,
        totalFinalShippingFee: 0,
        grandTotal: 0,
      },
    };
  }

  const orderSns = orders.map((o) => o.orderSn);
  const feesMap = await fetchOrderFees(orderSns);

  let totalCommission = 0;
  let totalServiceFee = 0;
  let totalProcessingFee = 0;
  let totalAmsCommission = 0;
  let totalSellerReturnRefund = 0;
  let totalFinalShippingFee = 0;

  for (const fees of feesMap.values()) {
    totalCommission += fees.commissionFee;
    totalServiceFee += fees.serviceFee;
    totalProcessingFee += fees.sellerOrderProcessingFee;
    totalAmsCommission += fees.amsCommissionFee;
    totalSellerReturnRefund += fees.sellerReturnRefund;
    totalFinalShippingFee += fees.finalShippingFee;
  }

  // Grand total semantics:
  //   Other deductions are stored as positive integers and summed positively.
  //   `final_shipping_fee` is signed:
  //     - Negative (seller bears shipping) → counts as a deduction → subtract
  //       from grandTotal makes it MORE positive: `grandTotal -= -X` = `+X`.
  //     - Positive (seller receives refund) → reduces total deductions →
  //       subtracting positive value reduces grandTotal: `grandTotal -= +X` = `-X`.
  //   Hence: subtract the signed value, regardless of sign.
  const grandTotal =
    totalCommission +
    totalServiceFee +
    totalProcessingFee +
    totalAmsCommission +
    totalSellerReturnRefund -
    totalFinalShippingFee;

  return {
    success: true,
    data: {
      totalCommission,
      totalServiceFee,
      totalProcessingFee,
      totalAmsCommission,
      totalSellerReturnRefund,
      totalFinalShippingFee,
      grandTotal,
    },
  };
}
