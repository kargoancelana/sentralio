import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { products } from "../../db/schema";
import { updateStockOnShopee } from "../../services/shopee.service";
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

async function syncStockForGroup(input: { groupId: number; newStock: number; source: StockSource }) {
  if (input.newStock < 0 || input.newStock > STOCK_MAX) {
    throw new Error(`Invalid stock: must be between 0 and ${STOCK_MAX}`);
  }

  const t0 = Date.now();
  const groupProducts = await db.select().from(products).where(eq(products.groupId, input.groupId));
  if (groupProducts.length === 0) {
    console.warn(`[sync] warning: group has no listings group_id=${input.groupId}`);
    return { groupId: input.groupId, updatedCount: 0, shopee: [] as { productId: number; ok: boolean }[] };
  }

  const now = new Date();
  const result = await db
    .update(products)
    .set({ stock: input.newStock, updatedAt: now })
    .where(eq(products.groupId, input.groupId));

  const updatedRows =
    typeof (result as unknown as { affectedRows?: number }).affectedRows === "number"
      ? (result as unknown as { affectedRows: number }).affectedRows
      : undefined;
  const durationMs = Date.now() - t0;

  console.log(
    `[sync] db_update group_id=${input.groupId} requested_stock=${input.newStock} source=${input.source} listings=${groupProducts.length}` +
      (updatedRows !== undefined ? ` affected_rows=${updatedRows}` : "") +
      ` duration_ms=${durationMs}`,
  );

  const shopee: { productId: number; ok: boolean }[] = [];
  for (const p of groupProducts) {
    try {
      await updateStockOnShopee(p.shopeeItemId, p.shopeeModelId, input.newStock);
      console.log(
        `[sync] shopee_update status=success product_id=${p.id} shopee_item_id=${p.shopeeItemId} shopee_model_id=${p.shopeeModelId}`,
      );
      shopee.push({ productId: p.id, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[sync] shopee_update status=fail product_id=${p.id} shopee_item_id=${p.shopeeItemId} shopee_model_id=${p.shopeeModelId} error=${msg}`,
      );
      shopee.push({ productId: p.id, ok: false });
    }
  }

  return {
    groupId: input.groupId,
    updatedCount: groupProducts.length,
    shopee,
  };
}
