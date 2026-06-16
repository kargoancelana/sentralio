/**
 * Shared API response types for the frontend.
 * Single source of truth for data shapes returned by the Sentralio API.
 */

// ─── Generic ──────────────────────────────────────────────────────────────────

/** Standard paginated/list envelope */
export interface ApiList<T> {
  success: boolean;
  data: T[];
}

/** Standard single-item envelope */
export interface ApiItem<T> {
  success: boolean;
  data: T;
}

// ─── Master Product ───────────────────────────────────────────────────────────

export interface MasterProductVariant {
  id: number;
  masterProductId: number;
  sku: string;
  name: string;
  stock: number;
}

export interface LinkedModel {
  id: number;
  shopId: number;
  shopeeModelId: string;
  shopeeItemId: string;
  groupId: number;
  modelName: string | null;
  modelSku: string | null;
  price: number | null;
  shopeeStock: number | null;
  syncStatus: string;
}

export interface LinkedGroup {
  id: number;
  shopeeItemId: string | null;
  name: string;
  imageUrl: string | null;
}

export interface MasterProduct {
  id: number;
  sku: string;
  name: string;
  stock: number;
  imageUrl: string | null;
  variants: MasterProductVariant[];
  linked_models: LinkedModel[];
  linked_groups: LinkedGroup[];
}

// ─── Unlinked Model ───────────────────────────────────────────────────────────

export interface UnlinkedModel {
  id: number;
  shopeeModelId: string;
  shopeeItemId: string;
}

// ─── Order ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: number;
  orderSn: string;
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  qty: number;
  itemPrice: number;
  itemId: string | null;
  modelId: string | null;
}

export interface OrderRow {
  id: number;
  shopId: number;
  orderSn: string;
  orderStatus: string;
  totalAmount: number;
  buyerUsername: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  shipByDate: number;
  labelPrinted: number;
  labelPrintedAt: string | null;
  payTime: string | null;
  createTime: string;
  updatedAt: string;
  items?: OrderItem[];
}

// ─── Shopee Catalog ───────────────────────────────────────────────────────────

export interface ShopeeModel {
  shopeeModelId: string;
  modelName: string | null;
  modelSku: string | null;
  price: number | null;
  shopeeStock: number | null;
  syncStatus: string;
  masterProductId: number | null;
}

export interface ShopeeItem {
  id: number;
  shopId: number;
  shopeeItemId: string | null;
  name: string;
  itemSku: string | null;
  itemStatus: string | null;
  imageUrl: string | null;
  stock: number;
  models: ShopeeModel[];
}

// ─── Shopee Credentials ───────────────────────────────────────────────────────

export interface ShopeeCredential {
  id: number;
  shop_id: number;
  shop_name: string;
  connected: boolean;
  is_expired: boolean;
  expires_at: string;
  updated_at: string;
}
