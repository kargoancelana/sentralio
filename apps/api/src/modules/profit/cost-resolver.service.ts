/**
 * Cost Resolver Service
 *
 * Pure logic + data access untuk memetakan order items ke master_product_variants
 * dan mengkomposisi resolusi HPP & packing cost. Menggantikan rantai fallback
 * 5-layer di profit.service.
 *
 * Algoritma:
 *   Algorithm 1: resolveItemVariant  — single item mapping via (shopId, itemId, modelId)
 *   Algorithm 2: resolvePackingCostForOrder — MAX packing cost dari unique masters
 *   Algorithm 4: resolveOrder        — orchestrator per order
 *   Algorithm 5: resolveOrders       — batch optimized (primary entry point)
 *
 * Read-only: tidak ada INSERT/UPDATE/DELETE/DDL.
 * Bubble error pada DB failure (no partial result).
 *
 * Requirements: 1.1–1.6, 2.1–2.6, 3.1–3.4, 4.1–4.7, 5.1–5.4, 6.1–6.5,
 *               7.1–7.5, 8.1–8.5, 23.1–23.3, 24.1
 */

import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../../db/client";
import { masterProductVariants, products } from "../../db/schema";
import { resolveHpp } from "../hpp/hpp.service";
import { resolveMasterPackingCost } from "../master/packing-cost/master-packing-cost.service";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Input untuk resolusi single item — identitas Shopee yang stabil.
 */
export interface ItemResolveContext {
  companyId: number;
  shopId: number;
  itemId: string | null;   // shopee_order_items.item_id
  modelId: string | null;  // shopee_order_items.model_id
  /**
   * Snapshot model_sku from `shopee_order_items.model_sku`. Optional fallback
   * input — only used if (shopId, itemId, modelId) does not resolve to a
   * `products` row. See OrderForResolve.items.modelSku for rationale.
   */
  modelSku?: string | null;
}

/**
 * Output resolusi mapping (variant + master).
 * reason menjelaskan kenapa mapped=false (null jika mapped=true).
 */
export interface ItemMapping {
  variantId: number | null;
  masterProductId: number | null;
  modelSku: string | null;  // products.model_sku yang dipakai untuk lookup (untuk debugging)
  mapped: boolean;          // = (variantId !== null)
  reason: "missing_identity" | "product_not_found" | "empty_model_sku" | "sku_not_in_master" | null;
}

/**
 * Per-item resolved cost (HPP saja; packing cost di-resolve per-order).
 */
export interface ItemResolvedCost {
  variantId: number | null;
  masterProductId: number | null;
  hppPerUnit: number;
  hppFound: boolean;
  mapped: boolean;
}

/**
 * Per-order resolved packing cost.
 */
export interface OrderPackingCostResult {
  packingCost: number;                    // hasil MAX, atau 0
  packingCostUnresolved: boolean;         // true jika SEMUA item unmapped
  contributingMasterProductIds: number[]; // unique master IDs yang berkontribusi (ascending sorted)
}

/**
 * Batch input — satu order dengan items + tanggal order.
 */
export interface OrderForResolve {
  orderSn: string;
  shopId: number;
  orderDate: string; // YYYY-MM-DD (WIB)
  items: Array<{
    itemId: string | null;
    modelId: string | null;
    /**
     * Snapshot model_sku from `shopee_order_items.model_sku`. Used as a
     * deterministic fallback to look up `master_product_variants.sku` directly
     * when (item_id, model_id) lookup against `products` fails — typically for
     * legacy rows synced before stable identity columns were populated.
     *
     * `master_product_variants.sku` is UNIQUE globally, so this fallback is
     * still 1:1 deterministic.
     */
    modelSku?: string | null;
    qty: number;
    itemPrice: number;
  }>;
}

/**
 * Output resolusi per order.
 */
export interface ResolvedOrder {
  orderSn: string;
  itemCosts: ItemResolvedCost[];      // 1:1 dengan items input
  packingCost: OrderPackingCostResult;
  hasUnresolvedHpp: boolean;          // true jika ANY item.mapped === false
}

// ─── Algorithm 1: resolveItemVariant ──────────────────────────────────────────

