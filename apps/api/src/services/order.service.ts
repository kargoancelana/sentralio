import { db } from "../db/client";
import { shopeeOrders, shopeeOrderItems } from "../db/schema";
import { getShopeeOrderList, getShopeeOrderDetails } from "./shopee-raw";
import { eq } from "drizzle-orm";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Shopee API limit: maximum 15 days per request
const MAX_DAYS_PER_REQUEST = 15;

/**
 * Status priority map to prevent status downgrades during sync.
 * Higher number = more advanced status in the order lifecycle.
 * 
 * When multiple sync jobs run concurrently, a race condition can occur:
 * - Job A (update_time) gets order as SHIPPED
 * - Job B (create_time) gets same order as READY_TO_SHIP (stale snapshot)
 * - Without this guard, Job B would revert the status back to READY_TO_SHIP
 * 
 * PROCESSED is a WMS-internal status (set after ship_order API call),
 * Shopee never returns it — it sits between READY_TO_SHIP and SHIPPED.
 * 
 * CANCELLED and IN_CANCEL are terminal states that override any status.
 * When an order is cancelled, it must update regardless of current status.
 */
const STATUS_PRIORITY: Record<string, number> = {
  'UNPAID': 0,
  'READY_TO_SHIP': 1,
  'PROCESSED': 2,     // WMS-internal: after ship_order, before Shopee confirms SHIPPED
  'SHIPPED': 3,
  'TO_RETURN': 4,
  'TO_CONFIRM_RECEIVE': 4,
  'COMPLETED': 5,
  'IN_CANCEL': 99,    // Terminal state: always override
  'CANCELLED': 99,    // Terminal state: always override
};

/**
 * Sync Shopee orders using daysBack (for backward compatibility and manual sync)
 * Automatically chunks requests if daysBack > 15 days (Shopee API limit)
 */
export async function syncShopeeOrdersService(
  shopId: number, 
  daysBack: number = 15, 
  cursor: string = "",
  orderStatus?: string, // Optional: filter by order status for faster sync
  timeRangeField: 'create_time' | 'update_time' = 'create_time' // Optional: time range field
) {
  const now = Math.floor(Date.now() / 1000);
  
  // If daysBack > 15, chunk into multiple 15-day requests
  if (daysBack > MAX_DAYS_PER_REQUEST && !cursor) {
    console.log(`[order-sync] daysBack (${daysBack}) exceeds ${MAX_DAYS_PER_REQUEST}-day limit, using chunking`);
    
    let totalSynced = 0;
    let currentDaysBack = daysBack;
    
    // Process in 15-day chunks from oldest to newest
    while (currentDaysBack > 0) {
      const chunkDays = Math.min(currentDaysBack, MAX_DAYS_PER_REQUEST);
      const timeFrom = now - (currentDaysBack * 24 * 60 * 60);
      const timeTo = now - ((currentDaysBack - chunkDays) * 24 * 60 * 60);
      
      console.log(`[order-sync] Processing chunk: ${chunkDays} days (${new Date(timeFrom * 1000).toISOString()} to ${new Date(timeTo * 1000).toISOString()})`);
      
      const result = await syncShopeeOrdersIncremental(
        shopId, timeFrom, timeTo, "", orderStatus, timeRangeField
      );
      
      totalSynced += result.syncedCount;
      currentDaysBack -= chunkDays;
      
      // Delay between chunks to avoid rate limit
      if (currentDaysBack > 0) {
        await sleep(1000);
      }
    }
    
    console.log(`[order-sync] Chunking completed: ${totalSynced} total orders synced`);
    return { success: true, syncedCount: totalSynced, has_more: false, next_cursor: "" };
  }
  
  // Normal sync for <= 15 days or with cursor (pagination)
  const timeFrom = now - daysBack * 24 * 60 * 60;
  const timeTo = now;

  return await syncShopeeOrdersIncremental(shopId, timeFrom, timeTo, cursor, orderStatus, timeRangeField);
}

