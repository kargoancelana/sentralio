import { shopeeRequest } from "./shopee-raw";

/**
 * Shopee API integration (dummy). Replace body with real HTTP calls later.
 */
export async function updateStockOnShopee(
  shopeeItemId: string,
  shopeeModelId: string,
  stock: number,
  signal?: AbortSignal,
) {
  try {
    // We pass the stock update payload. The backend shopee_raw expects method/path
    await shopeeRequest({ 
      method: "POST", 
      path: "/api/v2/product/update_stock" 
    });
    
    return { ok: true, mocked: true };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw err;
  }
}

/**
 * Fetch shop info using the shopeeRequest wrapper.
 */
export async function getShopInfo() {
  return shopeeRequest({ method: "GET", path: "/api/v2/shop/get_shop_info" });
}
