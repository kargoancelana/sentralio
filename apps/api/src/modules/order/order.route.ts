import { Elysia, t } from "elysia";
import { db } from "../../db/client";
import { shopeeOrders, shopeeOrderItems, shopeeCredentials } from "../../db/schema";
import { syncShopeeOrdersService } from "../../services/order.service";
import { desc, eq } from "drizzle-orm";

export const orderRoutes = new Elysia({ prefix: "/orders" })
  
  // Get order list from local DB with items
  .get("/", async () => {
    const records = await db.select().from(shopeeOrders).orderBy(desc(shopeeOrders.createTime));
    // Attach items to each order
    const result = await Promise.all(records.map(async (order) => {
      const items = await db.select().from(shopeeOrderItems).where(eq(shopeeOrderItems.orderSn, order.orderSn));
      return { ...order, items };
    }));
    return { success: true, data: result };
  })

  // Sync orders from Shopee (Last 15 days)
  .post("/sync", async ({ body }) => {
    const { shop_id, days_back, cursor, shop_index = 0 } = body as { shop_id?: number, days_back?: number, cursor?: string, shop_index?: number };
    
    let shopsToSync = [];
    if (shop_id) {
      shopsToSync = [{ shopId: shop_id }];
    } else {
      shopsToSync = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials);
    }

    if (shopsToSync.length === 0) {
      throw new Error("Tidak ada toko yang terhubung untuk menarik pesanan.");
    }

    if (shop_index >= shopsToSync.length) {
      return { success: true, data: { fetched: 0, has_more: false, next_cursor: "", shop_index: 0 } };
    }

    try {
      const currentShopId = shopsToSync[shop_index].shopId;
      const result = await syncShopeeOrdersService(currentShopId, days_back || 15, cursor || "");
      
      let next_cursor = result.next_cursor;
      let has_more = result.has_more;
      let next_shop_index = shop_index;

      // Jika satu toko sudah selesai, lanjut ke toko berikutnya jika ada
      if (!has_more && shop_index + 1 < shopsToSync.length) {
         has_more = true;
         next_cursor = "";
         next_shop_index = shop_index + 1;
      }

      return { 
        success: true, 
        message: `Berhasil menarik ${result.syncedCount} pesanan.`, 
        data: { 
          fetched: result.syncedCount, 
          has_more, 
          next_cursor, 
          shop_index: next_shop_index 
        } 
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, {
    body: t.Optional(t.Object({
      shop_id: t.Optional(t.Number()),
      days_back: t.Optional(t.Number()),
      cursor: t.Optional(t.String()),
      shop_index: t.Optional(t.Number()),
    }))
  });
