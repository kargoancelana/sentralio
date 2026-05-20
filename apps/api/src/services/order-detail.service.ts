/**
 * Order Detail Service
 *
 * Orchestrates fetching, caching, and assembling the full OrderDetailResponse
 * for the Order Detail Modal feature.
 *
 * Architecture:
 * - Pure transformation helpers (formatRp, asAmount, buildIncomeBreakdown,
 *   buildBuyerPayment, buildAdjustments, assembleOrderDetailResponse) are
 *   exported for property-based testing.
 * - The main `getOrderDetail` orchestrator is dependency-injected for testability.
 *
 * **Validates: Requirements 8.2, 8.3, 8.6, 8.7, 8.8, 8.9, 9.1, 9.2, 9.3, 9.4, 11.1**
 */

import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";
import { eq } from "drizzle-orm";
import { getShopeeOrderDetails, getEscrowDetail } from "./shopee-raw";
import { OrderDetailCache, type OrderDetailResponse } from "./order-detail-cache.service";

// Re-export OrderDetailResponse so consumers can import from this file
export type { OrderDetailResponse };

// ---------------------------------------------------------------------------
// Sub-types (re-exported for property tests)
// ---------------------------------------------------------------------------

export type IncomeBreakdown = OrderDetailResponse["incomeBreakdown"];
export type BuyerPayment = OrderDetailResponse["buyerPayment"];
export type Adjustment = OrderDetailResponse["adjustments"][number];

// ---------------------------------------------------------------------------
// ImageKey — used by resolveImages
// ---------------------------------------------------------------------------

export interface ImageKey {
  itemId: string;
  modelId: string;
}

// ---------------------------------------------------------------------------
// Discriminated union result type
// ---------------------------------------------------------------------------

export type OrderDetailResult =
  | { kind: "ok"; data: OrderDetailResponse }
  | { kind: "not_found" }
  | { kind: "marketplace_unsupported" }
  | { kind: "upstream_error"; message: string }
  | { kind: "timeout" };

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface OrderDetailServiceDeps {
  /** Fetch Shopee order detail. Defaults to getShopeeOrderDetails from shopee-raw. */
  fetchOrderDetail?: (shopId: number, orderSn: string) => Promise<any>;
  /** Fetch Shopee escrow detail. Defaults to getEscrowDetail from shopee-raw. */
  fetchEscrowDetail?: (shopId: number, orderSn: string) => Promise<any>;
  /** Resolve product images from local DB. Defaults to resolveImages from product-image-resolver. */
  resolveImages?: (shopId: number, orderSn: string, items: ImageKey[]) => Promise<Map<string, string | null>>;
  /** Cache instance. Defaults to a module-level singleton. */
  cache?: OrderDetailCache;
  /** Injectable clock for testing. Defaults to Date.now. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Module-level cache singleton (shared across requests)
// ---------------------------------------------------------------------------

const defaultCache = new OrderDetailCache();

// ---------------------------------------------------------------------------
// Pure helper: asAmount
// ---------------------------------------------------------------------------

/**
 * Normalizes a nullable/undefined/NaN number to 0.
 *
 * **Validates: Requirements 5.9**
 *
 * @example
 * asAmount(null)      // 0
 * asAmount(undefined) // 0
 * asAmount(NaN)       // 0
 * asAmount(1500)      // 1500
 * asAmount(-500)      // -500
 */
export function asAmount(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && isNaN(value)) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Pure helper: formatRp
// ---------------------------------------------------------------------------

/**
 * Formats a number as Indonesian Rupiah currency string.
 *
 * Rules:
 * - null/undefined/NaN → "Rp 0"
 * - Non-negative n → "Rp <n formatted with id-ID locale>"
 * - Negative n → "-Rp <|n| formatted with id-ID locale>"
 *
 * The id-ID locale uses `.` as the thousands separator and `,` as the decimal
 * separator. Since Rupiah has no fractional units, we format as integer.
 *
 * **Validates: Requirements 5.8**
 *
 * @example
 * formatRp(0)       // "Rp 0"
 * formatRp(1000)    // "Rp 1.000"
 * formatRp(-500)    // "-Rp 500"
 * formatRp(null)    // "Rp 0"
 */
export function formatRp(value: number | null | undefined): string {
  const n = asAmount(value);
  const abs = Math.abs(n);
  // Use Intl.NumberFormat with id-ID locale, no decimal places
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);

  if (n < 0) {
    return `-Rp ${formatted}`;
  }
  return `Rp ${formatted}`;
}

