import { Elysia, t } from "elysia";
import { db } from "../../db/client";
import { shopeeOrders, shopeeOrderItems, shopeeCredentials } from "../../db/schema";
import { syncShopeeOrdersService } from "../../services/order.service";
import { shipSingleOrder, shipBatchOrders, fetchAndUpdateTrackingNumber } from "../../services/shipment.service";
import { getConnectedShopIdSet } from "../../services/active-shops";
import { authMiddleware } from "../auth/auth.middleware";
import { isOrderOwnedByCompany, filterOrderSnsOwnedByCompany } from "./order-ownership";
import { and, desc, eq, inArray } from "drizzle-orm";

// Order SN validation regex (alphanumeric, max 100 chars)
const ORDER_SN_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

// Maximum batch size for shipment processing
// Backend auto-splits into batches of 50 (Shopee API limit)
// 500 orders = 10 batches × 50 orders = ~3-5 seconds total
const MAX_BATCH_SIZE = 500;

/**
 * Validate order SN format
 */
function validateOrderSn(orderSn: string): boolean {
  return ORDER_SN_REGEX.test(orderSn);
}

/**
 * Determine HTTP status code based on error message
 */
function getErrorStatusCode(error: string): number {
  if (error.includes('tidak ditemukan')) return 404;
  if (error.includes('Autentikasi gagal') || error.includes('kredensial')) return 401;
  if (error.includes('Terlalu banyak permintaan')) return 429;
  if (error.includes('tidak dapat diproses')) return 422;
  return 500;
}

