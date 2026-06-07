/**
 * Helpers for normalizing Shopee order items before persisting them to
 * `shopee_order_items`.
 *
 * Why this exists
 * ---------------
 * Shopee's get_order_detail can return MULTIPLE rows in `item_list` that share
 * the same (item_id, model_id) — e.g. the same variant split across promo tiers
 * or packages:
 *
 *   { item_id: 24390368094, model_id: 275760991491, model_quantity_purchased: 3 }
 *   { item_id: 24390368094, model_id: 275760991491, model_quantity_purchased: 2 }
 *
 * The DB has UNIQUE(order_sn, item_id, model_id). If we insert each raw row with
 * `onDuplicateKeyUpdate { qty = ... }`, the second row OVERWRITES the first, so
 * a 5-pcs order is stored as 2 pcs — breaking picking lists and totals.
 *
 * The fix: aggregate rows by (item_id, model_id) and SUM their quantities
 * BEFORE persisting. The unit price and names are taken from the first row of
 * each group (they are identical for the same variant).
 */

export interface RawShopeeItem {
  item_id?: number | string | null;
  model_id?: number | string | null;
  item_name?: string | null;
  model_name?: string | null;
  model_sku?: string | null;
  model_quantity_purchased?: number | null;
  quantity_purchased?: number | null;
  model_discounted_price?: number | null;
  model_original_price?: number | null;
}

export interface NormalizedOrderItem {
  itemId: string | null;
  modelId: string | null;
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  qty: number;
  itemPrice: number;
}

/**
 * Collect the raw item rows for an order, falling back to package_list[].item_list
 * when the top-level item_list is empty.
 */
export function collectRawItems(order: {
  item_list?: RawShopeeItem[] | null;
  package_list?: { item_list?: RawShopeeItem[] | null }[] | null;
}): RawShopeeItem[] {
  const top = Array.isArray(order.item_list) ? order.item_list : [];
  if (top.length > 0) return top;

  const fromPackages: RawShopeeItem[] = [];
  for (const pkg of order.package_list ?? []) {
    for (const it of pkg?.item_list ?? []) fromPackages.push(it);
  }
  return fromPackages;
}

/**
 * Aggregate raw Shopee items by (item_id, model_id), summing quantities.
 *
 * - qty per row defaults to model_quantity_purchased ?? quantity_purchased ?? 1.
 * - unit price = model_discounted_price (rounded) when present, else
 *   model_original_price (rounded), else 0 — taken from the first row in a group.
 * - rows missing a per-row qty field (e.g. package_list items) still count as 1
 *   each, so N such rows for the same variant sum to N.
 */
export function aggregateOrderItems(rawItems: RawShopeeItem[]): NormalizedOrderItem[] {
  const groups = new Map<string, NormalizedOrderItem>();

  for (const item of rawItems) {
    const itemId = item.item_id != null && item.item_id !== '' ? String(item.item_id) : null;
    const modelId = item.model_id != null && item.model_id !== '' ? String(item.model_id) : null;
    const key = `${itemId ?? ''}|${modelId ?? ''}`;

    const rowQty =
      typeof item.model_quantity_purchased === 'number'
        ? item.model_quantity_purchased
        : typeof item.quantity_purchased === 'number'
          ? item.quantity_purchased
          : 1;

    const existing = groups.get(key);
    if (existing) {
      existing.qty += rowQty;
      // Keep the first non-empty name/price; only backfill if missing.
      if ((existing.modelName == null || existing.modelName === '') && item.model_name) {
        existing.modelName = item.model_name;
      }
      if ((existing.modelSku == null || existing.modelSku === '') && item.model_sku) {
        existing.modelSku = item.model_sku;
      }
      if (existing.itemPrice === 0) {
        existing.itemPrice = priceOf(item);
      }
    } else {
      groups.set(key, {
        itemId,
        modelId,
        itemName: item.item_name || '—',
        modelName: item.model_name ?? null,
        modelSku: item.model_sku ?? null,
        qty: rowQty,
        itemPrice: priceOf(item),
      });
    }
  }

  return [...groups.values()];
}

function priceOf(item: RawShopeeItem): number {
  // Prefer the discounted price, but only when it's a meaningful positive value.
  // Shopee sometimes returns model_discounted_price = 0 to mean "no discount
  // info" (NOT a free item) while model_original_price holds the real price.
  // Treating 0 as the price zeroed out revenue for those orders, so fall back
  // to original price when discounted is missing or 0.
  if (typeof item.model_discounted_price === 'number' && item.model_discounted_price > 0) {
    return Math.round(item.model_discounted_price);
  }
  return Math.round(item.model_original_price || 0);
}
