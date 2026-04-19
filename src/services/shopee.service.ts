import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { productGroups, products } from "../db/schema";
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

    await shopeeRequest({
      method: "POST",
      path: "/api/v2/product/update_stock",
      query: { item_id: parseInt(shopeeItemId) },
    });

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

export async function getMockShopeeItems() {
  return [
    {
      item_id: "100001",
      item_name: "Produk A",
      models: [
        { model_id: "200001" },
        { model_id: "200002" }
      ]
    },
    {
      item_id: "100002",
      item_name: "Produk B",
      models: [
        { model_id: "200003" }
      ]
    }
  ];
}

export async function syncMockShopeeItems() {
  const items = await getMockShopeeItems();

  for (const item of items) {
    console.log("[SYNC UPSERT] item:", item.item_id);

    // 1. Upsert product_group using the unique constraint on shopeeItemId
    await db.insert(productGroups)
      .values({ shopeeItemId: item.item_id, name: item.item_name, stock: 0 })
      .onDuplicateKeyUpdate({ set: { name: item.item_name } });

    // Fetch the resolved group ID immediately using the shopee_item_id unique index
    const groupRows = await db.select().from(productGroups)
      .where(eq(productGroups.shopeeItemId, item.item_id)).limit(1);
    
    if (groupRows.length === 0) {
      throw new Error(`Failed to upsert or locate group for item: ${item.item_id}`);
    }
    const groupId = groupRows[0].id;

    // 2. Upsert products based on item_id + model_id
    for (const model of item.models) {
      console.log("[SYNC UPSERT] model:", model.model_id);
      
      await db.insert(products)
        .values({
          groupId: groupId,
          shopeeItemId: item.item_id,
          shopeeModelId: model.model_id,
          stock: 0,
          syncStatus: "success"
        })
        .onDuplicateKeyUpdate({ 
          set: { 
            groupId: groupId,
            updatedAt: new Date()
          } 
        });
    }
  }

  return { total: items.length };
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

export async function getModelListByItemId(itemId: string): Promise<string[]> {
  console.log(`[REAL API] Fetch models for item_id=${itemId}`);
  const res = await shopeeRequest({
    method: "GET",
    path: "/api/v2/product/get_model_list",
    query: { item_id: parseInt(itemId) }
  });

  if (res.error) throw new Error("API Error: " + res.message);

  const models = res.response.model || [];
  return models.map((m: any) => m.model_id.toString());
}

export async function syncShopeeProducts() {
  const itemIds = await getItemListAll();
  let totalModels = 0;

  for (const itemId of itemIds) {
    const modelIds = await getModelListByItemId(itemId);
    
    // 1. UPSERT product group (Item level)
    await db.insert(productGroups)
      .values({ 
        shopeeItemId: itemId, 
        name: `Shopee Item ${itemId}`, 
        stock: 0 
      })
      .onDuplicateKeyUpdate({ set: { shopeeItemId: itemId } });

    // 2. Extract internal Group ID mapping
    const groupRows = await db.select({ id: productGroups.id }).from(productGroups)
      .where(eq(productGroups.shopeeItemId, itemId)).limit(1);
    
    if (groupRows.length === 0) continue;
    const groupId = groupRows[0].id;

    // 3. UPSERT products (Model level)
    for (const modelId of modelIds) {
      await db.insert(products)
        .values({
          groupId,
          shopeeItemId: itemId,
          shopeeModelId: modelId,
          stock: 0,
          syncStatus: "success"
        })
        .onDuplicateKeyUpdate({
          set: { groupId, updatedAt: new Date() }
        });
      totalModels++;
    }
  }

  return { total_items: itemIds.length, total_models: totalModels, status: "success" };
}
