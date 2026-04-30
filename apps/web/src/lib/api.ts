const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export async function fetchApi<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
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
  
  // Label Pengiriman / Shipping Labels (Custom Label via Puppeteer)
  orderLabel: (orderSn: string) =>
    fetchApi<{
      success: boolean;
      data: {
        orderSn: string;
        pdf: string;        // base64 PDF
        format: 'pdf';
        trackingNumber: string;
      };
      message?: string;
    }>(`/orders/${orderSn}/custom-label`),
  
  // Legacy Shopee label (fallback)
  orderLabelShopee: (orderSn: string) =>
    fetchApi<{
      success: boolean;
      data: {
        orderSn: string;
        url: string;
        format: 'pdf' | 'png' | 'jpg';
        trackingNumber: string;
      };
      message?: string;
    }>(`/orders/${orderSn}/shipping-label`),
  
  orderLabelsBatch: (orderSns: string[]) =>
    fetchApi<{
      success: boolean;
      data: {
        total: number;
        successful: number;
        failed: number;
        pdf?: string;       // base64 multi-page PDF
        format?: 'pdf';
        results: Array<{
          orderSn: string;
          success: boolean;
          error?: string;
        }>;
      };
      message?: string;
    }>('/orders/custom-labels/batch', {
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
};