/**
 * Single-item mapping (tanpa HPP). Pure SQL lookup, no side effects.
 *
 * Resolution order:
 *   1. Primary: (shopId, itemId, modelId) → products.model_sku → master_product_variants.sku
 *   2. Fallback: ctx.modelSku (snapshot from shopee_order_items.model_sku) →
 *      master_product_variants.sku directly. Used for legacy rows where
 *      identity columns (item_id/model_id) are NULL or no longer present in
 *      the `products` mirror. master_product_variants.sku is UNIQUE globally
 *      so this is still 1:1 deterministic.
 *
 * PRECONDITION:
 *   ctx.shopId is integer
 *   ctx.itemId, ctx.modelId may be null (signal for unmapped via primary path)
 *   ctx.modelSku may be null (signal that no fallback is available)
 *
 * POSTCONDITION:
 *   Returns ItemMapping with mapped = (variantId !== null)
 *   No side effects on database (read-only)
 *   Deterministic: same input → same output (database state held constant)
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1–2.6, 3.1–3.4
 */
export async function resolveItemVariant(ctx: ItemResolveContext): Promise<ItemMapping> {
  // ─── Primary path: identity → products → master_product_variants ──────────
  let primaryReason: ItemMapping["reason"] | null = null;
  let modelSkuForLookup: string | null = null;

  if (ctx.itemId === null || ctx.modelId === null) {
    primaryReason = "missing_identity";
  } else {
    const productRows = await db
      .select({ modelSku: products.modelSku })
      .from(products)
      .where(
        and(
          eq(products.companyId, ctx.companyId),
          eq(products.shopId, ctx.shopId),
          eq(products.shopeeItemId, ctx.itemId),
          eq(products.shopeeModelId, ctx.modelId),
        ),
      )
      .limit(1);

    if (productRows.length === 0) {
      primaryReason = "product_not_found";
    } else {
      const trimmed = productRows[0]!.modelSku?.trim() ?? null;
      if (!trimmed) {
        primaryReason = "empty_model_sku";
      } else {
        modelSkuForLookup = trimmed;
      }
    }
  }

  // ─── Fallback path: snapshot model_sku (only when primary path failed) ────
  if (modelSkuForLookup === null) {
    const fallbackSku = ctx.modelSku?.trim();
    if (fallbackSku) {
      modelSkuForLookup = fallbackSku;
    }
  }

  if (modelSkuForLookup === null) {
    return {
      variantId: null,
      masterProductId: null,
      modelSku: null,
      mapped: false,
      // primaryReason is non-null here because modelSkuForLookup is null
      reason: primaryReason ?? "missing_identity",
    };
  }

  // ─── Lookup master_product_variants by sku (UNIQUE global) ────────────────
  const variantRows = await db
    .select({
      id: masterProductVariants.id,
      masterProductId: masterProductVariants.masterProductId,
    })
    .from(masterProductVariants)
    .where(
      and(
        eq(masterProductVariants.companyId, ctx.companyId),
        eq(masterProductVariants.sku, modelSkuForLookup),
      ),
    )
    .limit(1);

  if (variantRows.length === 0) {
    return {
      variantId: null,
      masterProductId: null,
      modelSku: modelSkuForLookup,
      mapped: false,
      reason: "sku_not_in_master",
    };
  }

  return {
    variantId: variantRows[0]!.id,
    masterProductId: variantRows[0]!.masterProductId,
    modelSku: modelSkuForLookup,
    mapped: true,
    reason: null,
  };
}

// ─── Algorithm 2: resolvePackingCostForOrder ───────────────────────────────────

/**
 * Resolve packing cost per order (MAX dari unique masters).
 *
 * PRECONDITION:
 *   uniqueMasterIds contains only valid master_products.id values
 *   orderDate is YYYY-MM-DD format (WIB calendar date)
 *
 * POSTCONDITION:
 *   If uniqueMasterIds is empty → packingCost=0, packingCostUnresolved=true
 *   Else → packingCost = MAX(c_i for i in uniqueMasterIds), packingCostUnresolved=false
 *   Return is order-invariant w.r.t. items input (set semantics)
 *   Idempotent under duplicates (set semantics)
 *   contributingMasterProductIds is ascending sorted unique
 *
 * Requirements: 4.1–4.7, 5.1–5.4
 */
