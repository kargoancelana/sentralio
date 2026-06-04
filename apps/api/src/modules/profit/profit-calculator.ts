/**
 * Profit Calculator
 *
 * Pure functions for profit calculation. No I/O — all inputs are provided
 * as plain data so every function is deterministic and easily testable.
 *
 * All monetary values are integers (Rupiah, no decimals).
 *
 * Requirements: 1.1, 2.1, 2.2, 2.3, 3.2, 3.3, 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 16.1, 16.2, 16.3, 16.4
 */

import type {
  GroupByLevel,
  OrderCostInput,
  OrderItemProfitResult,
  OrderProfitResult,
  ProductItemGroup,
  ProductPerformanceResult,
  ProfitSummaryResult,
  ShopOrderGroup,
  ShopPerformanceResult,
} from "./profit.types";

// Re-export types that are defined in profit.types but used heavily alongside
// these functions so consumers can import from a single location.
export type {
  GroupByLevel,
  OrderCostInput,
  OrderItemCostInput,
  OrderItemProfitResult,
  OrderProfitResult,
  ProductItemGroup,
  ProductPerformanceResult,
  ProfitSummaryResult,
  ShopOrderGroup,
  ShopPerformanceResult,
} from "./profit.types";

// ─── Task 2.1 ─────────────────────────────────────────────────────────────────

/**
 * Calculate profit for a single order.
 *
 * Formula:
 *   revenue              = Σ(itemPrice × qty)
 *   sellerShippingCost   = actualShippingFee − shopeeShippingRebate
 *   totalShopeeDeductions = commissionFee + serviceFee
 *                           + sellerOrderProcessingFee
 *                           + sellerShippingCost
 *                           + sellerVoucher
 *   netProfit            = revenue − totalShopeeDeductions
 *                           − totalHpp − totalPackingCost − totalAdCost
 *
 * Requirements: 1.1, 2.1, 2.2, 2.3
 */
export function calculateOrderProfit(input: OrderCostInput): OrderProfitResult {
  // ── Item-level calculations ──────────────────────────────────────────────
  const items: OrderItemProfitResult[] = input.items.map((item) => {
    const revenue = item.itemPrice * item.qty;
    const hppTotal = item.hppPerUnit * item.qty;
    const netProfit = revenue - hppTotal;
    return { revenue, hppTotal, netProfit, hppFound: item.hppFound };
  });

  // ── Order-level aggregation ──────────────────────────────────────────────
  const revenue = items.reduce((sum, i) => sum + i.revenue, 0);
  const totalHpp = items.reduce((sum, i) => sum + i.hppTotal, 0);
  // Packing cost is now a single per-order value, not per-item × qty
  const totalPackingCost = input.packingCostPerOrder;
  const totalAdCost = input.adCost;

  // ── Shopee deduction breakdown ───────────────────────────────────────────
  const sellerShippingCost = input.actualShippingFee - input.shopeeShippingRebate;
  const deductionBreakdown = {
    commissionFee: input.commissionFee,
    serviceFee: input.serviceFee,
    sellerOrderProcessingFee: input.sellerOrderProcessingFee,
    sellerShippingCost,
    sellerVoucher: input.sellerVoucher,
    amsCommissionFee: input.amsCommissionFee,
  };
  const totalShopeeDeductions =
    deductionBreakdown.commissionFee +
    deductionBreakdown.serviceFee +
    deductionBreakdown.sellerOrderProcessingFee +
    deductionBreakdown.sellerShippingCost +
    deductionBreakdown.sellerVoucher +
    deductionBreakdown.amsCommissionFee;

  // ── Net profit and margin ────────────────────────────────────────────────
  const netProfit = revenue - totalShopeeDeductions - totalHpp - totalPackingCost - totalAdCost;
  const profitMarginPercent = calculateProfitMargin(netProfit, revenue);

  // ── Unresolved HPP flag ──────────────────────────────────────────────────
  const hasUnresolvedHpp = input.items.some((item) => !item.hppFound);

  return {
    revenue,
    totalShopeeDeductions,
    totalHpp,
    totalPackingCost,
    totalAdCost,
    netProfit,
    profitMarginPercent,
    deductionBreakdown,
    items,
    hasUnresolvedHpp,
  };
}

