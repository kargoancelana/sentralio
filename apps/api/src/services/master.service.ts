import { eq, isNull, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { masterProducts, products, productGroups, masterProductVariants } from "../db/schema";
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
  // 1. Validate master product exists & fetch SKU for matching
  const masterRows = await db.select().from(masterProducts)
    .where(eq(masterProducts.id, masterProductId)).limit(1);

  if (masterRows.length === 0) {
    throw new Error(`Master product with id=${masterProductId} not found`);
  }

  const master = masterRows[0];

  // 2. Fetch all products linked to this master
  const allMapped = await db.select().from(products)
    .where(eq(products.masterProductId, masterProductId));

  if (allMapped.length === 0) {
    console.log(`[MASTER SKU SYNC] sku=${master.sku} — no listings mapped`);
    return { status: "success", sku: master.sku, synced_listings: 0, skipped_listings: 0, message: "No mapped listings found" };
  }

  // 3. SKU-based filter: only push stock to variants where modelSku matches master SKU
  const eligibleProducts = allMapped.filter(p => p.modelSku === master.sku);
  const skippedProducts  = allMapped.filter(p => p.modelSku !== master.sku);

  // Mark skipped (linked but MSKU not matched) as sku_mismatch
  for (const p of skippedProducts) {
    await db.update(products)
      .set({ syncStatus: "sku_mismatch", lastError: `Model SKU "${p.modelSku || '(kosong)'}" tidak cocok dengan Master SKU "${master.sku}"` })
      .where(eq(products.id, p.id));
    console.log(`[MASTER SKU SYNC] SKIP model_id=${p.shopeeModelId} model_sku="${p.modelSku}" != master_sku="${master.sku}"`);
  }

  if (eligibleProducts.length === 0) {
    console.log(`[MASTER SKU SYNC] sku=${master.sku} — 0 eligible (all ${skippedProducts.length} have mismatched SKU)`);
    return {
      status: "sku_mismatch",
      sku: master.sku,
      synced_listings: 0,
      skipped_listings: skippedProducts.length,
      message: `Tidak ada variasi yang MSKU-nya cocok dengan Master SKU "${master.sku}". Samakan MSKU di Produk Channel terlebih dahulu.`,
    };
  }

  // 4. Sync eligible variants to Shopee with retry (Grouped by shopeeItemId)
  let syncCount = 0;
  const failedProducts: { id: number; error: string }[] = [];

  const groupedByItem = eligibleProducts.reduce((acc, p) => {
    if (!acc[p.shopeeItemId]) acc[p.shopeeItemId] = [];
    acc[p.shopeeItemId].push(p);
    return acc;
  }, {} as Record<string, typeof eligibleProducts>);

  for (const itemId of Object.keys(groupedByItem)) {
    const modelsToUpdate = groupedByItem[itemId];

    // Tandai status pending
    for (const p of modelsToUpdate) {
      await db.update(products).set({ syncStatus: "pending" }).where(eq(products.id, p.id));
    }

    let success = false;
    let lastError = "";

    const payload = modelsToUpdate.map(p => ({
      shopeeModelId: p.shopeeModelId,
      stock: newStock
    }));

    // Attempt 1
    try {
      await updateStockOnShopeeBatch(itemId, payload);
      success = true;
    } catch (err: any) {
      lastError = err.message;

      // Attempt 2 (Retry x1 on transient errors)
      if (isRetryableError(lastError)) {
        console.warn(`[MASTER SKU SYNC] sku=${master.sku} item_id=${itemId} failed, retrying... error=${lastError}`);
        try {
          await delay(env.syncDelayMs);
          await updateStockOnShopeeBatch(itemId, payload);
          success = true;
        } catch (retryErr: any) {
          lastError = retryErr.message;
        }
      } else {
        console.error(`[MASTER SKU SYNC] sku=${master.sku} item_id=${itemId} non-retryable error: ${lastError}`);
      }
    }

    if (success) {
      for (const p of modelsToUpdate) {
        await db.update(products)
          .set({ syncStatus: "success", lastError: null, shopeeStock: newStock })
          .where(eq(products.id, p.id));
        syncCount++;
      }
      console.log(`[MASTER SKU SYNC] sku=${master.sku} item_id=${itemId} synced stock=${newStock} for ${modelsToUpdate.length} models`);
    } else {
      for (const p of modelsToUpdate) {
        await db.update(products)
          .set({ syncStatus: "failed", lastError })
          .where(eq(products.id, p.id));
        failedProducts.push({ id: p.id, error: lastError });
      }
      console.error(`[MASTER SKU SYNC] sku=${master.sku} item_id=${itemId} FAILED error=${lastError}`);
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

  const status = syncCount === eligibleProducts.length ? "success"
    : syncCount > 0 ? "partial"
    : "failed";

  console.log(`[SYNC RESULT] master=${master.sku} status=${status} synced=${syncCount} skipped=${skippedProducts.length} failed=${failedProducts.length}`);

  return {
    status,
    sku: master.sku,
    synced_listings: syncCount,
    skipped_listings: skippedProducts.length,
    total_linked: allMapped.length,
    failed_models: failedProducts.length > 0 ? failedProducts.map(f => f.id) : undefined,
    failed: failedProducts.length > 0 ? failedProducts : undefined,
  };
}

export async function updateMasterVariants(masterProductId: number, variants: any[]) {
  const masterRows = await db.select().from(masterProducts).where(eq(masterProducts.id, masterProductId)).limit(1);
  if (masterRows.length === 0) throw new Error("Master product not found");

  // Upsert variants
  for (const v of variants) {
    if (v.id) {
      await db.update(masterProductVariants)
        .set({ sku: v.sku, name: v.name, stock: v.stock })
        .where(eq(masterProductVariants.id, v.id));
    } else {
      await db.insert(masterProductVariants)
        .values({ masterProductId, sku: v.sku, name: v.name, stock: v.stock });
    }
  }

  // Find products matching these variant SKUs
  const allMapped = await db.select().from(products)
    .where(eq(products.masterProductId, masterProductId));

  const groupedByItem: Record<string, { shopeeModelId: string; stock: number, dbId: number }[]> = {};

  for (const v of variants) {
    const eligibleProducts = allMapped.filter(p => p.modelSku === v.sku);
    for (const p of eligibleProducts) {
      if (!groupedByItem[p.shopeeItemId]) groupedByItem[p.shopeeItemId] = [];
      groupedByItem[p.shopeeItemId].push({ shopeeModelId: p.shopeeModelId, stock: v.stock, dbId: p.id });
    }
  }

  let syncCount = 0;
  const failedProducts: { id: number; error: string }[] = [];

  for (const itemId of Object.keys(groupedByItem)) {
    const modelsToUpdate = groupedByItem[itemId];

    for (const m of modelsToUpdate) {
      await db.update(products).set({ syncStatus: "pending" }).where(eq(products.id, m.dbId));
    }

    const payload = modelsToUpdate.map(m => ({ shopeeModelId: m.shopeeModelId, stock: m.stock }));
    let success = false;
    let lastError = "";

    try {
      await updateStockOnShopeeBatch(itemId, payload);
      success = true;
    } catch (err: any) {
      lastError = err.message;
      if (isRetryableError(lastError)) {
        console.warn(`[VARIANTS SYNC] item_id=${itemId} failed, retrying... error=${lastError}`);
        try {
          await delay(env.syncDelayMs);
          await updateStockOnShopeeBatch(itemId, payload);
          success = true;
        } catch (retryErr: any) {
          lastError = retryErr.message;
        }
      }
    }

    if (success) {
      for (const m of modelsToUpdate) {
        await db.update(products).set({ syncStatus: "success", lastError: null, shopeeStock: m.stock }).where(eq(products.id, m.dbId));
        syncCount++;
      }
    } else {
      for (const m of modelsToUpdate) {
        await db.update(products).set({ syncStatus: "failed", lastError }).where(eq(products.id, m.dbId));
        failedProducts.push({ id: m.dbId, error: lastError });
      }
    }
    
    if (Object.keys(groupedByItem).length > 1) await delay(env.syncDelayMs);
  }

  // Re-run auto mapping in case variant SKUs changed
  await autoMapProducts();

  return {
    status: failedProducts.length === 0 ? "success" : "partial_success",
    synced_listings: syncCount,
    failed_listings: failedProducts.length,
    failed_details: failedProducts,
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

/**
 * Auto-maps all unmapped products based on SKU matching masterProductVariants.
 * Call this after Shopee catalog sync or after updating variant SKUs.
 */
export async function autoMapProducts() {
  const allVariants = await db.select().from(masterProductVariants);
  const variantMap = new Map<string, number>(); // sku -> masterProductId
  for (const v of allVariants) {
    if (v.sku) variantMap.set(v.sku.trim().toUpperCase(), v.masterProductId);
  }

  const allProducts = await db.select().from(products);
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const p of allProducts) {
    if (!p.modelSku) {
      // If SKU is empty, it cannot be mapped. Clear it if previously mapped.
      if (p.masterProductId !== null) {
        await db.update(products).set({ masterProductId: null }).where(eq(products.id, p.id));
        unmappedCount++;
      }
      continue;
    }
    
    const cleanSku = p.modelSku.trim().toUpperCase();
    const matchedMasterId = variantMap.get(cleanSku);
    if (matchedMasterId) {
      if (p.masterProductId !== matchedMasterId) {
        await db.update(products).set({ masterProductId: matchedMasterId }).where(eq(products.id, p.id));
        mappedCount++;
      }
    } else {
      if (p.masterProductId !== null) {
        await db.update(products).set({ masterProductId: null }).where(eq(products.id, p.id));
        unmappedCount++;
      }
    }
  }

  console.log(`[AUTO MAP] Mapped ${mappedCount} products, unmapped ${unmappedCount} products`);
  return { mapped: mappedCount, unmapped: unmappedCount };
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

  // 4. Import all variations under this listing as master product variants
  const unmappedVariants = await db.select().from(products)
    .where(eq(products.shopeeItemId, shopeeItemId));

  let variantCount = 0;
  for (const v of unmappedVariants) {
    if (!v.modelSku) continue; // Skip variations without SKU
    
    // Check if variant already exists
    const existingVar = await db.select().from(masterProductVariants)
      .where(eq(masterProductVariants.sku, v.modelSku)).limit(1);
      
    if (existingVar.length === 0) {
      await db.insert(masterProductVariants).values({
        masterProductId: masterId,
        sku: v.modelSku,
        name: v.modelName || "Default",
        stock: v.shopeeStock || 0,
      });
      variantCount++;
    }
  }

  // Auto-map variations if they match
  await autoMapProducts();

  return {
    status: "success",
    item_id: shopeeItemId,
    master_id: masterId,
    master_sku: masterSku,
    variants_imported: variantCount,
    message: `Master Product berhasil dibuat dengan ${variantCount} variasi.`
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

    const variants = await db.select().from(masterProductVariants)
      .where(eq(masterProductVariants.masterProductId, m.id));

    result.push({
      id: m.id,
      sku: m.sku,
      name: m.name,
      stock: m.stock,
      imageUrl: groups[0]?.imageUrl || null,
      variants: variants, // Return true master variants
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