export async function resolvePackingCostForOrder(
  uniqueMasterIds: Set<number>,
  orderDate: string,
  companyId: number,
): Promise<OrderPackingCostResult> {
  // Step 1: Empty case (semua item unmapped)
  if (uniqueMasterIds.size === 0) {
    return {
      packingCost: 0,
      packingCostUnresolved: true,
      contributingMasterProductIds: [],
    };
  }

  // Step 2: Resolve packing cost for each unique master product
  // LOOP INVARIANT: candidates contains valid (non-negative) packing costs
  //                 for masters processed so far
  const candidates: number[] = [];
  for (const masterProductId of uniqueMasterIds) {
    const result = await resolveMasterPackingCost(masterProductId, orderDate, companyId);
    if (result.success) {
      candidates.push(result.data.packingCost); // 0 jika no entry covers orderDate
    } else {
      // Service error (e.g., master not found) — treat as 0 candidate
      candidates.push(0);
    }
  }

  // Step 3: Pick MAX
  // INVARIANT: candidates.length === uniqueMasterIds.size (non-empty here)
  const packingCost = Math.max(...candidates);

  // contributingMasterProductIds: ascending sorted unique
  const contributingMasterProductIds = Array.from(uniqueMasterIds).sort((a, b) => a - b);

  return {
    packingCost,
    packingCostUnresolved: false,
    contributingMasterProductIds,
  };
}

// ─── Algorithm 4: resolveOrder ────────────────────────────────────────────────

/**
 * Single-order resolution (mapping + HPP per item + packing cost per order).
 *
 * PRECONDITION:
 *   input.items non-null array (boleh empty)
 *   input.orderDate is YYYY-MM-DD WIB
 *
 * POSTCONDITION:
 *   itemCosts.length === input.items.length (1:1 ordering preserved)
 *   hasUnresolvedHpp ⟺ ∃ i. !itemCosts[i].mapped
 *   packingCost.packingCostUnresolved ⟺ ∀ i. !itemCosts[i].mapped
 *   items kosong → hasUnresolvedHpp:false, packingCostUnresolved:true
 *
 * Requirements: 6.1–6.5, 7.1–7.5
 */
export async function resolveOrder(input: OrderForResolve, companyId: number): Promise<ResolvedOrder> {
  // Step 1: Resolve mapping for every item
  // LOOP INVARIANT: itemMappings[0..k] correspond to input.items[0..k]
  const itemMappings: ItemMapping[] = [];
  for (const item of input.items) {
    const mapping = await resolveItemVariant({
      companyId,
      shopId: input.shopId,
      itemId: item.itemId,
      modelId: item.modelId,
      modelSku: item.modelSku ?? null,
    });
    itemMappings.push(mapping);
  }

  // Step 2: Resolve HPP per mapped item
  const itemCosts: ItemResolvedCost[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const mapping = itemMappings[i]!;
    let hppPerUnit = 0;
    let hppFound = false;

    if (mapping.variantId !== null) {
      const hppResult = await resolveHpp(mapping.variantId, input.orderDate, companyId);
      if (hppResult.success) {
        hppPerUnit = hppResult.data.hppValue;
        hppFound = hppResult.data.source === "active"; // hanya active counts as 'found'
      }
    }

    itemCosts.push({
      variantId: mapping.variantId,
      masterProductId: mapping.masterProductId,
      hppPerUnit,
      hppFound,
      mapped: mapping.mapped,
    });
  }

  // Step 3: Collect unique masterProductIds dari Mapped_Item saja
  const uniqueMasterIds = new Set<number>();
  for (const cost of itemCosts) {
    if (cost.mapped && cost.masterProductId !== null) {
      uniqueMasterIds.add(cost.masterProductId);
    }
  }

  // Step 4: Resolve packing cost per order (MAX)
  const packingCost = await resolvePackingCostForOrder(uniqueMasterIds, input.orderDate, companyId);

  // Step 5: Compute hasUnresolvedHpp
  // items kosong → hasUnresolvedHpp:false (no items means no unresolved items)
  const hasUnresolvedHpp = itemCosts.length > 0 && itemCosts.some((c) => !c.mapped);

  return {
    orderSn: input.orderSn,
    itemCosts,
    packingCost,
    hasUnresolvedHpp,
  };
}