// ─── Task 2.2 ─────────────────────────────────────────────────────────────────

/**
 * Calculate profit margin as a percentage.
 *
 * Returns `(netProfit / revenue) × 100` when revenue > 0, otherwise 0.
 *
 * Requirements: 3.3, 4.3, 5.3
 */
export function calculateProfitMargin(netProfit: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return (netProfit / revenue) * 100;
}

// ─── Task 2.3 ─────────────────────────────────────────────────────────────────

/**
 * Aggregate profit summary across multiple orders.
 *
 * Sums all monetary fields, counts orders, and propagates the
 * `hasUnresolvedHpp` flag if any single order has it set.
 *
 * Requirements: 3.2, 3.3, 3.6
 */
export function aggregateProfitSummary(orders: OrderProfitResult[]): ProfitSummaryResult {
  const totalRevenue = orders.reduce((sum, o) => sum + o.revenue, 0);
  const totalNetProfit = orders.reduce((sum, o) => sum + o.netProfit, 0);
  const totalHpp = orders.reduce((sum, o) => sum + o.totalHpp, 0);
  const totalPackingCost = orders.reduce((sum, o) => sum + o.totalPackingCost, 0);
  const totalShopeeDeductions = orders.reduce((sum, o) => sum + o.totalShopeeDeductions, 0);
  const totalAdCost = orders.reduce((sum, o) => sum + o.totalAdCost, 0);
  const profitMarginPercent = calculateProfitMargin(totalNetProfit, totalRevenue);
  const orderCount = orders.length;
  const hasUnresolvedHpp = orders.some((o) => o.hasUnresolvedHpp);

  return {
    totalRevenue,
    totalNetProfit,
    totalHpp,
    totalPackingCost,
    totalShopeeDeductions,
    totalAdCost,
    profitMarginPercent,
    orderCount,
    hasUnresolvedHpp,
  };
}

// ─── Task 2.4 ─────────────────────────────────────────────────────────────────

/** Valid sort keys for shop performance results (maps API param → ShopPerformanceResult field) */
type ShopSortMetric = "totalRevenue" | "totalNetProfit" | "profitMarginPercent" | "orderCount";

const SHOP_SORT_METRIC_MAP: Record<string, ShopSortMetric> = {
  revenue: "totalRevenue",
  netProfit: "totalNetProfit",
  profitMarginPercent: "profitMarginPercent",
  orderCount: "orderCount",
};

function resolveShopSortMetric(value: string | undefined): ShopSortMetric {
  if (!value) return "totalRevenue";
  return SHOP_SORT_METRIC_MAP[value] ?? "totalRevenue";
}

/**
 * Aggregate and rank shop performance from a list of order-shop pairs.
 *
 * Groups orders by (shopId, shopName), computes per-shop metrics, and
 * returns results sorted descending by `sortBy` (default: "revenue").
 * Shops with zero revenue / zero orders are included in the output.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export function aggregateShopPerformance(
  orders: ShopOrderGroup[],
  sortBy?: string,
): ShopPerformanceResult[] {
  const resolvedSortBy: ShopSortMetric = resolveShopSortMetric(sortBy);

  // Accumulate per-shop totals
  const shopMap = new Map<
    number,
    {
      shopId: number;
      shopName: string;
      totalRevenue: number;
      totalNetProfit: number;
      orderCount: number;
    }
  >();

  for (const { shopId, shopName, profitResult } of orders) {
    if (!shopMap.has(shopId)) {
      shopMap.set(shopId, {
        shopId,
        shopName,
        totalRevenue: 0,
        totalNetProfit: 0,
        orderCount: 0,
      });
    }
    const entry = shopMap.get(shopId)!;
    entry.totalRevenue += profitResult.revenue;
    entry.totalNetProfit += profitResult.netProfit;
    entry.orderCount += 1;
  }

  // Build results with profit margin
  const results: ShopPerformanceResult[] = Array.from(shopMap.values()).map((entry) => ({
    shopId: entry.shopId,
    shopName: entry.shopName,
    totalRevenue: entry.totalRevenue,
    totalNetProfit: entry.totalNetProfit,
    profitMarginPercent: calculateProfitMargin(entry.totalNetProfit, entry.totalRevenue),
    orderCount: entry.orderCount,
  }));

  // Sort descending by chosen metric
  results.sort((a, b) => b[resolvedSortBy] - a[resolvedSortBy]);

  return results;
}

// ─── Task 2.5 ─────────────────────────────────────────────────────────────────

/** Valid sort keys for product performance results (maps API param → ProductPerformanceResult field) */
type ProductSortMetric = "totalNetProfit" | "profitMarginPercent" | "qtySold";

