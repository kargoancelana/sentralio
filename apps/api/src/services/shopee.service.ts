import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { productGroups, products, masterProducts } from "../db/schema";
import { shopeeRequest } from "./shopee-raw";

/**
 * Update stock on Shopee for a single item_id with multiple model_ids (batch per item).
 * Shopee API supports updating multiple models under the same item_id in 1 request.
 */
export async function updateStockOnShopeeBatch(
  shopeeItemId: string,
  models: { shopeeModelId: string; stock: number }[],
) {
  try {
    const stockList = models.map(m => ({
      model_id: parseInt(m.shopeeModelId),
      seller_stock: [{ stock: m.stock }],
    }));

    const result = await shopeeRequest({
      method: "POST",
      path: "/api/v2/product/update_stock",
      body: {
        item_id: parseInt(shopeeItemId),
        stock_list: stockList,
      },
    });

    if (result.error) {
      throw new Error(`Shopee update_stock error: ${result.message || result.error}`);
    }

    return { ok: true, item_id: shopeeItemId, models_updated: models.length };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw err;
  }
}

/**
 * Backward-compatible single model update (calls batch internally).
 */
export async function updateStockOnShopee(
  shopeeItemId: string,
  shopeeModelId: string,
  stock: number,
  signal?: AbortSignal,
) {
  return updateStockOnShopeeBatch(shopeeItemId, [{ shopeeModelId, stock }]);
}

/**
 * Fetch shop info using the shopeeRequest wrapper.
 */
export async function getShopInfo() {
  return shopeeRequest({ method: "GET", path: "/api/v2/shop/get_shop_info" });
}


export async function getItemListRaw(offset = 0, pageSize = 10) {
  console.log("[REAL API] Fetch item list");
  return shopeeRequest({
    method: "GET",
    path: "/api/v2/product/get_item_list",
    query: { offset, page_size: pageSize, item_status: "NORMAL" }
  });
}

export async function getItemListAll(): Promise<string[]> {
  let offset = 0;
  const pageSize = 50;
  const itemIds: string[] = [];
  let hasNextPage = true;

  while (hasNextPage) {
    console.log(`[REAL API] Fetch item list batch offset=${offset}`);
    const res = await shopeeRequest({
      method: "GET",
      path: "/api/v2/product/get_item_list",
      query: { offset, page_size: pageSize, item_status: "NORMAL" }
    });

    if (res.error) throw new Error("API Error: " + res.message);

    const items = res.response.item || [];
    for (const it of items) {
      itemIds.push(it.item_id.toString());
    }

    hasNextPage = res.response.has_next_page;
    offset += pageSize;
  }
  return itemIds;
}

/**
 * Fetch full model data for an item (model_name, model_sku, price, stock).
 */
export async function getModelListByItemId(itemId: string): Promise<any[]> {
  console.log(`[REAL API] Fetch models for item_id=${itemId}`);
  const res = await shopeeRequest({
    method: "GET",
    path: "/api/v2/product/get_model_list",
    query: { item_id: parseInt(itemId) }
  });

  if (res.error) throw new Error("API Error: " + res.message);

  const models = res.response?.model || [];
  
  // Debug: Log first model's full structure to see available price fields
  if (models.length > 0) {
    console.log(`[PRICE DEBUG] item_id=${itemId} first model keys:`, Object.keys(models[0]));
    console.log(`[PRICE DEBUG] item_id=${itemId} first model price_info:`, JSON.stringify(models[0].price_info, null, 2));
  }
  
  return models;
}

/**
 * Fetch item base info for up to 50 item_ids per call.
 * Returns enriched product data: name, description, sku, category, status, images.
 */
export async function getItemBaseInfo(itemIds: string[]): Promise<any[]> {
  console.log(`[REAL API] Fetch item base info for ${itemIds.length} items`);
  const res = await shopeeRequest({
    method: "GET",
    path: "/api/v2/product/get_item_base_info",
    query: { item_id_list: itemIds.join(",") }
  });

  if (res.error) throw new Error("API Error: " + res.message);

  return res.response?.item_list || [];
}

/**
 * Full enriched sync: pulls item info + model details and stores everything in DB.
 */