// ---------------------------------------------------------------------------
// Pure helper: buildIncomeBreakdown
// ---------------------------------------------------------------------------

/**
 * Maps `escrow.order_income` (raw Shopee payload) into the typed `IncomeBreakdown`
 * structure used by the modal.
 *
 * All null/undefined fee fields are normalized to 0 via `asAmount`.
 * The `productSubtotal` is computed as Σ(discounted_price * quantity_purchased).
 * The shipping `rollup` is computed as buyerPaid - actualToCarrier + shopeeRebate.
 *
 * **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 5.9**
 */
export function buildIncomeBreakdown(income: any): IncomeBreakdown {
  const rawItems: any[] = Array.isArray(income?.items) ? income.items : [];

  const items = rawItems.map((item: any) => {
    const unitPrice = asAmount(item?.discounted_price);
    const quantity = asAmount(item?.quantity_purchased);
    const subtotal = unitPrice * quantity;
    return {
      itemId: String(item?.item_id ?? ""),
      modelId: String(item?.model_id ?? ""),
      itemName: String(item?.item_name ?? ""),
      modelName: item?.model_name != null ? String(item.model_name) : null,
      modelSku: item?.model_sku != null ? String(item.model_sku) : null,
      unitPrice,
      quantity,
      subtotal,
      // imageUrl is resolved separately and injected by assembleOrderDetailResponse
      imageUrl: null as string | null,
    };
  });

  const productSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  const buyerPaid = asAmount(income?.buyer_paid_shipping_fee);
  const actualToCarrier = asAmount(income?.actual_shipping_fee);
  const shopeeRebate = asAmount(income?.shopee_shipping_rebate);
  const rollup = buyerPaid - actualToCarrier + shopeeRebate;

  const adminFee = asAmount(income?.commission_fee);
  const serviceFee = asAmount(income?.service_fee);
  const processingFee = asAmount(income?.seller_order_processing_fee);

  const totalEstimatedIncome = asAmount(income?.escrow_amount);

  return {
    items,
    productSubtotal,
    shipping: {
      buyerPaid,
      actualToCarrier,
      shopeeRebate,
      rollup,
    },
    fees: {
      adminFee,
      serviceFee,
      processingFee,
    },
    totalEstimatedIncome,
  };
}

// ---------------------------------------------------------------------------
// Pure helper: buildBuyerPayment
// ---------------------------------------------------------------------------

/**
 * Maps `escrow.buyer_payment_info` (raw Shopee payload) into the typed
 * `BuyerPayment` structure.
 *
 * All null/undefined fields are normalized to 0 via `asAmount`.
 *
 * **Validates: Requirements 7.3**
 */
export function buildBuyerPayment(bp: any): BuyerPayment {
  return {
    productSubtotal: asAmount(bp?.merchant_subtotal),
    shippingFee: asAmount(bp?.shipping_fee),
    shopeeVoucher: asAmount(bp?.shopee_voucher),
    sellerVoucher: asAmount(bp?.seller_voucher),
    serviceFee: asAmount(bp?.buyer_service_fee),
    total: asAmount(bp?.buyer_total_amount),
  };
}

// ---------------------------------------------------------------------------
// Pure helper: buildAdjustments
// ---------------------------------------------------------------------------

/**
 * Maps `escrow.order_income.order_adjustment[]` (raw Shopee payload) into
 * the typed `Adjustment[]` array.
 *
 * Returns an empty array when the input is null, undefined, or empty.
 * Each entry preserves the sign of `amount` as returned by Shopee.
 *
 * **Validates: Requirements 6.2, 6.3**
 */