const PRODUCT_SORT_API_PARAMS = ["netProfit", "profitMarginPercent", "qtySold"] as const;
type ProductSortApiParam = typeof PRODUCT_SORT_API_PARAMS[number];

const PRODUCT_SORT_METRIC_MAP: Record<ProductSortApiParam, ProductSortMetric> = {
  netProfit: "totalNetProfit",
  profitMarginPercent: "profitMarginPercent",
  qtySold: "qtySold",
};

function resolveProductSortMetric(value: string | undefined): ProductSortMetric {
  if (!value) return "totalNetProfit";
  if ((PRODUCT_SORT_API_PARAMS as ReadonlyArray<string>).includes(value)) {
    return PRODUCT_SORT_METRIC_MAP[value as ProductSortApiParam];
  }
  return "totalNetProfit";
}

/**
 * Build a string key for grouping product items.
 *
 * - "msku"          → group by `modelSku` (falls back to productName if null)
 * - "product_group" → group by `productGroupId` (falls back to productName)
 * - "variation"     → group by `productName + variantName` (finest grain)
 */
function buildProductGroupKey(item: ProductItemGroup, groupBy: GroupByLevel): string {
  switch (groupBy) {
    case "msku":
      return item.modelSku ?? `__no_sku__${item.productName}`;
    case "product_group":
      return item.productGroupId !== null
        ? String(item.productGroupId)
        : `__no_group__${item.productName}`;
    case "variation":
    default:
      return `${item.productName}|${item.variantName ?? ""}`;
  }
}

/**
 * Aggregate and rank product performance from a list of product item groups.
 *
 * Groups items by the specified level (msku / product_group / variation),
 * computes per-group metrics, and returns results sorted descending by
 * `sortBy` (default: "netProfit").
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export function aggregateProductPerformance(
  items: ProductItemGroup[],
  groupBy: GroupByLevel,
  sortBy?: string,
): ProductPerformanceResult[] {
  const resolvedSortBy: ProductSortMetric = resolveProductSortMetric(sortBy);

  // Accumulate per-group totals
  const groupMap = new Map<
    string,
    {
      productName: string;
      variantName: string | null;
      modelSku: string | null;
      productGroupId: number | null;
      totalRevenue: number;
      totalNetProfit: number;
      qtySold: number;
    }
  >();

  for (const item of items) {
    const key = buildProductGroupKey(item, groupBy);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        productName: item.productName,
        variantName: item.variantName,
        modelSku: item.modelSku,
        productGroupId: item.productGroupId,
        totalRevenue: 0,
        totalNetProfit: 0,
        qtySold: 0,
      });
    }
    const entry = groupMap.get(key)!;
    entry.totalRevenue += item.totalRevenue;
    entry.totalNetProfit += item.netProfit;
    entry.qtySold += item.qty;
  }

  // Build results
  const results: ProductPerformanceResult[] = Array.from(groupMap.values()).map((entry) => ({
    productName: entry.productName,
    variantName: entry.variantName,
    modelSku: entry.modelSku,
    productGroupId: entry.productGroupId,
    totalNetProfit: entry.totalNetProfit,
    profitMarginPercent: calculateProfitMargin(entry.totalNetProfit, entry.totalRevenue),
    qtySold: entry.qtySold,
    avgProfitPerUnit: entry.qtySold > 0 ? entry.totalNetProfit / entry.qtySold : 0,
  }));

  // Sort descending by chosen metric
  results.sort((a, b) => b[resolvedSortBy] - a[resolvedSortBy]);

  return results;
}
