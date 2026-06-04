/**
 * Profit Analytics Types
 *
 * Interfaces and union types for the profit analytics module.
 * All monetary values are in Indonesian Rupiah (integer, no decimals).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

// ─── Union Types ───────────────────────────────────────────────────────────────

/** Grouping level for product performance aggregation */
export type GroupByLevel = "msku" | "product_group" | "variation";

/** Sort metric for performance ranking endpoints */
export type SortByMetric =
  | "revenue"
  | "netProfit"
  | "profitMarginPercent"
  | "orderCount"
  | "qtySold"
  | "avgProfitPerUnit";

// ─── Calculator Input Interfaces ───────────────────────────────────────────────

/** Cost inputs for a single order line item */
export interface OrderItemCostInput {
  itemPrice: number;  // Harga jual per unit
  qty: number;
  hppPerUnit: number; // Resolved HPP value
  hppFound: boolean;  // Whether HPP was found or defaulted to 0
}

/** Cost inputs for a complete order */
export interface OrderCostInput {
  items: OrderItemCostInput[];
  packingCostPerOrder: number; // Per-order packing cost (non-negative); replaces per-item packingCostPerUnit × qty
  commissionFee: number;
  serviceFee: number;
  sellerOrderProcessingFee: number;
  actualShippingFee: number;
  shopeeShippingRebate: number;
  sellerVoucher: number;
  amsCommissionFee: number;
  adCost: number; // Placeholder: always 0
}

// ─── Calculator Result Interfaces ─────────────────────────────────────────────

/** Profit calculation result for a single order line item */
export interface OrderItemProfitResult {
  revenue: number;   // itemPrice * qty
  hppTotal: number;  // hppPerUnit * qty
  netProfit: number; // revenue - hppTotal (item-level, no fees; packing cost is per-order)
  hppFound: boolean;
}

/** Profit calculation result for a complete order */
export interface OrderProfitResult {
  revenue: number;               // Total harga jual
  totalShopeeDeductions: number; // Sum of all Shopee fees
  totalHpp: number;              // Sum of HPP for all items
  totalPackingCost: number;      // Per-order packing cost (= input.packingCostPerOrder, not per-item × qty)
  totalAdCost: number;           // Biaya iklan (placeholder 0)
  netProfit: number;             // revenue - deductions - hpp - packing - ads
  profitMarginPercent: number;   // (netProfit / revenue) * 100, or 0 if revenue = 0
  deductionBreakdown: {
    commissionFee: number;
    serviceFee: number;
    sellerOrderProcessingFee: number;
    sellerShippingCost: number; // actualShippingFee - shopeeShippingRebate
    sellerVoucher: number;
    amsCommissionFee: number;
  };
  items: OrderItemProfitResult[];
  hasUnresolvedHpp: boolean; // True if any item has hppFound = false
}

// ─── Aggregation Result Interfaces ────────────────────────────────────────────

/** Aggregated profit summary across multiple orders (internal use) */
export interface ProfitSummaryResult {
  totalRevenue: number;
  totalShopeeDeductions: number;
  totalHpp: number;
  totalPackingCost: number;
  totalAdCost: number;
  totalNetProfit: number;
  profitMarginPercent: number;
  orderCount: number;
  hasUnresolvedHpp: boolean;
}

/** Input grouping of an order with its associated shop info (for shop performance aggregation) */
export interface ShopOrderGroup {
  shopId: number;
  shopName: string;
  profitResult: OrderProfitResult;
}

/** Profit performance metrics for a single shop (internal use) */
export interface ShopPerformanceResult {
  shopId: number;
  shopName: string;
  totalRevenue: number;
  totalNetProfit: number;
  profitMarginPercent: number;
  orderCount: number;
}

/** Input grouping of a product item's contribution for product performance aggregation */
export interface ProductItemGroup {
  productName: string;
  variantName: string | null;
  modelSku: string | null;
  productGroupId: number | null;
  totalRevenue: number; // itemPrice * qty for this item contribution
  netProfit: number;    // item-level net profit
  qty: number;
}

