import * as productService from "./product.service";

export type StockSource = "manual" | "system" | "shopee";

export async function patchStockByProductId(productId: number, stock: number, source: StockSource) {
  return productService.syncStockByProductId({ productId, newStock: stock, source });
}

export async function patchStockByShopeeItemId(shopeeItemId: string, stock: number, source: StockSource) {
  return productService.syncStockByShopeeItemId({ shopeeItemId, newStock: stock, source });
}

export async function patchStockByGroupId(groupId: number, stock: number, source: StockSource) {
  return productService.syncStockForGroup({ groupId, newStock: stock, source });
}

export async function getGroupStatus(groupId: number) {
  return productService.getGroupStatus(groupId);
}