export function buildAdjustments(adj: any[] | null | undefined): Adjustment[] {
  if (!Array.isArray(adj) || adj.length === 0) {
    return [];
  }
  return adj.map((entry: any) => ({
    reason: String(entry?.adjustment_reason ?? ""),
    amount: asAmount(entry?.amount),
  }));
}

// ---------------------------------------------------------------------------
// Pure helper: assembleOrderDetailResponse
// ---------------------------------------------------------------------------

/**
 * Assembles the full `OrderDetailResponse` from raw upstream payloads and
 * the resolved image map.
 *
 * This is the single source-of-truth for field mapping between Shopee API
 * responses and the modal-facing response shape.
 *
 * **Validates: Requirements 8.6, 11.1**
 */
export function assembleOrderDetailResponse(input: {
  orderSn: string;
  orderStatus: string;
  marketplace: "shopee";
  orderDetail: any;
  escrowDetail: any;
  imageMap: Map<string, string | null>;
}): OrderDetailResponse {
  const { orderSn, orderStatus, marketplace, orderDetail, escrowDetail, imageMap } = input;

  // --- Recipient address ---
  const ra = orderDetail?.recipient_address ?? {};
  const recipientAddress = {
    name: String(ra.name ?? ""),
    phone: String(ra.phone ?? ""),
    fullAddress: String(ra.full_address ?? ""),
    town: ra.town != null ? String(ra.town) : null,
    district: ra.district != null ? String(ra.district) : null,
    city: ra.city != null ? String(ra.city) : null,
    state: ra.state != null ? String(ra.state) : null,
    region: ra.region != null ? String(ra.region) : null,
    zipcode: ra.zipcode != null ? String(ra.zipcode) : null,
  };

  // --- Packages ---
  const rawPackages: any[] = Array.isArray(orderDetail?.package_list)
    ? orderDetail.package_list
    : [];

  const packages = rawPackages.map((pkg: any, idx: number) => {
    const pkgItems: any[] = Array.isArray(pkg?.item_list) ? pkg.item_list : [];
    return {
      label: `Paket ${idx + 1}`,
      courierService: String(pkg?.shipping_carrier ?? ""),
      items: pkgItems.map((pkgItem: any) => {
        const itemId = String(pkgItem?.item_id ?? "");
        const modelId = String(pkgItem?.model_id ?? "");
        const imageKey = `${itemId}:${modelId}`;
        return {
          itemId,
          modelId,
          itemName: String(pkgItem?.item_name ?? ""),
          modelName: pkgItem?.model_name != null ? String(pkgItem.model_name) : null,
          quantity: asAmount(pkgItem?.model_quantity_purchased ?? pkgItem?.quantity ?? 0),
          imageUrl: imageMap.get(imageKey) ?? null,
        };
      }),
    };
  });

  // --- Income breakdown ---
  const orderIncome = escrowDetail?.order_income ?? {};
  const incomeBreakdown = buildIncomeBreakdown(orderIncome);

  // Inject resolved imageUrls into income breakdown items
  const incomeItemsWithImages = incomeBreakdown.items.map((item) => {
    const imageKey = `${item.itemId}:${item.modelId}`;
    return {
      ...item,
      imageUrl: imageMap.get(imageKey) ?? null,
    };
  });

  // --- Adjustments ---
  const adjustments = buildAdjustments(orderIncome?.order_adjustment);

  // --- Final earnings ---
  const escrowAmountAfterAdj = orderIncome?.escrow_amount_after_adjustment;
  const isFallback = escrowAmountAfterAdj == null;
  const finalEarningsAmount = isFallback
    ? asAmount(orderIncome?.escrow_amount)
    : asAmount(escrowAmountAfterAdj);

  // --- Buyer payment ---
  const buyerPayment = buildBuyerPayment(escrowDetail?.buyer_payment_info);

  // --- Buyer username ---
  // Prefer escrow buyer_user_name, fall back to order detail buyer_username
  const buyerUsername =
    escrowDetail?.buyer_user_name != null
      ? String(escrowDetail.buyer_user_name)
      : orderDetail?.buyer_username != null
      ? String(orderDetail.buyer_username)
      : null;

  return {
    marketplace,
    orderSn,
    orderStatus,
    buyerUsername,
    recipientAddress,
    packages,
    incomeBreakdown: {
      ...incomeBreakdown,
      items: incomeItemsWithImages,
    },
    adjustments,
    finalEarnings: {
      amount: finalEarningsAmount,
      isFallback,
    },
    buyerPayment,
  };
}