/** Profit performance metrics for a single product/variant (internal use) */
export interface ProductPerformanceResult {
  productName: string;
  variantName: string | null;
  modelSku: string | null;
  productGroupId: number | null;
  totalNetProfit: number;
  profitMarginPercent: number;
  qtySold: number;
  avgProfitPerUnit: number;
}

// ─── API Response Types ────────────────────────────────────────────────────────

/** Response for GET /profit/summary */
export interface ProfitSummaryResponse {
  success: true;
  data: {
    dateRange: { start: string; end: string };
    shopId: number | null;
    totalRevenue: number;
    totalShopeeDeductions: number;
    totalHpp: number;
    totalPackingCost: number;
    totalAdCost: number;
    totalNetProfit: number;
    profitMarginPercent: number;
    orderCount: number;
    totalQty: number;           // Total quantity (pcs) across all orders
    hasUnresolvedHpp: boolean;
    unmappedOrderCount: number; // NEW: orders with at least one unmapped item
    unmappedItemCount: number;  // NEW: total unmapped items across all orders
    adsCostStatus?: "ok" | "partial" | "failed"; // NEW: status of ads cost computation
    adsCostSkippedShopIds?: number[]; // NEW: shop IDs that were skipped during ads cost fetch
  };
}

/** Response for GET /profit/orders (paginated) */
export interface PaginatedOrderProfitResponse {
  success: true;
  data: {
    orders: Array<{
      orderSn: string;
      shopId: number;
      shopName: string;
      createTime: string;
      escrowReleaseTime: string | null;
      revenue: number;
      shopeeDeductions: number;
      hpp: number;
      packingCost: number;
      adCost: number;
      netProfit: number;
      profitMarginPercent: number;
      hasUnresolvedHpp: boolean;
      unmappedItems: Array<{                // NEW: items not mapped to master
        itemName: string;
        modelName: string | null;
        modelId: string | null;
      }>;
      items: Array<{
        itemName: string;
        modelName: string | null;
        modelSku: string | null;
        qty: number;
        itemPrice: number;
        hppPerUnit: number;
        packingCostPerUnit: number;         // always 0 (packing cost is now per-order)
        hppFound: boolean;
      }>;
      deductionBreakdown: {
        commissionFee: number;
        serviceFee: number;
        sellerOrderProcessingFee: number;
        sellerShippingCost: number;
        sellerVoucher: number;
        amsCommissionFee: number;
      };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

/** Response for GET /profit/shops */
export interface ShopPerformanceResponse {
  success: true;
  data: {
    shops: Array<{
      shopId: number;
      shopName: string;
      totalRevenue: number;
      totalNetProfit: number;
      profitMarginPercent: number;
      orderCount: number;
    }>;
    sortBy: string;
  };
}

/** Response for GET /profit/products */
export interface ProductPerformanceResponse {
  success: true;
  data: {
    products: Array<{
      productName: string;
      variantName: string | null;
      modelSku: string | null;
      productGroupId: number | null;
      totalNetProfit: number;
      profitMarginPercent: number;
      qtySold: number;
      avgProfitPerUnit: number;
    }>;
    groupBy: string;
    sortBy: string;
  };
}

/** Response for GET /profit/deductions */
export interface ShopeeDeductionsResponse {
  success: true;
  data: {
    totalCommission: number;
    totalServiceFee: number;
    totalProcessingFee: number;
    totalAmsCommission: number;
    /** seller_return_refund — pengembalian dana ke buyer dari kantong seller akibat partial return */
    totalSellerReturnRefund: number;
    /**
     * final_shipping_fee — signed total ongkir yang ditanggung penjual.
     *   - Negatif: seller bayar ongkir → ikut menambah grand total potongan.
     *   - Positif: seller dapat refund ongkir → mengurangi grand total potongan.
     * Frontend display: tampilkan apa adanya (signed) dengan label "Ongkir Ditanggung Penjual".
     */
    totalFinalShippingFee: number;
    grandTotal: number;
  };
}
