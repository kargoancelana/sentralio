/**
 * Shopee API integration (dummy). Replace body with real HTTP calls later.
 */
export async function updateStockOnShopee(
  shopeeItemId: string,
  shopeeModelId: string,
  stock: number,
): Promise<{ ok: true; mocked: true }> {
  console.log(
    `[shopee:dummy] updateStock item=${shopeeItemId} model=${shopeeModelId} stock=${stock}`,
  );
  return { ok: true, mocked: true };
}
