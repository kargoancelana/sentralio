import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { products, productGroups } from "../../db/schema";
import { updateStockOnShopee } from "../../services/shopee.service";
import { delay } from "../../utils/delay";
import { env } from "../../config/env";
import type { StockSource } from "./product.controller";

const STOCK_MAX = 10_000;

export async function syncStockByProductId(input: {
  productId: number;
  newStock: number;
  source: StockSource;
}) {
  console.log(`[sync] request key=product_id value=${input.productId} stock=${input.newStock} source=${input.source}`);

  const rows = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Product not found");
  }
  return syncStockForGroup({
    groupId: row.groupId,
    newStock: input.newStock,
    source: input.source,
  });
}

export async function syncStockByShopeeItemId(input: {
  shopeeItemId: string;
  newStock: number;
  source: StockSource;
}) {
  console.log(
    `[sync] request key=shopee_item_id value=${input.shopeeItemId} stock=${input.newStock} source=${input.source}`,
  );

  const rows = await db.select().from(products).where(eq(products.shopeeItemId, input.shopeeItemId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Product not found for shopee_item_id");
  }
  return syncStockForGroup({
    groupId: row.groupId,
    newStock: input.newStock,
    source: input.source,
  });
}

export async function syncStockForGroup(input: { groupId: number; newStock: number; source: StockSource }) {
  console.warn(`[DEPRECATED] syncStockForGroup called with group_id=${input.groupId}. Use /master/update-stock instead.`);
  if (input.newStock < 0 || input.newStock > STOCK_MAX) {
    throw new Error(`Invalid stock: must be between 0 and ${STOCK_MAX}`);
  }

  // 1. Fetch current group
  const groupRows = await db.select().from(productGroups).where(eq(productGroups.id, input.groupId)).limit(1);
  const groupRow = groupRows[0];
  if (!groupRow) {
    throw new Error("Product group not found");
  }

  // 2. Optimize: Skip if stock identical
  if (groupRow.stock === input.newStock) {
    console.log(`[sync] No change detected, skipping sync for group_id=${input.groupId}`);
    return { groupId: input.groupId, total: 0, success: 0, failed: 0 };
  }

  // 3. Update master stock
  await db.update(productGroups).set({ stock: input.newStock }).where(eq(productGroups.id, input.groupId));

  // 4. Fetch associated listings
  const groupProducts = await db.select().from(products).where(eq(products.groupId, input.groupId));
  
  if (groupProducts.length === 0) {
    console.warn(`[sync] warning: group has no listings group_id=${input.groupId}`);
    return { groupId: input.groupId, total: 0, success: 0, failed: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  for (const p of groupProducts) {
    await db.update(products).set({ syncStatus: "pending" }).where(eq(products.id, p.id));

    let isSuccess = false;
    let lastErrorMsg: string | null = null;

    // Attempt 1
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), env.syncTimeoutMs);
      await updateStockOnShopee(p.shopeeItemId, p.shopeeModelId, input.newStock, controller.signal);
      clearTimeout(timeoutId);
      isSuccess = true;
    } catch (err: any) {
      // Attempt 2 (Retry x1)
      try {
        console.warn(`[sync] shopee_update failed for product_id=${p.id}, retrying... error: ${err.message}`);
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), env.syncTimeoutMs);
        await updateStockOnShopee(p.shopeeItemId, p.shopeeModelId, input.newStock, controller2.signal);
        clearTimeout(timeoutId2);
        isSuccess = true;
      } catch (retryErr: any) {
        lastErrorMsg = retryErr.message || String(retryErr);
        if (lastErrorMsg?.toLowerCase().includes("timeout") || retryErr.name === "AbortError") {
          console.error("SYNC_TIMEOUT", {
            groupId: input.groupId,
            itemId: p.shopeeItemId,
            modelId: p.shopeeModelId,
          });
        }
        console.error("SYNC_FAILED", {
          groupId: input.groupId,
          itemId: p.shopeeItemId,
          modelId: p.shopeeModelId,
          error: lastErrorMsg
        });
      }
    }

    // 5. Finalize listing status
    if (isSuccess) {
      console.log("SYNC_SUCCESS", {
        groupId: input.groupId,
        itemId: p.shopeeItemId,
        modelId: p.shopeeModelId,
        stock: input.newStock
      });
      await db
        .update(products)
        .set({ syncStatus: "success", lastError: null, updatedAt: new Date() })
        .where(eq(products.id, p.id));
      successCount++;
    } else {
      await db
        .update(products)
        .set({ syncStatus: "failed", lastError: lastErrorMsg, updatedAt: new Date() })
        .where(eq(products.id, p.id));
      failedCount++;
    }

    await delay(env.syncDelayMs);
  }

  return {
    groupId: input.groupId,
    total: groupProducts.length,
    success: successCount,
    failed: failedCount
  };
}

export async function getGroupStatus(groupId: number) {
  const groupRows = await db.select().from(productGroups).where(eq(productGroups.id, groupId)).limit(1);
  const groupRow = groupRows[0];
  if (!groupRow) return null;

  const groupProducts = await db.select().from(products).where(eq(products.groupId, groupId));

  return {
    group_id: groupRow.id,
    stock: groupRow.stock,
    listings: groupProducts.map(p => ({
      item_id: p.shopeeItemId,
      model_id: p.shopeeModelId,
      sync_status: p.syncStatus,
      last_error: p.lastError
    }))
  };
}
