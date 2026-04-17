import { shopeeRequest } from "./shopee-raw";

/**
 * Shopee API integration (dummy). Replace body with real HTTP calls later.
 */
export async function updateStockOnShopee(
  shopeeItemId: string,
  shopeeModelId: string,
  stock: number,
  signal?: AbortSignal,
): Promise<{ ok: true; mocked: true }> {
  try {
    console.log(
      `[shopee:dummy] updateStock item=${shopeeItemId} model=${shopeeModelId} stock=${stock}`,
    );
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
