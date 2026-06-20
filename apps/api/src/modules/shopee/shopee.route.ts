import { Elysia, t } from "elysia";
import { getShopInfo, getItemListRaw, syncShopeeProducts, getShopeeCatalog, updateShopeeItem, updateShopeePrice, updateShopeeVariantStock, toggleShopeeItemStatus, updateShopeeModel } from "../../services/shopee.service";
import { getShopInfoRaw } from "../../services/shopee-raw";
import { autoMapProducts } from "../../services/master.service";
import { authMiddleware } from "../auth/auth.middleware";

export const shopeeRoutes = new Elysia({ prefix: "/shopee" })
  .use(authMiddleware)
  .get("/test-shop", async () => {
    return await getShopInfo();
  })
  .get("/test-raw", async () => {
    return await getShopInfoRaw();
  })
  .get("/real-items", async ({ query }) => {
    const shop_id = query.shop_id ? parseInt(query.shop_id as string) : undefined;
    if (!shop_id) throw new Error("shop_id is required");
    const offset = parseInt(query.offset as string) || 0;
    const pageSize = parseInt(query.page_size as string) || 10;
    return await getItemListRaw(shop_id, offset, pageSize);
  })
  .get("/sync-products", async ({ query, user }) => {
    const shop_id = query.shop_id ? parseInt(query.shop_id as string) : undefined;
    const result = await syncShopeeProducts(shop_id);
    await autoMapProducts(user.companyId); // Auto map after sync
    return result;
  })
  .get("/catalog", async ({ user }) => {
    await autoMapProducts(user.companyId); // Ensure mapping is up to date
    const catalog = await getShopeeCatalog(user.companyId);
    return { success: true, data: catalog };
  })
  .post(
    "/update-item",
    async ({ body, set }) => {
      try {
        const result = await updateShopeeItem(body.item_id, {
          name: body.name,
          description: body.description,
        });
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
        description: t.Optional(t.String()),
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
  )
  .post(
    "/update-variant-stock",
    async ({ body, set }) => {
      try {
        const result = await updateShopeeVariantStock(body.item_id, body.model_id, body.stock);
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
        stock: t.Number(),
      }),
    }
  )
  .post(
    "/toggle-status",
    async ({ body, set }) => {
      try {
        const result = await toggleShopeeItemStatus(body.item_ids, body.unlist);
        return { success: true, data: result };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    },
    {
      body: t.Object({
        item_ids: t.Array(t.String()),
        unlist: t.Boolean(),
      }),
    }
  )
  .post(
    "/update-model",
    async ({ body, set, user }) => {
      try {
        const result = await updateShopeeModel(body.item_id, body.model_id, {
          modelName: body.model_name,
          modelSku: body.model_sku,
        });
        if (body.model_sku !== undefined) {
          await autoMapProducts(user.companyId); // Auto map after updating SKU
        }
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
        model_name: t.Optional(t.String()),
        model_sku: t.Optional(t.String()),
      }),
    }
  );

