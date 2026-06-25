/**
 * Push Sync Worker — memproses job dari pushSyncQueue.
 *
 * Setiap job berisi satu order_sn dari Shopee Push (code 3: Order Status).
 * Worker memanggil getShopeeOrderDetails untuk fetch data lengkap satu order,
 * lalu upsert ke shopee_orders dengan company_id yang benar.
 */

import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";
import { getShopeeOrderDetails } from "../services/shopee-raw";

interface PushSyncJobData {
  shopId: number;
  orderSn: string;
  companyId: number;
  type: "order_status";
}

const STATUS_PRIORITY: Record<string, number> = {
  UNPAID: 0, READY_TO_SHIP: 1, PROCESSED: 2,
  SHIPPED: 3, TO_RETURN: 4, TO_CONFIRM_RECEIVE: 4, COMPLETED: 5,
  IN_CANCEL: 99, CANCELLED: 99,
};

export function startPushSyncWorker(): Worker {
  const worker = new Worker<PushSyncJobData>(
    "push-sync",
    async (job: Job<PushSyncJobData>) => {
      const { shopId, orderSn, companyId } = job.data;

      console.log(`[push-sync-worker] Syncing order ${orderSn} for shop ${shopId}`);

      const detailRes = await getShopeeOrderDetails(shopId, [orderSn]);
      if (detailRes?.error) {
        throw new Error(`getShopeeOrderDetails error: ${detailRes.message || detailRes.error}`);
      }

      const orderList: any[] = detailRes?.response?.order_list || [];
      const order = orderList[0];
      if (!order) {
        console.warn(`[push-sync-worker] No detail returned for ${orderSn}`);
        return { skipped: true };
      }

      const shippingCarrier = order.shipping_carrier
        || order.package_list?.[0]?.shipping_carrier
        || null;

      // Anti-downgrade: cek status lama
      const existing = await db.select({ orderStatus: shopeeOrders.orderStatus, trackingNumber: shopeeOrders.trackingNumber })
        .from(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn)).limit(1);

      let finalStatus = order.order_status;
      if (order.pickup_done_time && order.pickup_done_time > 0 && finalStatus === "READY_TO_SHIP") {
        finalStatus = "SHIPPED";
      }

      const payload: Record<string, any> = {
        companyId,
        shopId,
        orderSn,
        orderStatus: finalStatus,
        totalAmount: order.total_amount ? Math.round(order.total_amount) : 0,
        buyerUsername: order.buyer_username || "",
        shippingCarrier,
        trackingNumber: existing[0]?.trackingNumber ?? null,
        shipByDate: order.ship_by_date ?? 0,
        payTime: order.pay_time ? new Date(order.pay_time * 1000) : null,
        createTime: new Date(order.create_time * 1000),
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        const oldPriority = STATUS_PRIORITY[existing[0].orderStatus] ?? 0;
        const newPriority = STATUS_PRIORITY[finalStatus] ?? 0;
        if (newPriority < oldPriority) {
          console.log(`[push-sync-worker] Anti-downgrade: skip ${existing[0].orderStatus} → ${finalStatus} for ${orderSn}`);
          delete payload.orderStatus;
        }
        await db.update(shopeeOrders).set(payload).where(eq(shopeeOrders.orderSn, orderSn));
      } else {
        await db.insert(shopeeOrders).values(payload as any);
      }

      console.log(`[push-sync-worker] Done: ${orderSn} status=${finalStatus}`);
      return { success: true, orderSn };
    },
    { connection, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[push-sync-worker] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
