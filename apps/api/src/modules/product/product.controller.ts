import * as productService from "./product.service";

export type StockSource = "manual" | "system" | "shopee";

export async function patchStockByProductId(productId: number, stock: number, source: StockSource, companyId: number) {
  return productService.syncStockByProductId({ productId, newStock: stock, source, companyId });
}

export async function patchStockByShopeeItemId(shopeeItemId: string, stock: number, source: StockSource, companyId: number) {
  return productService.syncStockByShopeeItemId({ shopeeItemId, newStock: stock, source, companyId });
}

export async function patchStockByGroupId(groupId: number, stock: number, source: StockSource, companyId: number) {
  return productService.syncStockForGroup({ groupId, newStock: stock, source, companyId });
}

export async function getGroupStatus(groupId: number, companyId: number) {
  return productService.getGroupStatus(groupId, companyId);
}
