import { Elysia, t } from "elysia";
import { getShopInfo, getItemListRaw, syncShopeeProducts, getShopeeCatalog, updateShopeeItem, updateShopeePrice } from "../../services/shopee.service";
import { getShopInfoRaw } from "../../services/shopee-raw";

export const shopeeRoutes = new Elysia({ prefix: "/shopee" })
  .get("/test-shop", async () => {
    return await getShopInfo();
  })
  .get("/test-raw", async () => {
    return await getShopInfoRaw();
  })
  .get("/real-items", async ({ query }) => {
    const offset = parseInt(query.offset as string) || 0;
    const pageSize = parseInt(query.page_size as string) || 10;
    return await getItemListRaw(offset, pageSize);
  })
  .get("/sync-products", async () => {
    return await syncShopeeProducts();
  })
  .get("/catalog", async () => {
    const catalog = await getShopeeCatalog();
    return { success: true, data: catalog };
  })
  .post(
    "/update-item",
    async ({ body, set }) => {
      try {
        const result = await updateShopeeItem(body.item_id, { name: body.name });
        return { success: true, data: result };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    },
    {
      body: t.Object({
        item_id: t.String(),
        name: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/update-price",
    async ({ body, set }) => {
      try {
        const result = await updateShopeePrice(body.item_id, body.model_id, body.price);
        return { success: true, data: result };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    },
    {
      body: t.Object({
        item_id: t.String(),
        model_id: t.String(),
        price: t.Number(),
      }),
    }
  );
