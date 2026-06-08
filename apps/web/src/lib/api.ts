const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// ─── Profit Analytics Types ───────────────────────────────────────────────────

/** Single item in an order's profit breakdown */
export interface OrderProfitItem {
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  qty: number;
  itemPrice: number;
  hppPerUnit: number;
  packingCostPerUnit: number;
  hppFound: boolean;
  /** True if this item could not be mapped to a Master Product variant */
  hasUnresolvedHpp: boolean;
  /** Items that could not be mapped — used for unmapped indicator display */
  unmappedItems: Array<{
    itemName: string;
    modelName: string | null;
    modelId: string | null;
  }>;
}

/** Summary response from GET /profit/summary */
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
    /** Total quantity (pcs) across all items in the period */
    totalQty: number;
    hasUnresolvedHpp: boolean;
    /** Number of orders that have at least one unmapped item (Requirements 17.1, 17.4) */
    unmappedOrderCount: number;
    /** Total count of unmapped items across all orders (Requirements 17.5) */
    unmappedItemCount: number;
  };
}

/** Single order entry in GET /profit/orders response */
export interface OrderProfitEntry {
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
  /** True if any item in this order could not be mapped to a Master Product variant */
  hasUnresolvedHpp: boolean;
  /** Items that could not be mapped to a Master Product variant (Requirements 17.4, 17.5) */
  unmappedItems: Array<{
    itemName: string;
    modelName: string | null;
    modelId: string | null;
  }>;
  items: OrderProfitItem[];
  deductionBreakdown: {
    commissionFee: number;
    serviceFee: number;
    sellerOrderProcessingFee: number;
    sellerShippingCost: number;
    sellerVoucher: number;
    amsCommissionFee: number;
  };
}

