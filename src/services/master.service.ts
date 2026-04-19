import { eq, isNull, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { masterProducts, products } from "../db/schema";
import { updateStockOnShopeeBatch } from "./shopee.service";
import { delay } from "../utils/delay";
import { env } from "../config/env";

/**
 * Only retry on transient errors (network, timeout, server errors).
 * Auth errors and validation errors will always fail on retry.
 */
function isRetryableError(errorMsg: string): boolean {
  const msg = errorMsg.toLowerCase();
  return msg.includes("timeout") || msg.includes("network") || msg.includes("server error")
    || msg.includes("aborted") || msg.includes("fetch") || msg.includes("econnrefused")
    || msg.includes("5");
}

// ─── UPDATE STOCK (Reconciliation + Retry + Batch) ──────────────────

/**
 * Updates stock on the master product and syncs to all mapped Shopee listings.
 * 
 * Reconciliation: DB is only updated AFTER Shopee sync succeeds.
 * Retry: Each batch gets 1 retry on failure.
 * Batch: Groups model_ids by item_id to reduce API calls.
 */
export async function updateStockByMasterSku(masterProductId: number, newStock: number) {
  // 1. Validate master product exists & fetch SKU for logging
  const masterRows = await db.select().from(masterProducts)
    .where(eq(masterProducts.id, masterProductId)).limit(1);

  if (masterRows.length === 0) {
    throw new Error(`Master product with id=${masterProductId} not found`);
  }

  const master = masterRows[0];

  // 2. Fetch all mapped products (DO NOT update DB yet — reconciliation)
  const mappedProducts = await db.select().from(products)
    .where(eq(products.masterProductId, masterProductId));

  if (mappedProducts.length === 0) {
    console.log(`[MASTER SKU SYNC] sku=${master.sku} — no listings mapped`);
    return { status: "success", sku: master.sku, synced_listings: 0, message: "No mapped listings found" };
  }

  // 3. Group by item_id for batch update (reduces API calls)
  const groupedByItem = new Map<string, typeof mappedProducts>();
  for (const p of mappedProducts) {
    const list = groupedByItem.get(p.shopeeItemId) ?? [];
    list.push(p);
    groupedByItem.set(p.shopeeItemId, list);
  }

  console.log(`[MASTER SKU SYNC] sku=${master.sku} — ${mappedProducts.length} models across ${groupedByItem.size} items`);

  // 4. Sync per item_id batch with retry
  let syncCount = 0;
  const failedProducts: { id: number; error: string }[] = [];

  for (const [itemId, itemProducts] of groupedByItem) {
    const models = itemProducts.map(p => ({ shopeeModelId: p.shopeeModelId, stock: newStock }));

    // Mark all as pending
    for (const p of itemProducts) {
      await db.update(products).set({ syncStatus: "pending" }).where(eq(products.id, p.id));
    }

    let success = false;
    let lastError = "";

    // Attempt 1
    try {
      await updateStockOnShopeeBatch(itemId, models);
      success = true;
    } catch (err: any) {
      lastError = err.message;

      // Attempt 2 (Retry x1) — only for retryable errors
      if (isRetryableError(lastError)) {
        console.warn(`[MASTER SKU SYNC] sku=${master.sku} item_id=${itemId} failed, retrying... error=${lastError}`);
        try {
          await delay(env.syncDelayMs);
          await updateStockOnShopeeBatch(itemId, models);
          success = true;
        } catch (retryErr: any) {
          lastError = retryErr.message;
        }
      } else {
        console.error(`[MASTER SKU SYNC] sku=${master.sku} item_id=${itemId} non-retryable error: ${lastError}`);
      }
    }

    // Update per-product status
    for (const p of itemProducts) {
      if (success) {
        await db.update(products)
          .set({ syncStatus: "success", lastError: null, updatedAt: new Date() })
          .where(eq(products.id, p.id));
        console.log(`[MASTER SKU SYNC] sku=${master.sku} model_id=${p.shopeeModelId} synced stock=${newStock}`);
        syncCount++;
      } else {
        await db.update(products)
          .set({ syncStatus: "failed", lastError, updatedAt: new Date() })
          .where(eq(products.id, p.id));
        console.error(`[MASTER SKU SYNC] sku=${master.sku} model_id=${p.shopeeModelId} FAILED error=${lastError}`);
        failedProducts.push({ id: p.id, error: lastError });
      }
    }

    await delay(env.syncDelayMs);
  }

  // 5. Reconciliation: Only update master stock if at least 1 sync succeeded
  if (syncCount > 0) {
    await db.update(masterProducts)
      .set({ stock: newStock })
      .where(eq(masterProducts.id, masterProductId));
    console.log(`[MASTER SKU SYNC] sku=${master.sku} master stock updated to ${newStock}`);
  } else {
    console.error(`[MASTER SKU SYNC] sku=${master.sku} ALL syncs failed — master stock NOT updated (reconciliation)`);
  }

  // Determine status: success / partial / failed
  const status = syncCount === mappedProducts.length ? "success"
    : syncCount > 0 ? "partial"
    : "failed";

  console.log(`[SYNC RESULT] master=${master.sku} status=${status} success=${syncCount} failed=${failedProducts.length}`);

  return {
    status,
    sku: master.sku,
    synced_listings: syncCount,
    total_listings: mappedProducts.length,
    failed_models: failedProducts.length > 0 ? failedProducts.map(f => f.id) : undefined,
    failed: failedProducts.length > 0 ? failedProducts : undefined,
  };
}

// ─── MAPPING (from issue #48 + #49) ────────────────────────────────

/**
 * Maps Shopee model_ids to a master product (atomic transaction).
 */
export async function mapModelsToMaster(masterProductId: number, shopeeModelIds: string[]) {
  const masterRows = await db.select().from(masterProducts)
    .where(eq(masterProducts.id, masterProductId)).limit(1);

  if (masterRows.length === 0) {
    throw new Error(`Master product with id=${masterProductId} not found`);
  }

  const master = masterRows[0];

  const productRows = await db.select().from(products)
    .where(inArray(products.shopeeModelId, shopeeModelIds));

  const foundModelIds = productRows.map(p => p.shopeeModelId);
  const missingModelIds = shopeeModelIds.filter(id => !foundModelIds.includes(id));

  if (missingModelIds.length > 0) {
    throw new Error(`model_id not found in products table: ${missingModelIds.join(", ")}`);
  }

  const conflicts = productRows.filter(
    p => p.masterProductId !== null && p.masterProductId !== masterProductId
  );

  if (conflicts.length > 0) {
    const conflictDetails = conflicts.map(
      c => `model_id=${c.shopeeModelId} already mapped to master_product_id=${c.masterProductId}`
    );
    throw new Error(`Mapping conflict: ${conflictDetails.join("; ")}`);
  }

  let mappedCount = 0;
  await db.transaction(async (tx) => {
    for (const modelId of shopeeModelIds) {
      await tx.update(products)
        .set({ masterProductId })
        .where(eq(products.shopeeModelId, modelId));
      mappedCount++;
    }
  });

  console.log(`[MASTER SKU MAP] sku=${master.sku} mapped ${mappedCount} model_ids`);

  return {
    status: "success",
    sku: master.sku,
    mapped_count: mappedCount,
    model_ids: shopeeModelIds,
  };
}

// ─── IMPORT FROM LISTING ───────────────────────────────────────────

/**
 * Import all model_ids from a Shopee listing (item_id) as master products.
 * Creates 1 master per model_id and auto-maps them.
 */
export async function importFromListing(shopeeItemId: string) {
  // 1. Find all products under this item_id
  const itemProducts = await db.select().from(products)
    .where(eq(products.shopeeItemId, shopeeItemId));

  if (itemProducts.length === 0) {
    throw new Error(`No products found for shopee_item_id=${shopeeItemId}. Run /shopee/sync-products first.`);
  }

  // 2. Filter out already-mapped ones
  const unmapped = itemProducts.filter(p => p.masterProductId === null);

  if (unmapped.length === 0) {
    return {
      status: "skipped",
      message: "All model_ids under this item_id are already mapped to a master",
      item_id: shopeeItemId,
      total_models: itemProducts.length,
      created: 0,
    };
  }

  // 3. Create master products + auto-map in transaction
  const created: { masterId: number; sku: string; modelId: string }[] = [];

  await db.transaction(async (tx) => {
    for (const p of unmapped) {
      const sku = `${shopeeItemId}-${p.shopeeModelId}`;
      const name = `Variant ${p.shopeeModelId}`;

      // Insert master product
      const [result] = await tx.insert(masterProducts).values({ sku, name, stock: 0 });
      const masterId = (result as any).insertId as number;

      // Auto-map
      await tx.update(products)
        .set({ masterProductId: masterId })
        .where(eq(products.id, p.id));

      created.push({ masterId, sku, modelId: p.shopeeModelId });
    }
  });

  console.log(`[MASTER IMPORT] item_id=${shopeeItemId} created ${created.length} master products`);

  return {
    status: "success",
    item_id: shopeeItemId,
    total_models: itemProducts.length,
    created: created.length,
    masters: created,
  };
}

// ─── LIST / READ ───────────────────────────────────────────────────

/**
 * List all master products with their linked model_ids.
 */
export async function listMasterProducts() {
  const masters = await db.select().from(masterProducts);

  const result = [];
  for (const m of masters) {
    const linked = await db.select({
      shopeeModelId: products.shopeeModelId,
      shopeeItemId: products.shopeeItemId,
      syncStatus: products.syncStatus,
    }).from(products).where(eq(products.masterProductId, m.id));

    result.push({
      id: m.id,
      sku: m.sku,
      name: m.name,
      stock: m.stock,
      linked_models: linked,
    });
  }

  return result;
}

/**
 * List all model_ids that are NOT mapped to any master product.
 */
export async function getUnlinkedModels() {
  const unlinked = await db.select({
    id: products.id,
    shopeeModelId: products.shopeeModelId,
    shopeeItemId: products.shopeeItemId,
  }).from(products).where(isNull(products.masterProductId));

  return unlinked;
}

/**
 * Update master product SKU/name.
 */
export async function updateMasterProduct(masterProductId: number, data: { sku?: string; name?: string }) {
  const masterRows = await db.select().from(masterProducts)
    .where(eq(masterProducts.id, masterProductId)).limit(1);

  if (masterRows.length === 0) {
    throw new Error(`Master product with id=${masterProductId} not found`);
  }

  const updatePayload: Record<string, any> = {};
  if (data.sku) updatePayload.sku = data.sku;
  if (data.name) updatePayload.name = data.name;

  if (Object.keys(updatePayload).length === 0) {
    throw new Error("Nothing to update. Provide sku or name.");
  }

  await db.update(masterProducts).set(updatePayload).where(eq(masterProducts.id, masterProductId));

  console.log(`[MASTER UPDATE] id=${masterProductId} updated: ${JSON.stringify(updatePayload)}`);

  return { status: "success", id: masterProductId, ...updatePayload };
}