/**
 * Sync Shopee orders using time range (for incremental sync)
 * This is the core sync function used by both manual and background sync
 */
export async function syncShopeeOrdersIncremental(
  shopId: number,
  timeFrom: number,  // Unix timestamp
  timeTo: number,    // Unix timestamp
  cursor: string = "",
  orderStatus?: string,
  timeRangeField: 'create_time' | 'update_time' = 'create_time' // Optional: time range field
) {

  let totalSynced = 0;

  console.log(`[order-sync] Fetching orders:`, {
    shopId,
    timeFrom: new Date(timeFrom * 1000).toISOString(),
    timeTo: new Date(timeTo * 1000).toISOString(),
    timeRangeField,
    orderStatus: orderStatus || 'ALL',
    cursor: cursor || 'initial'
  });

  let listRes: any;
  // Retry saat kena rate limit (error_too_frequent / 429)
  for (let attempt = 0; attempt < 3; attempt++) {
    listRes = await getShopeeOrderList(shopId, timeFrom, timeTo, cursor, orderStatus, timeRangeField);
    if (listRes?.error === "error_too_frequent") {
      console.warn(`[order-sync] Rate limited on list fetch, retrying in 2s... (attempt ${attempt + 1})`);
      await sleep(2000);
      continue;
    }
    break;
  }

  if (listRes.error) {
    // Handle specific Shopee API errors
    if (listRes.error === "order.order_list_invalid_time") {
      console.error(`[order-sync] Time range error:`, listRes.message);
      throw new Error(`Time range invalid: ${listRes.message}. Shopee API allows maximum 15 days per request.`);
    }
    
    if (listRes.error === "error_too_frequent") {
      console.error(`[order-sync] Rate limit error`);
      throw new Error(`Rate limit exceeded. Please wait a moment and try again.`);
    }
    
    if (listRes.error.includes("auth") || listRes.error.includes("token")) {
      console.error(`[order-sync] Authentication error:`, listRes.error);
      throw new Error(`Authentication failed. Please reconnect your Shopee account.`);
    }
    
    // Generic error
    console.error(`[order-sync] API error:`, listRes.error, listRes.message);
    throw new Error(`Gagal menarik order list: ${listRes.message || listRes.error}`);
  }

  const orderList = listRes.response?.order_list || [];
  const next_cursor = listRes.response?.next_cursor || "";
  const has_more = listRes.response?.more || false;

  console.log(`[order-sync] Fetched ${orderList.length} orders from Shopee API`);

  if (orderList.length > 0) {
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
        // Extract shipping carrier from order level OR first package
        const shippingCarrier = order.shipping_carrier 
          || order.package_list?.[0]?.shipping_carrier 
          || null;

        // Get existing order to preserve tracking number if Shopee doesn't have it yet
        const existing = await db.select().from(shopeeOrders).where(eq(shopeeOrders.orderSn, order.order_sn)).limit(1);

        // Preserve existing tracking number (from shipment process)
        // Tracking numbers are set during shipment (ship_order API) and can be
        // fetched separately via the /orders/:orderSn/tracking-number endpoint.
        // We no longer fetch tracking numbers during sync to avoid N+1 API calls.
        const trackingNumber = existing.length > 0 ? existing[0].trackingNumber : null;

        // Determine final order status from Shopee API response.
        // Trust Shopee's order_status as the source of truth.
        // Only use pickup_done_time as an upgrade hint for READY_TO_SHIP → SHIPPED
        // (don't override COMPLETED, TO_RETURN, etc.)
        let finalOrderStatus = order.order_status;
        if (order.pickup_done_time && order.pickup_done_time > 0) {
          if (finalOrderStatus === 'READY_TO_SHIP') {
            // Order was picked up but API still reports READY_TO_SHIP — upgrade to SHIPPED
            finalOrderStatus = 'SHIPPED';
            console.log(`[order-sync] Order ${order.order_sn}: pickup_done_time detected, upgrading READY_TO_SHIP → SHIPPED`);
          }
        }

        const orderPayload = {
          shopId,
          orderSn: order.order_sn,
          orderStatus: finalOrderStatus,
          totalAmount: order.total_amount ? Math.round(order.total_amount) : 0,
          buyerUsername: order.buyer_username || "",
          shippingCarrier,
          trackingNumber,
          payTime: order.pay_time ? new Date(order.pay_time * 1000) : null,
          createTime: new Date(order.create_time * 1000),
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          const oldStatus = existing[0].orderStatus;
          const newStatus = finalOrderStatus;
          
          // CRITICAL: Status downgrade prevention
          const oldPriority = STATUS_PRIORITY[oldStatus] ?? 0;
          const newPriority = STATUS_PRIORITY[newStatus] ?? 0;
          
          if (newPriority < oldPriority) {
            console.log(`[order-sync] ⚠️ Preventing status downgrade: ${order.order_sn} ${oldStatus} → ${newStatus}`);
            orderPayload.orderStatus = oldStatus;
          } else if (oldStatus !== newStatus) {
            console.log(`[order-sync] ✅ Status change: ${order.order_sn} ${oldStatus} → ${newStatus}`);
          }
          
          // Always update existing orders (including CANCELLED status updates)
          await db.update(shopeeOrders).set(orderPayload).where(eq(shopeeOrders.orderSn, order.order_sn));
        } else {
          // Insert all new orders (including UNPAID and CANCELLED) to match Shopee
          await db.insert(shopeeOrders).values(orderPayload);
        }

        // Upsert order items race-safely. Old approach was DELETE-then-INSERT
        // which is non-atomic: between DELETE and INSERT, escrow-sync.heal can
        // observe an empty `shopee_order_items` for this order_sn and start
        // inserting its own items, causing duplicates after order-sync's
        // INSERT runs. Now we use INSERT ... ON DUPLICATE KEY UPDATE which
        // depends on the UNIQUE(order_sn, item_id, model_id) constraint to
        // prevent duplicates at the DB level.
        //
        // Edge case: if Shopee removed an item from the order (rare), it will
        // remain stale in DB. We accept that trade-off because the consequence
        // (one stale orphan row) is far less harmful than the duplicate-row
        // bug, and Shopee almost never removes items from existing orders.
        // Fallback: if top-level item_list is empty, extract from package_list[].item_list
        let itemList: any[] = order.item_list || [];
        if (itemList.length === 0 && order.package_list?.length > 0) {
          for (const pkg of order.package_list) {
            const pkgItems = pkg?.item_list || [];
            for (const pkgItem of pkgItems) {
              itemList.push(pkgItem);
            }
          }
        }
        if (itemList.length > 0) {
          for (const item of itemList) {
            const itemPayload = {
              orderSn: order.order_sn,
              itemId: item.item_id ? String(item.item_id) : null,
              modelId: item.model_id ? String(item.model_id) : null,
              itemName: item.item_name || "—",
              modelName: item.model_name || null,
              modelSku: item.model_sku || null,
              qty: item.model_quantity_purchased || item.quantity_purchased || 1,
              itemPrice: item.model_discounted_price
                ? Math.round(item.model_discounted_price)
                : Math.round(item.model_original_price || 0),
            };
            await db
              .insert(shopeeOrderItems)
              .values(itemPayload)
              .onDuplicateKeyUpdate({
                set: {
                  itemName: itemPayload.itemName,
                  modelName: itemPayload.modelName,
                  modelSku: itemPayload.modelSku,
                  qty: itemPayload.qty,
                  itemPrice: itemPayload.itemPrice,
                },
              });
          }
        }

        totalSynced++;
      }
    }
  }

  console.log(`[order-sync] Sync completed: ${totalSynced} orders synced`);

  return { success: true, syncedCount: totalSynced, has_more, next_cursor };
}
