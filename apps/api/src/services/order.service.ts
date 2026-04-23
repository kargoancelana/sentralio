import { db } from "../db/client";
import { shopeeOrders, shopeeOrderItems } from "../db/schema";
import { getShopeeOrderList, getShopeeOrderDetails } from "./shopee-raw";
import { eq } from "drizzle-orm";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function syncShopeeOrdersService(shopId: number, daysBack: number = 15) {
  // Hitung rentang waktu
  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - daysBack * 24 * 60 * 60;
  const timeTo = now;

  let hasMore = true;
  let cursor = "";
  let totalSynced = 0;
  let pageNum = 0;

  while (hasMore) {
    pageNum++;
    // Throttle: jeda 300ms antar halaman untuk menghindari rate limit Shopee
    if (pageNum > 1) await sleep(300);

    let listRes: any;
    // Retry saat kena rate limit (error_too_frequent / 429)
    for (let attempt = 0; attempt < 3; attempt++) {
      listRes = await getShopeeOrderList(shopId, timeFrom, timeTo, cursor);
      if (listRes?.error === "error_too_frequent") {
        console.warn(`[order-sync] Rate limited on page ${pageNum}, retrying in 2s... (attempt ${attempt + 1})`);
        await sleep(2000);
        continue;
      }
      break;
    }

    if (listRes.error) {
      throw new Error(`Gagal menarik order list: ${listRes.message || listRes.error}`);
    }

    const orderList = listRes.response?.order_list || [];
    if (orderList.length === 0) break;

    // Ekstrak SN pesanan
    const orderSns = orderList.map((o: any) => o.order_sn);

    // Ambil detail per batch 50 SN dengan throttle
    const BATCH = 50;
    for (let i = 0; i < orderSns.length; i += BATCH) {
      if (i > 0) await sleep(300);

      const batchSns = orderSns.slice(i, i + BATCH);
      let detailRes: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        detailRes = await getShopeeOrderDetails(shopId, batchSns);
        if (detailRes?.error === "error_too_frequent") {
          console.warn(`[order-sync] Rate limited on detail batch, retrying in 2s... (attempt ${attempt + 1})`);
          await sleep(2000);
          continue;
        }
        break;
      }

      if (detailRes.error) {
        throw new Error(`Gagal menarik order detail: ${detailRes.message || detailRes.error}`);
      }

      const orderDetails = detailRes.response?.order_list || [];

      // Upsert ke database lokal
      for (const order of orderDetails) {
        const shippingCarrier = order.shipping_carrier || order.shipping_info?.shipping_carrier || null;

        const orderPayload = {
          shopId,
          orderSn: order.order_sn,
          orderStatus: order.order_status,
          totalAmount: order.total_amount ? Math.round(order.total_amount) : 0,
          buyerUsername: order.buyer_username || "",
          shippingCarrier,
          payTime: order.pay_time ? new Date(order.pay_time * 1000) : null,
          createTime: new Date(order.create_time * 1000),
          updatedAt: new Date(),
        };

        const existing = await db.select().from(shopeeOrders).where(eq(shopeeOrders.orderSn, order.order_sn)).limit(1);

        if (existing.length > 0) {
          await db.update(shopeeOrders).set(orderPayload).where(eq(shopeeOrders.orderSn, order.order_sn));
        } else {
          await db.insert(shopeeOrders).values(orderPayload);
        }

        // Upsert order items: hapus lama lalu insert baru
        const itemList: any[] = order.item_list || [];
        if (itemList.length > 0) {
          await db.delete(shopeeOrderItems).where(eq(shopeeOrderItems.orderSn, order.order_sn));
          for (const item of itemList) {
            await db.insert(shopeeOrderItems).values({
              orderSn: order.order_sn,
              itemName: item.item_name || "—",
              modelName: item.model_name || null,
              qty: item.model_quantity_purchased || item.quantity_purchased || 1,
              itemPrice: item.model_discounted_price
                ? Math.round(item.model_discounted_price)
                : Math.round(item.model_original_price || 0),
            });
          }
        }

        totalSynced++;
      }
    }

    hasMore = listRes.response?.more || false;
    cursor = listRes.response?.next_cursor || "";
  }

  return { success: true, syncedCount: totalSynced };
}