/** Paginated response from GET /profit/orders */
export interface PaginatedOrderProfitResponse {
  success: true;
  data: {
    orders: OrderProfitEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * Parse a raw profit summary response, applying default safety so that
 * null/undefined fields from older API versions are treated as 0/false.
 * Requirements: 17.1, 17.4, 17.5, 21.6
 */
export function parseProfitSummaryResponse(raw: any): ProfitSummaryResponse {
  const data = raw?.data ?? {};
  return {
    success: true,
    data: {
      dateRange: data.dateRange ?? { start: '', end: '' },
      shopId: data.shopId ?? null,
      totalRevenue: data.totalRevenue ?? 0,
      totalShopeeDeductions: data.totalShopeeDeductions ?? 0,
      totalHpp: data.totalHpp ?? 0,
      totalPackingCost: data.totalPackingCost ?? 0,
      totalAdCost: data.totalAdCost ?? 0,
      totalNetProfit: data.totalNetProfit ?? 0,
      profitMarginPercent: data.profitMarginPercent ?? 0,
      orderCount: data.orderCount ?? 0,
      totalQty: data.totalQty ?? 0,
      hasUnresolvedHpp: data.hasUnresolvedHpp ?? false,
      // Default safety: treat null/undefined as 0 (Req 21.6)
      unmappedOrderCount: data.unmappedOrderCount ?? 0,
      unmappedItemCount: data.unmappedItemCount ?? 0,
    },
  };
}

/**
 * Parse a raw order profit entry, applying default safety so that
 * null/undefined fields from older API versions are treated as 0/false/[].
 * Requirements: 17.4, 17.5, 21.6
 */
export function parseOrderProfitEntry(raw: any): OrderProfitEntry {
  return {
    orderSn: raw.orderSn ?? '',
    shopId: raw.shopId ?? 0,
    shopName: raw.shopName ?? '',
    createTime: raw.createTime ?? '',
    escrowReleaseTime: raw.escrowReleaseTime ?? null,
    revenue: raw.revenue ?? 0,
    shopeeDeductions: raw.shopeeDeductions ?? 0,
    hpp: raw.hpp ?? 0,
    packingCost: raw.packingCost ?? 0,
    adCost: raw.adCost ?? 0,
    netProfit: raw.netProfit ?? 0,
    profitMarginPercent: raw.profitMarginPercent ?? 0,
    // Default safety: treat null/undefined as false (Req 21.6)
    hasUnresolvedHpp: raw.hasUnresolvedHpp ?? false,
    // Default safety: treat null/undefined as [] (Req 21.6)
    unmappedItems: Array.isArray(raw.unmappedItems) ? raw.unmappedItems : [],
    items: Array.isArray(raw.items)
      ? raw.items.map((item: any): OrderProfitItem => ({
          itemName: item.itemName ?? '',
          modelName: item.modelName ?? null,
          modelSku: item.modelSku ?? null,
          qty: item.qty ?? 0,
          itemPrice: item.itemPrice ?? 0,
          hppPerUnit: item.hppPerUnit ?? 0,
          packingCostPerUnit: item.packingCostPerUnit ?? 0,
          hppFound: item.hppFound ?? false,
          hasUnresolvedHpp: item.hasUnresolvedHpp ?? false,
          unmappedItems: Array.isArray(item.unmappedItems) ? item.unmappedItems : [],
        }))
      : [],
    deductionBreakdown: {
      commissionFee: raw.deductionBreakdown?.commissionFee ?? 0,
      serviceFee: raw.deductionBreakdown?.serviceFee ?? 0,
      sellerOrderProcessingFee: raw.deductionBreakdown?.sellerOrderProcessingFee ?? 0,
      sellerShippingCost: raw.deductionBreakdown?.sellerShippingCost ?? 0,
      sellerVoucher: raw.deductionBreakdown?.sellerVoucher ?? 0,
      amsCommissionFee: raw.deductionBreakdown?.amsCommissionFee ?? 0,
    },
  };
}

export async function fetchApi<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    // Dispatch session-expired event on 401 for any non-login path (Req 4.5, 10.2).
    // Skipped for /auth/login to avoid a redirect loop on bad credentials.
    if (res.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('wms.session-expired'));
    }
    throw new ApiError(res.status, data.message || data.error || `API error ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Status Kesehatan (Health)
  health: () => fetchApi('/health'),

  // Master Produk
  masterList: () => fetchApi<{ success: boolean; data: any[] }>('/master/list'),
  masterUpdate: (id: number, body: { sku?: string; name?: string }) =>
    fetchApi(`/master/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  masterUpdateStock: (masterProductId: number, stock: number) =>
    fetchApi('/master/update-stock', { method: 'POST', body: JSON.stringify({ master_product_id: masterProductId, stock }) }),
  masterUpdateVariants: (masterProductId: number, variants: any[]) =>
    fetchApi('/master/update-variants', { method: 'POST', body: JSON.stringify({ master_product_id: masterProductId, variants }) }),
  masterMap: (masterProductId: number, shopeeModelIds: string[]) =>
    fetchApi('/master/map', { method: 'POST', body: JSON.stringify({ master_product_id: masterProductId, shopee_model_ids: shopeeModelIds }) }),
  masterImport: (shopeeItemId: string) =>
    fetchApi('/master/import-from-listing', { method: 'POST', body: JSON.stringify({ shopee_item_id: shopeeItemId }) }),
  masterUnlinked: () => fetchApi<{ success: boolean; data: any[] }>('/master/unlinked-models'),
  masterDelete: (id: number) =>
    fetchApi(`/master/${id}`, { method: 'DELETE' }),
  masterUnlink: (shopeeItemId: string) =>
    fetchApi('/master/unlink', { method: 'POST', body: JSON.stringify({ shopee_item_id: shopeeItemId }) }),
  masterLinkGroup: (masterProductId: number, shopeeItemId: string) =>
    fetchApi('/master/link-group', { method: 'POST', body: JSON.stringify({ master_product_id: masterProductId, shopee_item_id: shopeeItemId }) }),

  // Produk Channel
  productStock: (groupId: number) => fetchApi(`/products/stock/${groupId}`),
  productUpdateStock: (groupId: number, stock: number, source?: string) =>
    fetchApi('/products/stock/update', { method: 'POST', body: JSON.stringify({ group_id: groupId, stock, source }) }),

  // Pesanan / Orders
  orderList: () => fetchApi<{ success: boolean; data: any[] }>('/orders'),
  orderSync: (shopId?: number, daysBack: number = 60, cursor?: string, shopIndex?: number, orderStatus?: string) => 
    fetchApi('/orders/sync', { 
      method: 'POST', 
      body: JSON.stringify({ 
        shop_id: shopId, 
        days_back: daysBack, 
        cursor, 
        shop_index: shopIndex,
        order_status: orderStatus
      }) 
    }),
  orderShip: (orderSn: string, shipmentMethod: 'pickup' | 'dropoff') =>
    fetchApi<{ success: boolean; message?: string; trackingNumber?: string }>(`/orders/ship/${orderSn}`, { method: 'POST', body: JSON.stringify({ shipment_method: shipmentMethod }) }),
  orderShipBatch: (orderSns: string[], shipmentMethod: 'pickup' | 'dropoff') =>
    fetchApi('/orders/ship/batch', { method: 'POST', body: JSON.stringify({ order_sns: orderSns, shipment_method: shipmentMethod }) }),
  orderFetchTrackingNumber: (orderSn: string) =>
    fetchApi<{ success: boolean; data?: { orderSn: string; trackingNumber: string }; message?: string }>(`/orders/${orderSn}/tracking-number`),
  
  // Official Shopee Label (PDF from API)
  orderShippingLabel: (orderSn: string) =>
    fetchApi<{
      success: boolean;
      data?: { orderSn: string; url: string; format: string; trackingNumber: string; retrievedAt: string };
      error?: string;
    }>(`/orders/${orderSn}/shipping-label`),

  // Official Shopee Label BATCH (optimized — 1 merged PDF for all orders)
  orderShippingLabelBatch: (orderSns: string[]) =>
    fetchApi<{
      success: boolean;
      data?: { url?: string; urls?: string[]; format: string; successCount: number; failedOrders: Array<{ orderSn: string; error: string }> };
      error?: string;
    }>('/orders/shipping-labels/batch-download', {
      method: 'POST',
      body: JSON.stringify({ order_sns: orderSns })
    }),

  // Custom Label Data (Frontend Rendering)
  orderLabelData: (orderSn: string) =>
    fetchApi<{
      success: boolean;
      data: import('../types/label').LabelData;
      message?: string;
    }>(`/orders/${orderSn}/label-data`),

  orderLabelDataBatch: (orderSns: string[]) =>
    fetchApi<{
      success: boolean;
      data: {
        results: Array<{
          orderSn: string;
          success: boolean;
          data?: import('../types/label').LabelData;
          error?: string;
        }>;
        successful: number;
        failed: number;
        total: number;
      };
      message?: string;
    }>('/orders/label-data/batch', {
      method: 'POST',
      body: JSON.stringify({ order_sns: orderSns })
    }),
  
  // Tandai label sudah/belum dicetak
  orderMarkLabelPrinted: (orderSn: string, printed: boolean) =>
    fetchApi<{ success: boolean; message?: string }>(`/orders/${orderSn}/label-printed`, {
      method: 'PATCH',
      body: JSON.stringify({ printed })
    }),
  orderMarkLabelPrintedBatch: (orderSns: string[], printed: boolean) =>
    fetchApi<{ success: boolean; message?: string }>('/orders/batch/label-printed', {
      method: 'PATCH',
      body: JSON.stringify({ order_sns: orderSns, printed })
    }),

  // Shopee — Otorisasi
  shopeeGetAuthUrl: () => fetchApi<{ auth_url: string }>('/shopee/auth/url'),
  shopeeExchangeToken: (code: string, shopId: string) =>
    fetchApi('/shopee/auth/exchange', { method: 'POST', body: JSON.stringify({ code, shop_id: shopId }) }),

  // Shopee — Kredensial (Multi-seller)
  shopeeCredentialsList: () => fetchApi<{ success: boolean; data: any[] }>('/shopee/credentials/list'),
  shopeeCredentialsStatus: (shopId?: number) => {
    const qs = shopId ? `?shop_id=${shopId}` : '';
    return fetchApi(`/shopee/credentials/status${qs}`);
  },
  shopeeDisconnect: (shopId: number) =>
    fetchApi(`/shopee/credentials/${shopId}`, { method: 'DELETE' }),

  // Shopee — Operasi
  shopeeTestShop: () => fetchApi('/shopee/test-shop'),
  shopeeSyncProducts: () => fetchApi('/shopee/sync-products'),
  shopeeRealItems: (offset = 0, pageSize = 20) =>
    fetchApi(`/shopee/real-items?offset=${offset}&page_size=${pageSize}`),
  shopeeCatalog: () => fetchApi<{ success: boolean; data: any[] }>('/shopee/catalog'),
  shopeeUpdateItem: (itemId: string, data: { name?: string; description?: string }) =>
    fetchApi('/shopee/update-item', { method: 'POST', body: JSON.stringify({ item_id: itemId, ...data }) }),
  shopeeUpdatePrice: (itemId: string, modelId: string, price: number) =>
    fetchApi('/shopee/update-price', { method: 'POST', body: JSON.stringify({ item_id: itemId, model_id: modelId, price }) }),
  shopeeUpdateVariantStock: (itemId: string, modelId: string, stock: number) =>
    fetchApi('/shopee/update-variant-stock', { method: 'POST', body: JSON.stringify({ item_id: itemId, model_id: modelId, stock }) }),
  shopeeToggleStatus: (itemIds: string[], unlist: boolean) =>
    fetchApi('/shopee/toggle-status', { method: 'POST', body: JSON.stringify({ item_ids: itemIds, unlist }) }),
  shopeeUpdateModel: (itemId: string, modelId: string, data: { model_name?: string; model_sku?: string }) =>
    fetchApi('/shopee/update-model', { method: 'POST', body: JSON.stringify({ item_id: itemId, model_id: modelId, ...data }) }),

  // Profit Analytics
  profitSummary: async (startDate: string, endDate: string, shopId?: number): Promise<ProfitSummaryResponse> => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (shopId) params.set('shop_id', String(shopId));
    const raw = await fetchApi(`/profit/summary?${params}`);
    return parseProfitSummaryResponse(raw);
  },
  profitOrders: async (startDate: string, endDate: string, shopId?: number, page = 1, limit = 20): Promise<PaginatedOrderProfitResponse> => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, page: String(page), limit: String(limit) });
    if (shopId) params.set('shop_id', String(shopId));
    const raw = await fetchApi(`/profit/orders?${params}`);
    const orders = Array.isArray(raw?.data?.orders)
      ? raw.data.orders.map(parseOrderProfitEntry)
      : [];
    return {
      success: true,
      data: {
        orders,
        pagination: raw?.data?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 },
      },
    };
  },
  profitProducts: (startDate: string, endDate: string, shopId?: number, groupBy = 'msku', sortBy = 'netProfit') => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, group_by: groupBy, sort_by: sortBy });
    if (shopId) params.set('shop_id', String(shopId));
    return fetchApi(`/profit/products?${params}`);
  },
  profitDeductions: (startDate: string, endDate: string, shopId?: number) => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (shopId) params.set('shop_id', String(shopId));
    return fetchApi(`/profit/deductions?${params}`);
  },

  // Staff permissions (admin only)
  permissionsList: () =>
    fetchApi<{ ok: boolean; permissions: Array<{ feature: string; enabled: boolean }> }>(
      '/auth/permissions',
    ),
  permissionsUpdate: (permissions: Array<{ feature: string; enabled: boolean }>) =>
    fetchApi<{ ok: boolean; permissions: Array<{ feature: string; enabled: boolean }> }>(
      '/auth/permissions',
      { method: 'PUT', body: JSON.stringify({ permissions }) },
    ),
};
