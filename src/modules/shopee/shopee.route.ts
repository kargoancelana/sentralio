import { Elysia } from "elysia";
import { getShopInfo, syncMockShopeeItems, getItemListRaw, syncShopeeProducts } from "../../services/shopee.service";
import { getShopInfoRaw } from "../../services/shopee-raw";

export const shopeeRoutes = new Elysia({ prefix: "/shopee" })
  .get("/test-shop", async () => {
    return await getShopInfo();
  })
  .get("/test-raw", async () => {
    return await getShopInfoRaw();
  })
  .get("/sync-mock-products", async () => {
    return await syncMockShopeeItems();
  })
  .get("/real-items", async ({ query }) => {
    const offset = parseInt(query.offset as string) || 0;
    const pageSize = parseInt(query.page_size as string) || 10;
    return await getItemListRaw(offset, pageSize);
  })
  .get("/sync-products", async () => {
    return await syncShopeeProducts();
  });
