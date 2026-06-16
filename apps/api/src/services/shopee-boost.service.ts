import { shopeeRequest } from "./shopee-raw";

export interface BoostedItem {
  item_id: number;
  cool_down_second: number;
}

// GET daftar produk yang sedang di-boost + sisa cooldown
export async function getBoostedList(shopId: number): Promise<BoostedItem[]> {
  const res = await shopeeRequest({
    shopId,
    method: "GET",
    path: "/api/v2/product/get_boosted_list",
  });
  // bentuk respons Shopee: { error, message, response: { item_list: [...] } }
  return res?.response?.item_list ?? [];
}

// POST boost 1-5 item. Throw kalau Shopee balas error.
export async function boostItems(shopId: number, itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return;
  if (itemIds.length > 5) throw new Error("Maksimal 5 item per boost");

  const res = await shopeeRequest({
    shopId,
    method: "POST",
    path: "/api/v2/product/boost_item",
    body: { item_id_list: itemIds },
  });

  if (res?.error) {
    throw new Error(`Shopee boost_item error: ${res.error} - ${res.message}`);
  }
}