export async function syncShopeeProducts() {
  // 1. Fetch all item IDs (paginated)
  const itemIds = await getItemListAll();
  let totalModels = 0;

  // 2. Batch fetch item base info (max 50 per call)
  const itemInfoMap = new Map<string, any>();
  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    try {
      const items = await getItemBaseInfo(batch);
      for (const item of items) {
        itemInfoMap.set(item.item_id.toString(), item);
      }
    } catch (err: any) {
      console.warn(`[SYNC] Failed to fetch item base info batch: ${err.message}`);
      // Continue without enriched data for this batch
    }
  }

  // 3. Process each item
  for (const itemId of itemIds) {
    const itemInfo = itemInfoMap.get(itemId);
    const itemName = itemInfo?.item_name || `Shopee Item ${itemId}`;
    const itemSku = itemInfo?.item_sku || null;
    const description = itemInfo?.description || null;
    const categoryId = itemInfo?.category_id || null;
    const itemStatus = itemInfo?.item_status || "NORMAL";
    const imageUrl = itemInfo?.image?.image_url_list?.[0] || null;

    // 3a. UPSERT product group with enriched data
    await db.insert(productGroups)
      .values({
        shopeeItemId: itemId,
        name: itemName,
        description,
        itemSku,
        categoryId,
        itemStatus,
        imageUrl,
        stock: 0,
        lastSync: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          name: itemName,
          description,
          itemSku,
          categoryId,
          itemStatus,
          imageUrl,
          lastSync: new Date(),
        }
      });

    // 3b. Get group ID
    const groupRows = await db.select({ id: productGroups.id }).from(productGroups)
      .where(eq(productGroups.shopeeItemId, itemId)).limit(1);

    if (groupRows.length === 0) continue;
    const groupId = groupRows[0].id;

    // 4. Fetch enriched model data
    let models: any[];
    try {
      models = await getModelListByItemId(itemId);
    } catch (err: any) {
      console.warn(`[SYNC] Failed to fetch models for item_id=${itemId}: ${err.message}`);
      continue;
    }

    // 5. UPSERT each model with enriched data
    for (const model of models) {
      const modelId = model.model_id.toString();
      const modelName = model.model_name || null;
      const modelSku = model.model_sku || null;

      // Shopee price_info is an array. We pick the first one.
      let priceInfoList = Array.isArray(model.price_info) ? model.price_info : (model.price_info ? [model.price_info] : []);
      if (priceInfoList.length === 0 && Array.isArray(itemInfo?.price_info)) {
        priceInfoList = itemInfo.price_info;
      }
      const pInfo = priceInfoList[0] || {};
      
      let rawCurrent = pInfo.current_price ?? 0;
      let rawOriginal = pInfo.original_price ?? 0;
      // Prefer promo price (current_price) if > 0
      let rawPrice = rawCurrent > 0 ? rawCurrent : rawOriginal;
      
      // Perbaikan Ambang Batas Multiplier Shopee
      // Shopee mengembalikan harga kadang dengan multiplier 100000 (contoh: 5800000000 => 58.000)
      // Harga terkecil di Shopee biasanya Rp 99. Jika sebuah nilai lebih besar dari 1.000.000 (Satu Juta),
      // baru kita asumsikan ia terkena multiplier, sehingga aman untuk harga baju asli misal 58000.
      let price = rawPrice > 1000000 ? rawPrice / 100000 : rawPrice;

      const shopeeStock = model.stock_info_v2?.seller_stock?.[0]?.stock
        ?? model.stock_info?.normal_stock
        ?? 0;

      console.log(`[PRICE DEBUG] item_id=${itemId} model_id=${modelId} raw_price=${rawPrice} price=${price} stock=${shopeeStock}`);

      await db.insert(products)
        .values({
          groupId,
          shopeeItemId: itemId,
          shopeeModelId: modelId,
          modelName,
          modelSku,
          price: Math.round(price),
          shopeeStock,
          stock: 0,
          syncStatus: "success",
        })
        .onDuplicateKeyUpdate({
          set: {
            groupId,
            modelName,
            modelSku,
            price: Math.round(price),
            shopeeStock,
            updatedAt: new Date(),
          }
        });
      totalModels++;
    }
  }

  console.log(`[SYNC] Complete: ${itemIds.length} items, ${totalModels} models`);
  return { total_items: itemIds.length, total_models: totalModels, status: "success" };
}

/**
 * Fetch the full Shopee catalog: items + variants + mapping status.
 * Returns a structured array of items, each with their variants and master linkage.
 */
export async function getShopeeCatalog() {
  // 1. Fetch all product groups (items)
  const groups = await db.select().from(productGroups);

  // 2. Build catalog
  const catalog = [];
  for (const group of groups) {
    // 3. Fetch all variants for this item
    const variants = await db.select().from(products)
      .where(eq(products.groupId, group.id));

    // 4. Enrich variants with master product info
    const enrichedVariants = [];
    for (const v of variants) {
      let master = null;
      if (v.masterProductId) {
        const masterRows = await db.select().from(masterProducts)
          .where(eq(masterProducts.id, v.masterProductId)).limit(1);
        if (masterRows.length > 0) {
          master = {
            id: masterRows[0].id,
            sku: masterRows[0].sku,
            name: masterRows[0].name,
            stock: masterRows[0].stock,
          };
        }
      }
      enrichedVariants.push({
        id: v.id,
        shopeeModelId: v.shopeeModelId,
        modelName: v.modelName,
        modelSku: v.modelSku,
        price: v.price,
        shopeeStock: v.shopeeStock,
        syncStatus: v.syncStatus,
        lastError: v.lastError,
        isMapped: v.masterProductId !== null,
        master,
      });
    }

    catalog.push({
      id: group.id,
      shopeeItemId: group.shopeeItemId,
      name: group.name,
      description: group.description,
      itemSku: group.itemSku,
      categoryId: group.categoryId,
      itemStatus: group.itemStatus,
      imageUrl: group.imageUrl,
      lastSync: group.lastSync,
      totalVariants: enrichedVariants.length,
      mappedVariants: enrichedVariants.filter(v => v.isMapped).length,
      variants: enrichedVariants,
    });
  }

  return catalog;
}

