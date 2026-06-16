import { Elysia, t } from "elysia";
import { getShopInfo, getItemListRaw, syncShopeeProducts, getShopeeCatalog, updateShopeeItem, updateShopeePrice, updateShopeeVariantStock, toggleShopeeItemStatus, updateShopeeModel } from "../../services/shopee.service";
import { getShopInfoRaw } from "../../services/shopee-raw";
import { autoMapProducts } from "../../services/master.service";
import { db } from "../../db/client";
import { shopeeCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";
import { ensureAllTokensFresh } from "../../services/shopee-auth";

export const shopeeRoutes = new Elysia({ prefix: "/shopee" })
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
  .get("/sync-products", async ({ query }) => {
    const shop_id = query.shop_id ? parseInt(query.shop_id as string) : undefined;
    const result = await syncShopeeProducts(shop_id);
    await autoMapProducts(); // Auto map after sync
    return result;
  })
  .get("/catalog", async () => {
    await autoMapProducts(); // Ensure mapping is up to date
    const catalog = await getShopeeCatalog();
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
    async ({ body, set }) => {
      try {
        const result = await updateShopeeModel(body.item_id, body.model_id, {
          modelName: body.model_name,
          modelSku: body.model_sku,
        });
        if (body.model_sku !== undefined) {
          await autoMapProducts(); // Auto map after updating SKU
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
  )

  // ─── Multi-Seller: List all connected shops ─────────────────
  .get("/credentials/list", async () => {
    try {
      // Smart-refresh: proactively refresh any expired/near-expired tokens
      await ensureAllTokensFresh();

      // Only list connected shops — disconnected shops are hidden everywhere.
      const rows = await db.select().from(shopeeCredentials)
        .where(eq(shopeeCredentials.status, "connected"));
      return {
        success: true,
        data: rows.map(r => ({
          id: r.id,
          shop_id: r.shopId,
          shop_name: r.shopName || `Shop #${r.shopId}`,
          connected: new Date(r.expiresAt) > new Date(),
          is_expired: new Date(r.expiresAt) < new Date(),
          expires_at: r.expiresAt.toISOString(),
          updated_at: r.updatedAt.toISOString(),
        })),
      };
    } catch (err) {
      console.error("[shopee/credentials/list] gagal:", err);
      return { success: false, data: [] };
    }
  })

  // ─── Multi-Seller: Status of specific shop ──────────────────
  .get("/credentials/status", async ({ query }) => {
    try {
      const shopId = query.shop_id ? parseInt(query.shop_id as string) : undefined;
      let rows;
      if (shopId) {
        rows = await db.select().from(shopeeCredentials)
          .where(eq(shopeeCredentials.shopId, shopId)).limit(1);
      } else {
        rows = await db.select().from(shopeeCredentials).limit(1);
      }
      if (rows.length === 0) {
        return { connected: false, message: "No credentials found" };
      }
      const cred = rows[0];
      const isExpired = new Date(cred.expiresAt) < new Date();
      return {
        connected: !isExpired,
        shop_id: cred.shopId,
        shop_name: cred.shopName || `Shop #${cred.shopId}`,
        expires_at: cred.expiresAt.toISOString(),
        is_expired: isExpired,
        updated_at: cred.updatedAt.toISOString(),
      };
    } catch (err) {
      console.error("[shopee/credentials/status] gagal:", err);
      return { connected: false, message: "Failed to check credentials" };
    }
  })

  // ─── Multi-Seller: Disconnect a shop (soft) ─────────────────
  // Soft-disconnect: keep the credentials row (so shop name + historical data
  // survive) but mark it disconnected and clear tokens. All of the shop's data
  // is then hidden across the app and sync skips it, until it's reconnected via
  // OAuth re-auth (which flips status back to 'connected').
  .delete("/credentials/:shopId", async ({ params, set }) => {
    const shopId = parseInt(params.shopId);
    if (!Number.isFinite(shopId)) {
      set.status = 400;
      return { success: false, message: "Invalid shop ID" };
    }
    try {
      const existing = await db.select().from(shopeeCredentials)
        .where(eq(shopeeCredentials.shopId, shopId)).limit(1);
      if (existing.length === 0) {
        set.status = 404;
        return { success: false, message: `Shop ${shopId} not found` };
      }
      await db.update(shopeeCredentials)
        .set({
          status: "disconnected",
          // Clear tokens — we never keep credentials for a disconnected shop.
          accessToken: "",
          refreshToken: "",
          updatedAt: new Date(),
        })
        .where(eq(shopeeCredentials.shopId, shopId));
      console.log(`[shopee-cred] Soft-disconnected shop_id=${shopId} (data hidden, sync skipped)`);
      return { success: true, message: `Shop ${shopId} disconnected` };
    } catch (err: any) {
      console.error("[shopee/credentials/delete] gagal:", err);
      set.status = 500;
      return { success: false, message: err.message };
    }
  });
