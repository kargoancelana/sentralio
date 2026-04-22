import { eq, isNull, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { masterProducts, products, productGroups } from "../db/schema";
import { 
  updateStockOnShopee, 
  updateStockOnShopeeBatch, 
  updateShopeeVariantStock,
  toggleShopeeItemStatus 
} from "./shopee.service";
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

  // 3. Sync each model individually with retry
  let syncCount = 0;
  const failedProducts: { id: number; error: string }[] = [];

  for (const p of mappedProducts) {
    await db.update(products).set({ syncStatus: "pending" }).where(eq(products.id, p.id));

    let success = false;
    let lastError = "";

    // Attempt 1
    try {
      await updateShopeeVariantStock(p.shopeeItemId, p.shopeeModelId, newStock);
      success = true;
    } catch (err: any) {
      lastError = err.message;
      
      // Attempt 2 (Retry x1)
      if (isRetryableError(lastError)) {
        console.warn(`[MASTER SKU SYNC] sku=${master.sku} model_id=${p.shopeeModelId} failed, retrying... error=${lastError}`);
        try {
          await delay(env.syncDelayMs);
          await updateShopeeVariantStock(p.shopeeItemId, p.shopeeModelId, newStock);
          success = true;
        } catch (retryErr: any) {
          lastError = retryErr.message;
        }
      } else {
        console.error(`[MASTER SKU SYNC] sku=${master.sku} model_id=${p.shopeeModelId} non-retryable error: ${lastError}`);
      }
    }

    // Update per-product status
    if (success) {
      // shopeeStock is already updated by updateShopeeVariantStock! Just update syncStatus here.
      await db.update(products)
        .set({ syncStatus: "success", lastError: null })
        .where(eq(products.id, p.id));
      console.log(`[MASTER SKU SYNC] sku=${master.sku} model_id=${p.shopeeModelId} synced stock=${newStock}`);
      syncCount++;
    } else {
      await db.update(products)
        .set({ syncStatus: "failed", lastError })
        .where(eq(products.id, p.id));
      console.error(`[MASTER SKU SYNC] sku=${master.sku} model_id=${p.shopeeModelId} FAILED error=${lastError}`);
      failedProducts.push({ id: p.id, error: lastError });
    }

    await delay(env.syncDelayMs);
  }

  // 4. Reconciliation: Only update master stock if at least 1 sync succeeded
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
 * Import a Shopee listing (item_id) as 1 master product.
 * Creates 1 master per product group/listing, NOT per variant.
 * Auto-maps all unmapped variants under this listing to the new master.
 */
export async function importFromListing(shopeeItemId: string) {
  // 1. Find the product group (listing)
  const groupRows = await db.select().from(productGroups)
    .where(eq(productGroups.shopeeItemId, shopeeItemId)).limit(1);

  if (groupRows.length === 0) {
    throw new Error(`No product group found for shopee_item_id=${shopeeItemId}. Run /shopee/sync-products first.`);
  }

  const group = groupRows[0];

  // 2. Determine Master SKU and ensure uniqueness
  let masterSku = group.itemSku || shopeeItemId;
  const existingMaster = await db.select().from(masterProducts)
    .where(eq(masterProducts.sku, masterSku)).limit(1);

  if (existingMaster.length > 0) {
    masterSku = `${masterSku}-${Date.now().toString().slice(-6)}`;
  }

  // 3. Create 1 master product for the entire listing
  const masterName = group.name || `Shopee Item ${shopeeItemId}`;

  const [result] = await db.insert(masterProducts).values({
    sku: masterSku,
    name: masterName,
    stock: 0,
  });
  const masterId = (result as any).insertId as number;
  console.log(`[MASTER IMPORT] Created master id=${masterId} sku=${masterSku} name="${masterName}"`);

  return {
    status: "success",
    item_id: shopeeItemId,
    master_id: masterId,
    master_sku: masterSku,
    message: "Master Product berhasil dibuat. Silakan mapping listing dari menu manual link."
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
      id: products.id,
      shopeeModelId: products.shopeeModelId,
      shopeeItemId: products.shopeeItemId,
      groupId: products.groupId,
      modelName: products.modelName,
      modelSku: products.modelSku,
      price: products.price,
      shopeeStock: products.shopeeStock,
      syncStatus: products.syncStatus,
    }).from(products).where(eq(products.masterProductId, m.id));

    // Get unique product groups for image + group info
    const groupIds = [...new Set(linked.map(l => l.groupId))];
    const groups = [];
    for (const gid of groupIds) {
      const gRows = await db.select().from(productGroups).where(eq(productGroups.id, gid)).limit(1);
      if (gRows.length > 0) groups.push(gRows[0]);
    }

    result.push({
      id: m.id,
      sku: m.sku,
      name: m.name,
      stock: m.stock,
      imageUrl: groups[0]?.imageUrl || null,
      linked_models: linked,
      linked_groups: groups.map(g => ({
        id: g.id,
        shopeeItemId: g.shopeeItemId,
        name: g.name,
        imageUrl: g.imageUrl,
      })),
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

/**
 * Delete a master product and unlink all mapped models.
 */
export async function deleteMasterProduct(masterProductId: number) {
  const masterRows = await db.select().from(masterProducts)
    .where(eq(masterProducts.id, masterProductId)).limit(1);

  if (masterRows.length === 0) {
    throw new Error(`Master product with id=${masterProductId} not found`);
  }

  const master = masterRows[0];

  // 1. Unlink all mapped products
  await db.update(products)
    .set({ masterProductId: null })
    .where(eq(products.masterProductId, masterProductId));

  // 2. Delete master product
  await db.delete(masterProducts).where(eq(masterProducts.id, masterProductId));

  console.log(`[MASTER DELETE] id=${masterProductId} sku=${master.sku} deleted`);

  return { status: "success", id: masterProductId, sku: master.sku };
}

/**
 * Unlink all variants of a product group (listing) from their master product.
 */
export async function unlinkProductGroup(shopeeItemId: string) {
  const groupProducts = await db.select().from(products)
    .where(eq(products.shopeeItemId, shopeeItemId));

  if (groupProducts.length === 0) {
    throw new Error(`No variants found for item_id=${shopeeItemId}`);
  }

  const linked = groupProducts.filter(p => p.masterProductId !== null);
  if (linked.length === 0) {
    throw new Error(`No linked variants found for item_id=${shopeeItemId}`);
  }

  await db.update(products)
    .set({ masterProductId: null })
    .where(eq(products.shopeeItemId, shopeeItemId));

  console.log(`[MASTER UNLINK] item_id=${shopeeItemId} unlinked ${linked.length} variants`);

  return { status: "success", item_id: shopeeItemId, unlinked_count: linked.length };
}

/**
 * Link all variants of a product group (listing) to a master product.
 */
export async function mapProductGroupToMaster(masterProductId: number, shopeeItemId: string) {
  const masterRows = await db.select().from(masterProducts)
    .where(eq(masterProducts.id, masterProductId)).limit(1);
  if (masterRows.length === 0) throw new Error(`Master product id=${masterProductId} not found`);

  const groupProducts = await db.select().from(products)
    .where(eq(products.shopeeItemId, shopeeItemId));
  if (groupProducts.length === 0) throw new Error(`No variants found for item_id=${shopeeItemId}`);

  // Check for conflicts (already mapped to a DIFFERENT master)
  const conflicts = groupProducts.filter(p => p.masterProductId !== null && p.masterProductId !== masterProductId);
  if (conflicts.length > 0) {
    throw new Error(`${conflicts.length} variants already linked to another master. Unlink them first.`);
  }

  const unmapped = groupProducts.filter(p => p.masterProductId === null);
  if (unmapped.length === 0) {
    return { status: "skipped", message: "All variants already linked to this master", mapped: 0 };
  }

  await db.transaction(async (tx) => {
    for (const p of unmapped) {
      await tx.update(products)
        .set({ masterProductId: masterProductId })
        .where(eq(products.id, p.id));
    }
  });

  console.log(`[MASTER MAP] item_id=${shopeeItemId} mapped ${unmapped.length} variants to master_id=${masterProductId}`);
  return { status: "success", item_id: shopeeItemId, mapped: unmapped.length };
}