/**
 * Update product name via Shopee API and local DB.
 */
export async function updateShopeeItem(itemId: string, data: { name?: string; description?: string }) {
  const updatePayload: Record<string, any> = { item_id: parseInt(itemId) };
  if (data.name) updatePayload.item_name = data.name;
  if (data.description !== undefined) updatePayload.description = data.description;

  const result = await shopeeRequest({
    method: "POST",
    path: "/api/v2/product/update_item",
    body: updatePayload,
  });

  if (result.error) {
    throw new Error(`Shopee update_item error: ${result.message || result.error}`);
  }

  // Update local DB
  const localUpdate: Record<string, any> = {};
  if (data.name) localUpdate.name = data.name;
  if (data.description !== undefined) localUpdate.description = data.description;

  if (Object.keys(localUpdate).length > 0) {
    await db.update(productGroups)
      .set(localUpdate)
      .where(eq(productGroups.shopeeItemId, itemId));
  }

  console.log(`[EDIT] Updated item ${itemId}: ${JSON.stringify(data)}`);
  return { status: "success", item_id: itemId, ...data };
}

/**
 * Update variant price via Shopee API and local DB.
 */
export async function updateShopeePrice(itemId: string, modelId: string, price: number) {
  const result = await shopeeRequest({
    method: "POST",
    path: "/api/v2/product/update_price",
    body: {
      item_id: parseInt(itemId),
      price_list: [{ model_id: parseInt(modelId), original_price: price }],
    },
  });

  if (result.error) {
    throw new Error(`Shopee update_price error: ${result.message || result.error}`);
  }

  // Update local DB
  await db.update(products)
    .set({ price: Math.round(price) })
    .where(eq(products.shopeeModelId, modelId));

  console.log(`[EDIT] Updated price item=${itemId} model=${modelId} price=${price}`);
  return { status: "success", item_id: itemId, model_id: modelId, price };
}

/**
 * Update variant stock via Shopee API and local DB (from Produk Channel).
 */
export async function updateShopeeVariantStock(
  itemId: string,
  modelId: string,
  stock: number,
) {
  await updateStockOnShopeeBatch(itemId, [{ shopeeModelId: modelId, stock }]);

  // Update local DB
  await db.update(products)
    .set({ shopeeStock: stock })
    .where(eq(products.shopeeModelId, modelId));

  console.log(`[EDIT] Updated stock item=${itemId} model=${modelId} stock=${stock}`);
  return { status: "success", item_id: itemId, model_id: modelId, stock };
}

/**
 * Toggle item status on Shopee (list/unlist).
 */
export async function toggleShopeeItemStatus(itemIds: string[], unlist: boolean) {
  const result = await shopeeRequest({
    method: "POST",
    path: "/api/v2/product/unlist_item",
    body: {
      item_list: itemIds.map(id => ({ item_id: parseInt(id) })),
      unlist,
    },
  });

  if (result.error) {
    throw new Error(`Shopee unlist_item error: ${result.message || result.error}`);
  }

  // Update local DB
  const newStatus = unlist ? "UNLIST" : "NORMAL";
  for (const itemId of itemIds) {
    await db.update(productGroups)
      .set({ itemStatus: newStatus })
      .where(eq(productGroups.shopeeItemId, itemId));
  }

  console.log(`[EDIT] Toggled ${itemIds.length} items to ${newStatus}`);
  return { status: "success", items: itemIds.length, new_status: newStatus };
}

/**
 * Update a variant's name and/or SKU on Shopee and local DB.
 */
export async function updateShopeeModel(
  itemId: string,
  modelId: string,
  data: { modelName?: string; modelSku?: string }
) {
  // Build model list for Shopee API
  const modelUpdate: Record<string, any> = { model_id: parseInt(modelId) };
  if (data.modelName !== undefined) modelUpdate.model_name = data.modelName;
  if (data.modelSku !== undefined) modelUpdate.model_sku = data.modelSku;

  const result = await shopeeRequest({
    method: "POST",
    path: "/api/v2/product/update_model",
    body: {
      item_id: parseInt(itemId),
      model: [modelUpdate],
    },
  });

  if (result.error) {
    throw new Error(`Shopee update_model error: ${result.message || result.error}`);
  }

  // Update local DB
  const dbUpdate: Record<string, any> = { updatedAt: new Date() };
  if (data.modelName !== undefined) dbUpdate.modelName = data.modelName;
  if (data.modelSku !== undefined) dbUpdate.modelSku = data.modelSku;

  await db.update(products)
    .set(dbUpdate)
    .where(eq(products.shopeeModelId, modelId));

  console.log(`[EDIT] Updated model ${modelId} (item ${itemId}): name=${data.modelName}, sku=${data.modelSku}`);
  return { status: "success", model_id: modelId };
}