// ─── Algorithm 5: resolveOrders (batch) ───────────────────────────────────────

/**
 * Batch resolve — primary entry point untuk profit.service.
 *
 * Optimized: N+1 queries collapsed to O(distinct triplets) + O(distinct skus).
 * Output identik field-by-field dengan serial resolveOrder (Property 11).
 *
 * PRECONDITION: orders.length >= 0
 *
 * POSTCONDITION:
 *   result.size === unique orderSn count in orders
 *   Same per-item, per-order results as serial resolveOrder calls
 *   resolveOrders([]) → empty Map tanpa query
 *   Duplikat orderSn → 1 entry per orderSn unik (last one wins)
 *
 * Requirements: 8.1–8.5, 23.1–23.3, 24.1
 */
export async function resolveOrders(
  orders: OrderForResolve[],
  companyId: number,
): Promise<Map<string, ResolvedOrder>> {
  if (orders.length === 0) return new Map();

  // Step 1: Collect distinct (shopId, itemId, modelId) triplets for primary
  // identity-based lookup. Items missing itemId/modelId fall through to the
  // snapshot-SKU fallback (Step 3b).
  const tripletKey = (s: number, i: string, m: string) => `${s}\x00${i}\x00${m}`;
  const tripletSet = new Set<string>();
  const tripletList: Array<{ shopId: number; itemId: string; modelId: string }> = [];

  for (const order of orders) {
    for (const item of order.items) {
      if (item.itemId && item.modelId) {
        const key = tripletKey(order.shopId, item.itemId, item.modelId);
        if (!tripletSet.has(key)) {
          tripletSet.add(key);
          tripletList.push({
            shopId: order.shopId,
            itemId: item.itemId,
            modelId: item.modelId,
          });
        }
      }
    }
  }

  // Step 2: Batch lookup products → modelSku (primary path)
  const skuByTriplet = new Map<string, string>();
  if (tripletList.length > 0) {
    const conditions = tripletList.map((t) =>
      and(
        eq(products.shopId, t.shopId),
        eq(products.shopeeItemId, t.itemId),
        eq(products.shopeeModelId, t.modelId),
      ),
    );

    const productRows = await db
      .select({
        shopId: products.shopId,
        itemId: products.shopeeItemId,
        modelId: products.shopeeModelId,
        modelSku: products.modelSku,
      })
      .from(products)
      .where(
        and(
          eq(products.companyId, companyId),
          or(...conditions),
        ),
      );

    for (const row of productRows) {
      const sku = row.modelSku?.trim();
      if (sku) {
        skuByTriplet.set(tripletKey(row.shopId, row.itemId, row.modelId), sku);
      }
    }
  }

  // Step 3: Compute per-item lookup SKU (primary then fallback) and collect
  // distinct SKUs for batch master-variant lookup. We store the chosen sku per
  // item-position so Step 6 doesn't have to recompute.
  const itemSkuByOrder = new Map<string, Array<string | null>>();
  const distinctSkus = new Set<string>();

  for (const order of orders) {
    const skus: Array<string | null> = [];
    for (const item of order.items) {
      let lookupSku: string | null = null;

      // 3a. Primary: identity → products.model_sku (already trimmed and non-empty)
      if (item.itemId && item.modelId) {
        const fromTriplet = skuByTriplet.get(
          tripletKey(order.shopId, item.itemId, item.modelId),
        );
        if (fromTriplet) lookupSku = fromTriplet;
      }

      // 3b. Fallback: snapshot model_sku from shopee_order_items
      if (lookupSku === null) {
        const fallback = item.modelSku?.trim();
        if (fallback) lookupSku = fallback;
      }

      if (lookupSku !== null) distinctSkus.add(lookupSku);
      skus.push(lookupSku);
    }
    itemSkuByOrder.set(order.orderSn, skus);
  }

  // Step 4: Batch lookup master_product_variants by sku
  const variantBySku = new Map<string, { id: number; masterProductId: number }>();
  if (distinctSkus.size > 0) {
    const variantRows = await db
      .select({
        id: masterProductVariants.id,
        masterProductId: masterProductVariants.masterProductId,
        sku: masterProductVariants.sku,
      })
      .from(masterProductVariants)
      .where(
        and(
          eq(masterProductVariants.companyId, companyId),
          inArray(masterProductVariants.sku, Array.from(distinctSkus)),
        ),
      );

    for (const row of variantRows) {
      variantBySku.set(row.sku, { id: row.id, masterProductId: row.masterProductId });
    }
  }

  // Step 5: Cache HPP and packing-cost resolutions
  const hppCache = new Map<string, { hppValue: number; hppFound: boolean }>();
  const packingCache = new Map<string, number>();

  const resolvePackingCostCached = async (
    uniqueMasterIds: Set<number>,
    orderDate: string,
  ): Promise<OrderPackingCostResult> => {
    if (uniqueMasterIds.size === 0) {
      return {
        packingCost: 0,
        packingCostUnresolved: true,
        contributingMasterProductIds: [],
      };
    }

    const candidates: number[] = [];
    for (const masterProductId of uniqueMasterIds) {
      const cacheKey = `${masterProductId}\x00${orderDate}`;
      const cached = packingCache.get(cacheKey);
      if (cached !== undefined) {
        candidates.push(cached);
      } else {
        const result = await resolveMasterPackingCost(masterProductId, orderDate, companyId);
        const cost = result.success ? result.data.packingCost : 0;
        packingCache.set(cacheKey, cost);
        candidates.push(cost);
      }
    }

    const packingCost = Math.max(...candidates);
    const contributingMasterProductIds = Array.from(uniqueMasterIds).sort((a, b) => a - b);

    return {
      packingCost,
      packingCostUnresolved: false,
      contributingMasterProductIds,
    };
  };

  // Step 6: Compose ResolvedOrder per order using in-memory caches
  const result = new Map<string, ResolvedOrder>();

  for (const order of orders) {
    const itemCosts: ItemResolvedCost[] = [];
    const skus = itemSkuByOrder.get(order.orderSn)!;

    for (let i = 0; i < order.items.length; i++) {
      const lookupSku = skus[i] ?? null;

      let variantId: number | null = null;
      let masterProductId: number | null = null;
      let mapped = false;

      if (lookupSku !== null) {
        const variant = variantBySku.get(lookupSku);
        if (variant) {
          variantId = variant.id;
          masterProductId = variant.masterProductId;
          mapped = true;
        }
        // else: sku_not_in_master → mapped=false
      }
      // else: missing identity AND no snapshot fallback → mapped=false

      // Resolve HPP with cache
      let hppPerUnit = 0;
      let hppFound = false;

      if (variantId !== null) {
        const cacheKey = `${variantId}\x00${order.orderDate}`;
        const cached = hppCache.get(cacheKey);
        if (cached !== undefined) {
          hppPerUnit = cached.hppValue;
          hppFound = cached.hppFound;
        } else {
          const hppResult = await resolveHpp(variantId, order.orderDate, companyId);
          if (hppResult.success) {
            hppPerUnit = hppResult.data.hppValue;
            hppFound = hppResult.data.source === "active";
          }
          hppCache.set(cacheKey, { hppValue: hppPerUnit, hppFound });
        }
      }

      itemCosts.push({
        variantId,
        masterProductId,
        hppPerUnit,
        hppFound,
        mapped,
      });
    }

    const uniqueMasterIds = new Set<number>();
    for (const c of itemCosts) {
      if (c.mapped && c.masterProductId !== null) {
        uniqueMasterIds.add(c.masterProductId);
      }
    }

    const packingCost = await resolvePackingCostCached(uniqueMasterIds, order.orderDate);
    const hasUnresolvedHpp = itemCosts.length > 0 && itemCosts.some((c) => !c.mapped);

    result.set(order.orderSn, {
      orderSn: order.orderSn,
      itemCosts,
      packingCost,
      hasUnresolvedHpp,
    });
  }

  return result;
}