// ---------------------------------------------------------------------------
// Default image resolver (no-op stub — real impl in product-image-resolver.ts)
// ---------------------------------------------------------------------------

/**
 * Default resolveImages implementation that returns null for all keys.
 * The real implementation in product-image-resolver.ts queries the DB.
 * This stub is used when no custom resolver is injected, so the service
 * can function even before product-image-resolver.ts is implemented.
 */
async function defaultResolveImages(
  _shopId: number,
  _orderSn: string,
  keys: ImageKey[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const key of keys) {
    map.set(`${key.itemId}:${key.modelId}`, null);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main orchestrator: getOrderDetail
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full Order Detail fetch pipeline:
 * 1. Look up order in local DB to get shopId and orderStatus.
 * 2. If not found → `{ kind: "not_found" }`.
 * 3. Check marketplace (only "shopee" supported) → `{ kind: "marketplace_unsupported" }`.
 * 4. Check cache (unless refresh=true) → return cached if hit.
 * 5. Parallel fetch from Shopee APIs wrapped in a 10s timeout via Promise.race.
 * 6. If timeout → `{ kind: "timeout" }`.
 * 7. If Shopee returns error → `{ kind: "upstream_error", message }`.
 * 8. Resolve product images.
 * 9. Assemble response.
 * 10. Store in cache.
 * 11. Return `{ kind: "ok", data }`.
 *
 * **Validates: Requirements 8.2, 8.3, 8.7, 8.8, 8.9, 9.1, 9.2, 9.3, 9.4, 11.1**
 */
export async function getOrderDetail(
  orderSn: string,
  options: { refresh?: boolean } = {},
  deps: OrderDetailServiceDeps = {}
): Promise<OrderDetailResult> {
  const {
    fetchOrderDetail = async (shopId: number, sn: string) =>
      getShopeeOrderDetails(shopId, [sn]),
    fetchEscrowDetail = getEscrowDetail,
    resolveImages = defaultResolveImages,
    cache = defaultCache,
  } = deps;

  // -------------------------------------------------------------------------
  // Step 1: Look up order in local DB
  // -------------------------------------------------------------------------
  let shopId: number;
  let orderStatus: string;

  try {
    const row = await db
      .select({ shopId: shopeeOrders.shopId, orderStatus: shopeeOrders.orderStatus })
      .from(shopeeOrders)
      .where(eq(shopeeOrders.orderSn, orderSn))
      .limit(1);

    if (row.length === 0) {
      return { kind: "not_found" };
    }

    shopId = row[0].shopId;
    orderStatus = row[0].orderStatus;
  } catch (err: any) {
    console.error("[getOrderDetail] DB lookup failed:", err);
    return { kind: "upstream_error", message: "Gagal mengambil data pesanan dari database" };
  }

  // -------------------------------------------------------------------------
  // Step 2: Marketplace check (all orders in DB are Shopee for now)
  // -------------------------------------------------------------------------
  // Future: when multi-marketplace is added, check a marketplace column here.
  // For now, all orders are Shopee.
  const marketplace = "shopee" as const;

  // -------------------------------------------------------------------------
  // Step 3: Cache check
  // -------------------------------------------------------------------------
  if (!options.refresh) {
    const cached = cache.get(orderSn);
    if (cached) {
      return { kind: "ok", data: cached };
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Parallel Shopee fetch with 10s timeout
  // -------------------------------------------------------------------------
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 10_000);

  let orderDetailRaw: any;
  let escrowDetailRaw: any;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () =>
        reject(new Error("__TIMEOUT__"))
      );
    });

    const fetchPromise = Promise.all([
      fetchOrderDetail(shopId, orderSn),
      fetchEscrowDetail(shopId, orderSn),
    ]);

    const [orderDetailRes, escrowDetailRes] = await Promise.race([
      fetchPromise,
      timeoutPromise,
    ]);

    orderDetailRaw = orderDetailRes;
    escrowDetailRaw = escrowDetailRes;
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    if (err?.message === "__TIMEOUT__" || controller.signal.aborted) {
      return { kind: "timeout" };
    }
    console.error("[getOrderDetail] Shopee fetch failed:", err);
    return { kind: "upstream_error", message: err?.message ?? "Gagal mengambil data dari Shopee" };
  } finally {
    clearTimeout(timeoutHandle);
  }

  // -------------------------------------------------------------------------
  // Step 5: Check for Shopee-level errors in the response bodies
  // -------------------------------------------------------------------------
  // get_order_detail wraps the order in response.order_list[]
  const orderList: any[] = orderDetailRaw?.response?.order_list ?? [];
  const orderDetailData = orderList.find((o: any) => o.order_sn === orderSn) ?? orderList[0];

  if (orderDetailRaw?.error && orderDetailRaw.error !== "") {
    const msg = orderDetailRaw.message ?? "Shopee order detail error";
    console.error("[getOrderDetail] Shopee order detail error:", msg);
    return { kind: "upstream_error", message: msg };
  }

  if (escrowDetailRaw?.error && escrowDetailRaw.error !== "") {
    const msg = escrowDetailRaw.message ?? "Shopee escrow detail error";
    console.error("[getOrderDetail] Shopee escrow detail error:", msg);
    return { kind: "upstream_error", message: msg };
  }

  if (!orderDetailData) {
    return { kind: "upstream_error", message: "Data pesanan tidak ditemukan di respons Shopee" };
  }

  const escrowData = escrowDetailRaw?.response ?? escrowDetailRaw;

  // -------------------------------------------------------------------------
  // Step 6: Collect image keys from both income items and package items
  // -------------------------------------------------------------------------
  const imageKeySet = new Set<string>();
  const imageKeys: ImageKey[] = [];

  // From escrow income items
  const incomeItems: any[] = Array.isArray(escrowData?.order_income?.items)
    ? escrowData.order_income.items
    : [];
  for (const item of incomeItems) {
    const itemId = String(item?.item_id ?? "");
    const modelId = String(item?.model_id ?? "");
    const key = `${itemId}:${modelId}`;
    if (itemId && !imageKeySet.has(key)) {
      imageKeySet.add(key);
      imageKeys.push({ itemId, modelId });
    }
  }

  // From package list items
  const pkgList: any[] = Array.isArray(orderDetailData?.package_list)
    ? orderDetailData.package_list
    : [];
  for (const pkg of pkgList) {
    const pkgItems: any[] = Array.isArray(pkg?.item_list) ? pkg.item_list : [];
    for (const pkgItem of pkgItems) {
      const itemId = String(pkgItem?.item_id ?? "");
      const modelId = String(pkgItem?.model_id ?? "");
      const key = `${itemId}:${modelId}`;
      if (itemId && !imageKeySet.has(key)) {
        imageKeySet.add(key);
        imageKeys.push({ itemId, modelId });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Resolve images (never throws)
  // -------------------------------------------------------------------------
  let imageMap: Map<string, string | null>;
  try {
    imageMap = await resolveImages(shopId, orderSn, imageKeys);
  } catch (err) {
    console.warn("[getOrderDetail] Image resolution failed, using empty map:", err);
    imageMap = new Map();
  }

  // -------------------------------------------------------------------------
  // Step 8: Assemble response
  // -------------------------------------------------------------------------
  const response = assembleOrderDetailResponse({
    orderSn,
    orderStatus,
    marketplace,
    orderDetail: orderDetailData,
    escrowDetail: escrowData,
    imageMap,
  });

  // -------------------------------------------------------------------------
  // Step 9: Store in cache
  // -------------------------------------------------------------------------
  cache.set(orderSn, response);

  return { kind: "ok", data: response };
}
