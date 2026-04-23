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
    const { shop_id, days_back } = body as { shop_id?: number, days_back?: number };
    
    let shopsToSync = [];
    if (shop_id) {
      shopsToSync = [{ shopId: shop_id }];
    } else {
      shopsToSync = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials);
    }

    if (shopsToSync.length === 0) {
      throw new Error("Tidak ada toko yang terhubung untuk menarik pesanan.");
    }

    try {
      let totalSynced = 0;
      for (const shop of shopsToSync) {
         const result = await syncShopeeOrdersService(shop.shopId, days_back || 15);
         totalSynced += result.syncedCount;
      }
      return { success: true, message: `Berhasil menarik ${totalSynced} pesanan.`, syncedCount: totalSynced };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, {
    body: t.Optional(t.Object({
      shop_id: t.Optional(t.Number()),
      days_back: t.Optional(t.Number()),
    }))
  });
