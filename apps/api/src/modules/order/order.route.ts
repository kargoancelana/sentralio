import { Elysia, t } from "elysia";
import { db } from "../../db/client";
import { shopeeOrders, shopeeOrderItems, shopeeCredentials } from "../../db/schema";
import { syncShopeeOrdersService } from "../../services/order.service";
import { shipSingleOrder, shipBatchOrders, fetchAndUpdateTrackingNumber } from "../../services/shipment.service";
import { desc, eq } from "drizzle-orm";

// Order SN validation regex (alphanumeric, max 100 chars)
const ORDER_SN_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

// Maximum batch size for shipment processing
const MAX_BATCH_SIZE = 50;

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
  // Supports filtering by order_status for faster sync (e.g., "READY_TO_SHIP,PROCESSED,UNPAID")
  // CRITICAL FIX: Uses update_time for manual sync to catch status changes on old orders
  .post("/sync", async ({ body }) => {
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
      
      // CRITICAL FIX: Use update_time for manual sync to catch status changes
      // When orders change status (READY_TO_SHIP → SHIPPED), their update_time changes
      // Using update_time ensures we catch orders that were recently updated/shipped
      // This is essential for syncing orders that were shipped yesterday
      // OVERRIDE: Allow user to specify time_range_field (create_time or update_time)
      const effectiveTimeRangeField = time_range_field || 'update_time';
      
      // CRITICAL FIX: Shopee API limit is 15 days per request
      // If days_back > 15, automatic chunking will handle it
      // Default to 60 days to catch all recent status changes
      const result = await syncShopeeOrdersService(
        currentShopId, 
        days_back || 60,  // ✅ Default 60 days to catch all recent status changes
        cursor || "", 
        order_status,
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
  .post("/ship/:orderSn", async ({ params, body, set }) => {
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
  .post("/ship/batch", async ({ body, set }) => {
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
  .get("/:orderSn/tracking-number", async ({ params, set }) => {
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
  });