export const orderRoutes = new Elysia({ prefix: "/orders" })
  .use(authMiddleware)
  // Get order list from local DB with items
  // Optimized: 2 queries instead of N+1, items only for active orders
  .get("/", async ({ user }) => {
    // Only show orders from connected shops (soft-disconnect hides the rest).
    const connectedShopIds = await getConnectedShopIdSet();

    // Query 1: Get this company's orders, then drop any from disconnected shops.
    const allRecords = await db.select().from(shopeeOrders)
      .where(eq(shopeeOrders.companyId, user.companyId))
      .orderBy(desc(shopeeOrders.createTime));
    const records = allRecords.filter(o => connectedShopIds.has(o.shopId));

    // Query 2: Get items for active/visible orders (READY_TO_SHIP, PROCESSED, SHIPPED, TO_CONFIRM_RECEIVE)
    // COMPLETED orders don't need items in the order list (too many, and already finished)
    const activeOrderSns = records
      .filter(o => ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE'].includes(o.orderStatus))
      .map(o => o.orderSn);

    let itemsByOrder = new Map<string, typeof activeItems>();
    let activeItems: (typeof shopeeOrderItems.$inferSelect)[] = [];

    if (activeOrderSns.length > 0) {
      activeItems = await db.select().from(shopeeOrderItems)
        .where(inArray(shopeeOrderItems.orderSn, activeOrderSns));

      for (const item of activeItems) {
        if (!itemsByOrder.has(item.orderSn)) {
          itemsByOrder.set(item.orderSn, []);
        }
        itemsByOrder.get(item.orderSn)!.push(item);
      }
    }

    // Attach items to orders (only active ones have items)
    const result = records.map(order => ({
      ...order,
      items: itemsByOrder.get(order.orderSn) || [],
    }));

    return { success: true, data: result };
  })

  // Sync orders from Shopee (Last 15 days)
  // Supports filtering by order_status for faster sync (e.g., "READY_TO_SHIP,PROCESSED,UNPAID")
  // CRITICAL FIX: Uses update_time for manual sync to catch status changes on old orders
  .post("/sync", async ({ body, user }) => {
    const { shop_id, days_back, cursor, shop_index = 0, order_status, time_range_field } = body as { 
      shop_id?: number, 
      days_back?: number, 
      cursor?: string, 
      shop_index?: number,
      order_status?: string, // Filter: "READY_TO_SHIP,PROCESSED,UNPAID" for active orders only
      time_range_field?: 'create_time' | 'update_time' // Optional: override time range field
    };
    
    let shopsToSync = [];
    if (shop_id) {
      // Verifikasi toko milik company pemanggil sebelum sync (cegah lintas-company).
      shopsToSync = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials)
        .where(and(
          eq(shopeeCredentials.companyId, user.companyId),
          eq(shopeeCredentials.shopId, shop_id),
        ));
    } else {
      shopsToSync = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials)
        .where(and(
          eq(shopeeCredentials.companyId, user.companyId),
          eq(shopeeCredentials.status, "connected"),
        ));
    }

    if (shopsToSync.length === 0) {
      throw new Error("Tidak ada toko yang terhubung untuk menarik pesanan.");
    }

    if (shop_index >= shopsToSync.length) {
      return { success: true, data: { fetched: 0, has_more: false, next_cursor: "", shop_index: 0 } };
    }

    try {
      const shopToSync = shopsToSync[shop_index];
      if (!shopToSync) {
        throw new Error("Shop not found at index");
      }
      const currentShopId = shopToSync.shopId;
      
      // CRITICAL FIX: Use update_time for manual sync to catch status changes
      // When orders change status (READY_TO_SHIP → SHIPPED), their update_time changes
      // Using update_time ensures we catch orders that were recently updated/shipped
      // This is essential for syncing orders that were shipped yesterday
      // OVERRIDE: Allow user to specify time_range_field (create_time or update_time)
      const effectiveTimeRangeField = time_range_field || 'update_time';
      
      // CRITICAL FIX: Shopee API limit is 15 days per request
      // If days_back > 15, automatic chunking will handle it
      // Default to 60 days to catch all recent status changes
      // NOTE: We don't filter out CANCELLED here because we need to update existing orders
      // The service layer will skip inserting NEW cancelled orders but will update existing ones
      const effectiveOrderStatus = order_status;
      
      const result = await syncShopeeOrdersService(
        currentShopId, 
        days_back || 60,  // ✅ Default 60 days to catch all recent status changes
        cursor || "", 
        effectiveOrderStatus,  // ✅ No default filter - let service handle CANCELLED logic
        effectiveTimeRangeField  // Use update_time by default, or user-specified field
      );
      
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
      order_status: t.Optional(t.String()), // NEW: Filter by order status
      time_range_field: t.Optional(t.Union([t.Literal('create_time'), t.Literal('update_time')])), // NEW: Override time range field
    }))
  })

  // Ship single order
  .post("/ship/:orderSn", async ({ params, body, set, user }) => {
    const { orderSn } = params;
    const { shipment_method } = body as { shipment_method: 'pickup' | 'dropoff' };

    // Validate order SN format
    if (!validateOrderSn(orderSn)) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid order_sn format. Must be alphanumeric with max 100 characters."
      };
    }

    // Validate shipment method
    if (!shipment_method || (shipment_method !== 'pickup' && shipment_method !== 'dropoff')) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid or missing shipment_method. Must be either 'pickup' or 'dropoff'."
      };
    }

    try {
      if (!(await isOrderOwnedByCompany(orderSn, user.companyId))) {
        set.status = 404;
        return { success: false, message: "Order tidak ditemukan" };
      }
      const result = await shipSingleOrder(orderSn, shipment_method);

      if (result.success) {
        return {
          success: true,
          message: result.message,
          trackingNumber: result.trackingNumber,
          data: {
            orderSn: result.orderSn,
            newStatus: "PROCESSED",
            shipmentMethod: shipment_method,
            trackingNumber: result.trackingNumber || null
          }
        };
      } else {
        set.status = getErrorStatusCode(result.error || '');
        return {
          success: false,
          message: result.error
        };
      }
    } catch (error: any) {
      console.error('[order-routes] Ship single order error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shipmentMethod: shipment_method,
        error: error.message,
        stack: error.stack
      });

      set.status = 500;
      return {
        success: false,
        message: "Internal server error occurred while processing shipment."
      };
    }
  }, {
    body: t.Object({
      shipment_method: t.Union([t.Literal('pickup'), t.Literal('dropoff')], {
        description: "Shipment method: 'pickup' (courier picks up) or 'dropoff' (seller drops off)"
      })
    })
  })

  // Ship multiple orders in batch
  .post("/ship/batch", async ({ body, set, user }) => {
    const { order_sns, shipment_method } = body as { order_sns: string[]; shipment_method: 'pickup' | 'dropoff' };

    // Validate request body
    if (!Array.isArray(order_sns)) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid request body. 'order_sns' must be an array."
      };
    }

    if (order_sns.length === 0) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid request body. 'order_sns' array cannot be empty."
      };
    }

    if (order_sns.length > MAX_BATCH_SIZE) {
      set.status = 400;
      return {
        success: false,
        message: `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} orders.`
      };
    }

    // Validate shipment method
    if (!shipment_method || (shipment_method !== 'pickup' && shipment_method !== 'dropoff')) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid or missing shipment_method. Must be either 'pickup' or 'dropoff'."
      };
    }

    // Validate each order SN format
    for (const orderSn of order_sns) {
      if (typeof orderSn !== 'string' || !validateOrderSn(orderSn)) {
        set.status = 400;
        return {
          success: false,
          message: `Invalid order_sn format: ${orderSn}. Must be alphanumeric with max 100 characters.`
        };
      }
    }

    try {
      const ownedSet = await filterOrderSnsOwnedByCompany(order_sns, user.companyId);
      if (ownedSet.size !== new Set(order_sns).size) {
        set.status = 404;
        return { success: false, message: "Order tidak ditemukan" };
      }
      const results = await shipBatchOrders(order_sns, shipment_method);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        success: true,
        message: `Batch processing completed: ${successful} successful, ${failed} failed`,
        data: {
          total: results.length,
          successful,
          failed,
          shipmentMethod: shipment_method,
          results
        }
      };
    } catch (error: any) {
      console.error('[order-routes] Ship batch orders error:', {
        timestamp: new Date().toISOString(),
        orderCount: order_sns.length,
        shipmentMethod: shipment_method,
        error: error.message,
        stack: error.stack
      });

      set.status = 500;
      return {
        success: false,
        message: "Internal server error occurred while processing batch shipment."
      };
    }
  }, {
    body: t.Object({
      order_sns: t.Array(t.String(), { 
        minItems: 1, 
        maxItems: MAX_BATCH_SIZE,
        description: "Array of order serial numbers to ship"
      }),
      shipment_method: t.Union([t.Literal('pickup'), t.Literal('dropoff')], {
        description: "Shipment method: 'pickup' (courier picks up) or 'dropoff' (seller drops off)"
      })
    })
  })

  // Fetch tracking number for PROCESSED order
  .get("/:orderSn/tracking-number", async ({ params, set, user }) => {
    const { orderSn } = params;

    // Validate order SN format
    if (!validateOrderSn(orderSn)) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid order_sn format. Must be alphanumeric with max 100 characters."
      };
    }

    try {
      if (!(await isOrderOwnedByCompany(orderSn, user.companyId))) {
        set.status = 404;
        return { success: false, message: "Order tidak ditemukan" };
      }
      const trackingNumber = await fetchAndUpdateTrackingNumber(orderSn);

      if (trackingNumber) {
        return {
          success: true,
          data: {
            orderSn,
            trackingNumber
          }
        };
      } else {
        set.status = 404;
        return {
          success: false,
          message: "Tracking number not available yet. Please try again later."
        };
      }
    } catch (error: any) {
      console.error('[order-routes] Fetch tracking number error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        error: error.message,
        stack: error.stack
      });

      set.status = 500;
      return {
        success: false,
        message: "Internal server error occurred while fetching tracking number."
      };
    }
  })

  // Mark order label as printed / not printed
  .patch("/:orderSn/label-printed", async ({ params, body, set, user }) => {
    const { orderSn } = params;
    const { printed } = body as { printed: boolean };

    // Validate order SN format
    if (!validateOrderSn(orderSn)) {
      set.status = 400;
      return {
        success: false,
        message: "Invalid order_sn format."
      };
    }

    try {
      // Update label_printed status
      const updateData: any = {
        labelPrinted: printed ? 1 : 0,
      };
      if (printed) {
        updateData.labelPrintedAt = new Date();
      }

      await db.update(shopeeOrders)
        .set(updateData)
        .where(and(eq(shopeeOrders.orderSn, orderSn), eq(shopeeOrders.companyId, user.companyId)));

      return {
        success: true,
        message: `Label pesanan ${orderSn} ditandai sebagai ${printed ? 'sudah dicetak' : 'belum dicetak'}.`,
        data: { orderSn, labelPrinted: printed }
      };
    } catch (error: any) {
      console.error('[order-routes] Mark label printed error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        printed,
        error: error.message,
      });

      set.status = 500;
      return {
        success: false,
        message: "Gagal mengupdate status cetak label."
      };
    }
  }, {
    body: t.Object({
      printed: t.Boolean({ description: "true = sudah dicetak, false = belum dicetak" })
    })
  })

  // Mark batch orders label as printed
  .patch("/batch/label-printed", async ({ body, set, user }) => {
    const { order_sns, printed } = body as { order_sns: string[]; printed: boolean };

    if (!Array.isArray(order_sns) || order_sns.length === 0) {
      set.status = 400;
      return { success: false, message: "order_sns harus berupa array yang tidak kosong." };
    }

    try {
      const updateData: any = {
        labelPrinted: printed ? 1 : 0,
      };
      if (printed) {
        updateData.labelPrintedAt = new Date();
      }

      for (const orderSn of order_sns) {
        await db.update(shopeeOrders)
          .set(updateData)
          .where(and(eq(shopeeOrders.orderSn, orderSn), eq(shopeeOrders.companyId, user.companyId)));
      }

      return {
        success: true,
        message: `${order_sns.length} pesanan ditandai sebagai ${printed ? 'sudah dicetak' : 'belum dicetak'}.`,
        data: { count: order_sns.length, labelPrinted: printed }
      };
    } catch (error: any) {
      console.error('[order-routes] Batch mark label printed error:', error.message);
      set.status = 500;
      return { success: false, message: "Gagal mengupdate status cetak label batch." };
    }
  }, {
    body: t.Object({
      order_sns: t.Array(t.String()),
      printed: t.Boolean()
    })
  });

