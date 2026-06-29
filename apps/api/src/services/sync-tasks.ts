import { db } from "../db/client";
import { shopeeOrders, shopeeCredentials } from "../db/schema";
import { syncShopeeOrdersService } from "./order.service";
import { getShopeeOrderDetails } from "./shopee-raw";
import { EscrowSyncService } from "./escrow-sync.service";
import { getTotalAdsExpense } from "./ads-expense.service";
import { syncShopeeProducts } from "./shopee.service";
import { autoMapProducts } from "./master.service";
import { eq, or, and, desc } from "drizzle-orm";

export const STATUS_PRIORITY: Record<string, number> = {
  'UNPAID': 0, 'READY_TO_SHIP': 1, 'PROCESSED': 2,
  'SHIPPED': 3, 'TO_RETURN': 4, 'TO_CONFIRM_RECEIVE': 4, 'COMPLETED': 5,
  'IN_CANCEL': 99, 'CANCELLED': 99,  // Terminal states: always override
};

export async function syncOrdersForShop(shopId: number, daysBack: number) {
  return await syncShopeeOrdersService(shopId, daysBack, "", undefined, "create_time");
}

export async function syncEscrowForShop(daysBack: number, lockName: string) {
  return await new EscrowSyncService(lockName).startEscrowSync(daysBack);
}

export async function syncAdsForShop(shopId: number, startDate: string, endDate: string) {
  return await getTotalAdsExpense([shopId], startDate, endDate, { forceRefresh: true });
}

export async function syncProductsForShop(shopId: number) {
  const result = await syncShopeeProducts(shopId);

  // Resolve the company that owns this shop so auto-map stays scoped per-company.
  // Only resolve from CONNECTED credentials to avoid wrong company_id in multi-tenant scenarios.
  const credRows = await db.select({ companyId: shopeeCredentials.companyId })
    .from(shopeeCredentials)
    .where(
      and(
        eq(shopeeCredentials.shopId, shopId),
        eq(shopeeCredentials.status, "connected")
      )
    )
    .orderBy(desc(shopeeCredentials.updatedAt))
    .limit(1);
  const cred = credRows[0];
  if (cred) {
    await autoMapProducts(cred.companyId);
  } else {
    console.warn(`[sync-tasks] Skipping autoMapProducts: no CONNECTED shopeeCredentials found for shopId=${shopId}`);
  }

  return result;
}

export async function refreshOrderStatusesForShop(shopId: number): Promise<number> {
  const jobName = `stuck-orders-refresh-${shopId}`;
  let totalUpdated = 0;

  try {
    const stuckOrders = await db.select({
      orderSn: shopeeOrders.orderSn,
      shopId: shopeeOrders.shopId,
      orderStatus: shopeeOrders.orderStatus,
    })
      .from(shopeeOrders)
      .where(
        and(
          eq(shopeeOrders.shopId, shopId),
          or(
            eq(shopeeOrders.orderStatus, 'READY_TO_SHIP'),
            eq(shopeeOrders.orderStatus, 'PROCESSED'),
            eq(shopeeOrders.orderStatus, 'SHIPPED'),
            eq(shopeeOrders.orderStatus, 'TO_CONFIRM_RECEIVE')
          )
        )
      );

    if (stuckOrders.length === 0) {
      return 0;
    }

    const orderSns = stuckOrders.map(o => o.orderSn);
    const BATCH = 50;

    for (let i = 0; i < orderSns.length; i += BATCH) {
      if (i > 0) await new Promise(r => setTimeout(r, 500));

      const batchSns = orderSns.slice(i, i + BATCH);
      try {
        const detailRes = await getShopeeOrderDetails(shopId, batchSns);
        if (detailRes.error) {
          console.warn(`[sync-tasks] Error fetching details for shop ${shopId}:`, detailRes.message);
          continue;
        }

        const orderDetails = detailRes.response?.order_list || [];
        for (const order of orderDetails) {
          const apiStatus = order.order_status;
          const existingRows = await db.select().from(shopeeOrders)
            .where(eq(shopeeOrders.orderSn, order.order_sn)).limit(1);

          if (existingRows.length === 0) continue;
          const existing = existingRows[0];
          if (!existing) continue;
          const oldStatus = existing.orderStatus;

          let finalStatus = apiStatus;
          if (order.pickup_done_time && order.pickup_done_time > 0 && finalStatus === 'READY_TO_SHIP') {
            finalStatus = 'SHIPPED';
          }

          const apiShipByDate = order.ship_by_date ?? existing.shipByDate;
          if (finalStatus === oldStatus && apiShipByDate !== existing.shipByDate) {
            await db.update(shopeeOrders)
              .set({ shipByDate: apiShipByDate, updatedAt: new Date() })
              .where(eq(shopeeOrders.orderSn, order.order_sn));
            console.log(`[sync-tasks] 🔄 ${order.order_sn} ship_by_date ${existing.shipByDate} → ${apiShipByDate} (status unchanged)`);
            totalUpdated++;
          }

          if (finalStatus !== oldStatus) {
            const oldP = STATUS_PRIORITY[oldStatus] ?? 0;
            const newP = STATUS_PRIORITY[finalStatus] ?? 0;

            if (newP >= oldP) {
              const shippingCarrier = order.shipping_carrier
                || order.package_list?.[0]?.shipping_carrier
                || existing.shippingCarrier;

              await db.update(shopeeOrders)
                .set({
                  orderStatus: finalStatus,
                  shippingCarrier,
                  totalAmount: order.total_amount ? Math.round(order.total_amount) : existing.totalAmount,
                  shipByDate: order.ship_by_date ?? existing.shipByDate,
                  updatedAt: new Date(),
                })
                .where(eq(shopeeOrders.orderSn, order.order_sn));

              console.log(`[sync-tasks] ✅ Updated ${order.order_sn}: ${oldStatus} → ${finalStatus}`);
              totalUpdated++;
            }
          }
        }
      } catch (err: any) {
        console.error(`[sync-tasks] Error processing batch for shop ${shopId}:`, err.message);
      }
    }
  } catch (error: any) {
    console.error(`[sync-tasks] Refresh failed for shop ${shopId}:`, error.message);
    throw error;
  }

  return totalUpdated;
}
