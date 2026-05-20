import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeOrderItems, productGroups } from "../db/schema";

/**
 * Identifies a single (itemId, modelId) pair for image resolution.
 */
export interface ImageKey {
  itemId: string;
  modelId: string;
}

/**
 * Resolves product thumbnail image URLs for a set of (itemId, modelId) keys
 * belonging to a specific order.
 *
 * Resolution strategy:
 *   1. Query `shopee_order_items` filtered by `order_sn` and the given
 *      `(item_id, model_id)` pairs.
 *   2. LEFT JOIN `product_groups` on `(shop_id = shopId AND shopee_item_id = item_id)`
 *      to obtain `image_url`.
 *   3. Return a `Map<string, string | null>` keyed by `"${itemId}:${modelId}"`.
 *
 * Guarantees:
 * - Every key in `keys` is present in the returned map (value may be `null`).
 * - Returns an empty map immediately when `keys` is empty.
 * - Never throws — any DB error causes all keys to resolve to `null`.
 *
 * **Validates: Requirements 13.1, 13.2, 13.5**
 *
 * @param shopId  The shop that owns the order (used to scope the product_groups join).
 * @param orderSn The Shopee order SN.
 * @param keys    List of (itemId, modelId) pairs to resolve.
 * @returns       Map keyed by `"${itemId}:${modelId}"` → `imageUrl | null`.
 */
export async function resolveImages(
  shopId: number,
  orderSn: string,
  keys: ImageKey[],
): Promise<Map<string, string | null>> {
  // Seed the result map with null for every requested key so callers always
  // get a complete map regardless of what the DB returns.
  const result = new Map<string, string | null>();
  for (const key of keys) {
    result.set(`${key.itemId}:${key.modelId}`, null);
  }

  // Fast-path: nothing to resolve.
  if (keys.length === 0) {
    return result;
  }

  try {
    // Build the list of item_id values we need (deduplicated).
    // The LEFT JOIN is on (shop_id, shopee_item_id) so we only need item_ids.
    const itemIds = [...new Set(keys.map((k) => k.itemId))];

    // Execute the join query.
    //
    // Conceptual SQL:
    //   SELECT oi.item_id, oi.model_id, pg.image_url
    //   FROM shopee_order_items oi
    //   LEFT JOIN product_groups pg
    //     ON pg.shop_id = :shopId
    //    AND pg.shopee_item_id = oi.item_id
    //   WHERE oi.order_sn = :orderSn
    //     AND oi.item_id IN (:...itemIds)
    //
    // We filter by item_id IN (...) rather than (item_id, model_id) IN (...)
    // because Drizzle ORM does not natively support tuple IN expressions.
    // The post-query filter below handles the model_id dimension.
    const rows = await db
      .select({
        itemId: shopeeOrderItems.itemId,
        modelId: shopeeOrderItems.modelId,
        imageUrl: productGroups.imageUrl,
      })
      .from(shopeeOrderItems)
      .leftJoin(
        productGroups,
        and(
          eq(productGroups.shopId, shopId),
          eq(productGroups.shopeeItemId, shopeeOrderItems.itemId),
        ),
      )
      .where(
        and(
          eq(shopeeOrderItems.orderSn, orderSn),
          inArray(shopeeOrderItems.itemId, itemIds),
        ),
      );

    // Build a lookup map from the DB rows: "itemId:modelId" → imageUrl | null.
    // A row may have a null itemId or modelId if the column was never populated
    // (historical rows pre-migration 0018). Skip those rows.
    for (const row of rows) {
      if (row.itemId == null || row.modelId == null) {
        continue;
      }
      const mapKey = `${row.itemId}:${row.modelId}`;
      // Only update if this key was actually requested.
      if (result.has(mapKey)) {
        result.set(mapKey, row.imageUrl ?? null);
      }
    }
  } catch (err) {
    // Never throw — return null for all keys on any error.
    console.error("[product-image-resolver] DB error during resolveImages:", err);
    // The map is already seeded with null for all keys, so we just return it.
  }

  return result;
}
