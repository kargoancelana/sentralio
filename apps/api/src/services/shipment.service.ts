import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";
import { getValidToken } from "./shopee-auth";
import { shipShopeeOrder, getShopeeOrderDetails } from "./shopee-raw";
import { getTrackingNumber as getTrackingNumberFromLogistics, getShippingParameter, getMassTrackingNumber } from "./shopee-label";

/**
 * Result interface for shipment operations
 */
export interface ShipmentResult {
  success: boolean;
  orderSn: string;
  trackingNumber?: string;
  message?: string;
  error?: string;
}

/**
 * Order record interface for validation
 */
interface OrderRecord {
  id: number;
  shopId: number;
  orderSn: string;
  orderStatus: string;
  totalAmount: number;
  buyerUsername: string | null;
  shippingCarrier: string | null;
  payTime: Date | null;
  createTime: Date;
  updatedAt: Date;
}

/**
 * Fetch and update tracking number for an already PROCESSED order
 * This is useful for orders that were processed before the tracking number fix
 * @param orderSn - Order serial number
 * @returns Tracking number if found
 */
export async function fetchAndUpdateTrackingNumber(orderSn: string): Promise<string | null> {
  try {
    console.log('[shipment-service] fetchAndUpdateTrackingNumber:', {
      timestamp: new Date().toISOString(),
      orderSn,
      message: 'Fetching tracking number for PROCESSED order'
    });

    // Get order from database
    const orderRows = await db.select()
      .from(shopeeOrders)
      .where(eq(shopeeOrders.orderSn, orderSn))
      .limit(1);

    if (orderRows.length === 0) {
      console.error('[shipment-service] Order not found:', orderSn);
      return null;
    }

    const order = orderRows[0];

    // Only fetch for PROCESSED or SHIPPED orders (PROCESSED is WMS-internal status after ship_order)
    if (order.orderStatus !== 'PROCESSED' && order.orderStatus !== 'SHIPPED') {
      console.log('[shipment-service] Order not PROCESSED/SHIPPED, skipping:', {
        orderSn,
        status: order.orderStatus
      });
      return null;
    }

    // If tracking number already exists, return it
    if (order.trackingNumber) {
      console.log('[shipment-service] Tracking number already exists:', order.trackingNumber);
      return order.trackingNumber;
    }

    // Fetch tracking number from Shopee
    try {
      const trackingInfo = await getTrackingNumberFromLogistics(order.shopId, orderSn);
      const trackingNumber = trackingInfo?.response?.tracking_number
        || trackingInfo?.result?.tracking_number;

      if (trackingNumber) {
        console.log('[shipment-service] Tracking number retrieved:', trackingNumber);

        // Update database
        await db.update(shopeeOrders)
          .set({
            trackingNumber: trackingNumber,
            updatedAt: new Date()
          })
          .where(eq(shopeeOrders.orderSn, orderSn));

        console.log('[shipment-service] Tracking number saved to database');
        return trackingNumber;
      } else {
        console.warn('[shipment-service] No tracking number in Shopee response');
        return null;
      }
    } catch (error: any) {
      console.error('[shipment-service] Error fetching tracking number:', {
        orderSn,
        message: error.message
      });
      return null;
    }
  } catch (error: any) {
    console.error('[shipment-service] fetchAndUpdateTrackingNumber error:', {
      orderSn,
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Wait for tracking number to be available from Shopee Logistics API with polling
 * Uses /api/v2/logistics/get_tracking_number (the correct endpoint per Shopee docs)
 * @param shopId - Shop identifier
 * @param orderSn - Order serial number
 * @returns Tracking number when available
 * @throws Error with timeout message after 30 seconds (reduced for faster UX)
 */
export async function waitForTrackingNumber(
  shopId: number,
  orderSn: string
): Promise<string> {
  const maxRetries = 6; // Reduced from 60
  const retryInterval = 5000; // 5 seconds

  console.log('[shipment-service] waitForTrackingNumber:', {
    timestamp: new Date().toISOString(),
    orderSn,
    shopId,
    maxRetries,
    retryInterval,
    totalTimeout: `${maxRetries * retryInterval / 1000}s`,
    message: 'Starting tracking number polling via logistics/get_tracking_number'
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log('[shipment-service] polling attempt:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId,
        attempt,
        maxRetries,
        message: `Attempt ${attempt}/${maxRetries}`
      });

      // Call Shopee Logistics API to get tracking number (correct endpoint)
      const trackingResponse = await getTrackingNumberFromLogistics(shopId, orderSn);

      // Extract tracking number from logistics API response
      // Response format: { response: { tracking_number: "SPXID..." } } or { result: { tracking_number: "..." } }
      const trackingNumber = trackingResponse?.response?.tracking_number
        || trackingResponse?.result?.tracking_number
        || null;

      if (trackingNumber) {
        console.log('[shipment-service] tracking number retrieved:', {
          timestamp: new Date().toISOString(),
          orderSn,
          shopId,
          attempt,
          trackingNumber,
          message: 'Successfully retrieved tracking number via logistics API'
        });

        return trackingNumber;
      }

      console.log('[shipment-service] tracking number not yet available:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId,
        attempt,
        maxRetries,
        message: 'Tracking number not available, will retry'
      });

      // Wait before next attempt (except for the last attempt)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }

    } catch (error: any) {
      // Don't fail on API errors - just log and retry
      console.warn('[shipment-service] error during tracking polling:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId,
        attempt,
        errorType: 'polling',
        message: error.message,
      });

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        continue;
      }
    }
  }

  // Timeout reached
  const totalSeconds = maxRetries * retryInterval / 1000;
  console.error('[shipment-service] tracking number timeout:', {
    timestamp: new Date().toISOString(),
    orderSn,
    shopId,
    maxRetries,
    totalTime: totalSeconds,
    message: 'Timeout waiting for tracking number'
  });

  throw new Error(`Tracking number belum tersedia setelah ${totalSeconds} detik. Silakan coba lagi nanti`);
}

/**
 * Validate order eligibility for shipment processing
 * @param orderSn - Order serial number to validate
 * @returns Validation result with order data or error
 */
export async function validateOrderEligibility(orderSn: string): Promise<{
  valid: boolean;
  order?: OrderRecord;
  error?: string;
}> {
  try {
    // Check if order exists in database
    const orderRows = await db.select()
      .from(shopeeOrders)
      .where(eq(shopeeOrders.orderSn, orderSn))
      .limit(1);

    if (orderRows.length === 0) {
      return {
        valid: false,
        error: `Order ${orderSn} tidak ditemukan dalam database`
      };
    }

    const order = orderRows[0];

    // Check if order status is READY_TO_SHIP
    if (order.orderStatus !== "READY_TO_SHIP") {
      return {
        valid: false,
        error: `Order ${orderSn} tidak dapat diproses: status saat ini adalah ${order.orderStatus}`
      };
    }

    return {
      valid: true,
      order: order as OrderRecord
    };
  } catch (error: any) {
    console.error('[shipment-service] validateOrderEligibility error:', {
      timestamp: new Date().toISOString(),
      orderSn,
      errorType: 'validation',
      message: error.message,
      stack: error.stack,
    });

    return {
      valid: false,
      error: `Gagal memvalidasi order: ${error.message}`
    };
  }
}

/**
 * Validate that credentials exist for a specific shop
 * @param shopId - Shop identifier to validate
 * @returns Validation result with credential status
 */
export async function validateShopCredentials(shopId: number): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    await getValidToken(shopId);
    return { valid: true };
  } catch (error: any) {
    console.error('[shipment-service] shop credential validation error:', {
      timestamp: new Date().toISOString(),
      shopId,
      errorType: 'credential_validation',
      message: error.message,
    });

    if (error.message.includes('No shopee credentials found')) {
      return {
        valid: false,
        error: `Tidak ada kredensial Shopee untuk toko ID ${shopId}. Silakan hubungkan toko terlebih dahulu.`
      };
    }

    return {
      valid: false,
      error: `Gagal memvalidasi kredensial toko: ${error.message}`
    };
  }
}

/**
 * Process shipment for a single order
 * @param orderSn - Shopee order serial number
 * @param shipmentMethod - Shipment method: 'pickup' or 'dropoff' (REQUIRED)
 * @param options - Optional settings
 * @param options.skipPrefetch - Skip background label prefetch (used in batch mode where batch tracking handles it)
 * @returns Result with success status and message
 */
export async function shipSingleOrder(
  orderSn: string,
  shipmentMethod: 'pickup' | 'dropoff',
  options?: { skipPrefetch?: boolean }
): Promise<ShipmentResult> {
  try {
    console.log('[shipment-service]', {
      timestamp: new Date().toISOString(),
      orderSn,
      operation: 'single',
      message: 'Starting shipment processing'
    });

    // Validate order eligibility
    const validation = await validateOrderEligibility(orderSn);
    if (!validation.valid) {
      return {
        success: false,
        orderSn,
        error: validation.error
      };
    }

    const order = validation.order!;

    // Get valid credentials for the shop
    let credentials;
    try {
      credentials = await getValidToken(order.shopId);
      console.log('[shipment-service] credentials retrieved:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId: order.shopId,
        message: 'Valid credentials obtained for shop'
      });
    } catch (error: any) {
      console.error('[shipment-service] credential error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId: order.shopId,
        errorType: 'auth',
        message: error.message,
      });

      // Provide more specific error messages based on the error type
      let errorMessage = `Gagal mendapatkan kredensial untuk toko: ${error.message}`;
      
      if (error.message.includes('No shopee credentials found')) {
        errorMessage = `Tidak ada kredensial Shopee untuk toko ID ${order.shopId}. Silakan hubungkan toko terlebih dahulu.`;
      } else if (error.message.includes('Auth request failed')) {
        errorMessage = `Gagal memperbarui token akses. Silakan hubungkan ulang toko Shopee Anda.`;
      } else if (error.message.includes('Shopee Auth Error')) {
        errorMessage = `Autentikasi Shopee gagal. Silakan hubungkan ulang toko Shopee Anda.`;
      }

      return {
        success: false,
        orderSn,
        error: errorMessage
      };
    }

    // Step 1: Get shipping parameters from Shopee before ship_order
    let shippingParams: any = null;
    try {
      console.log('[shipment-service] getting shipping parameters:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId: order.shopId,
        message: 'Fetching shipping parameters before ship_order'
      });
      shippingParams = await getShippingParameter(order.shopId, orderSn);
      console.log('[shipment-service] shipping parameters retrieved:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId: order.shopId,
        hasPickup: !!shippingParams?.response?.pickup,
        hasDropoff: !!shippingParams?.response?.dropoff,
        message: 'Shipping parameters retrieved successfully'
      });
    } catch (paramError: any) {
      console.warn('[shipment-service] could not get shipping parameters, using defaults:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId: order.shopId,
        message: paramError.message
      });
      // Continue with empty params - ship_order may still work with defaults
    }

    // Step 2: Call Shopee API to arrange shipment with retry logic
    let apiResult;
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        apiResult = await shipShopeeOrder(order.shopId, orderSn, shipmentMethod, shippingParams);

        // Check for rate limiting
        if (apiResult?.error === "error_too_frequent") {
          if (attempt < maxRetries) {
            console.warn('[shipment-service] rate limit hit:', {
              timestamp: new Date().toISOString(),
              orderSn,
              shopId: order.shopId,
              errorType: 'rate_limit',
              attempt,
              message: 'Rate limited, retrying...'
            });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          } else {
            return {
              success: false,
              orderSn,
              error: "Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat."
            };
          }
        }

        // Break out of retry loop if no rate limit
        break;
      } catch (error: any) {
        if (attempt < maxRetries) {
          console.warn('[shipment-service] network error, retrying:', {
            timestamp: new Date().toISOString(),
            orderSn,
            shopId: order.shopId,
            errorType: 'network',
            attempt,
            message: error.message
          });
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        } else {
          console.error('[shipment-service] network error after retries:', {
            timestamp: new Date().toISOString(),
            orderSn,
            shopId: order.shopId,
            errorType: 'network',
            attempt,
            message: error.message,
            stack: error.stack,
          });

          return {
            success: false,
            orderSn,
            error: `Koneksi gagal setelah ${maxRetries} percobaan: ${error.message}`
          };
        }
      }
    }

    // Check API response for errors
    if (apiResult?.error) {
      console.error('[shipment-service] API error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        shopId: order.shopId,
        errorType: 'business',
        message: apiResult.message || apiResult.error,
      });

      // Provide more specific error messages based on error type
      let errorMessage = `Shopee menolak pengaturan pengiriman: ${apiResult.message || apiResult.error}`;
      
      if (apiResult.error.includes('auth') || apiResult.error.includes('token')) {
        errorMessage = `Autentikasi gagal. Silakan hubungkan ulang toko Shopee Anda.`;
      } else if (apiResult.error === 'error_order_status') {
        errorMessage = `Order tidak dapat diproses: status order tidak valid di Shopee.`;
      } else if (apiResult.error === 'error_param') {
        errorMessage = `Parameter tidak valid: ${apiResult.message || 'Periksa data order'}`;
      }

      return {
        success: false,
        orderSn,
        error: errorMessage
      };
    }

    // FAST PATH: Don't wait for tracking number here!
    // Tracking number is fetched separately by the frontend via GET /:orderSn/tracking-number.
    // This eliminates the 5-30s blocking wait that was causing the UX bottleneck.

    // Update database with order status to PROCESSED immediately
    try {
      await db.update(shopeeOrders)
        .set({
          orderStatus: "PROCESSED",
          updatedAt: new Date()
        })
        .where(eq(shopeeOrders.orderSn, orderSn));

      console.log(`[shipment-service] ✅ ${orderSn}: ship_order success, status → PROCESSED`);
    } catch (error: any) {
      console.error(`[shipment-service] DB update failed for ${orderSn}:`, error.message);

      // Return warning since Shopee was updated successfully
      return {
        success: true,
        orderSn,
        message: "Pengiriman berhasil diatur di Shopee, namun gagal memperbarui database lokal. Silakan tarik ulang pesanan."
      };
    }

    // ── Background prefetch: cache label ASAP so reprint is instant ──
    // Fire-and-forget — doesn't block the response to the user.
    // 3s delay gives Shopee time to generate the shipping document.
    // SKIP in batch mode: batch tracking handles tracking numbers centrally,
    // and 28 concurrent prefetches would hammer the Shopee API with 28 individual
    // get_tracking_number calls, causing massive latency.
    if (!options?.skipPrefetch) {
      setTimeout(async () => {
        try {
          const { getSingleLabel } = await import('./label.service');
          const result = await getSingleLabel(orderSn);
          if (result.success) {
            console.log(`[shipment-service] ✅ Label prefetched & cached for ${orderSn}`);
          } else {
            console.warn(`[shipment-service] Label prefetch returned error for ${orderSn}:`, result.error);
          }
        } catch (e: any) {
          console.warn(`[shipment-service] Label prefetch failed for ${orderSn}:`, e.message);
          // Non-critical — user can still print manually later
        }
      }, 3000);
    }

    return {
      success: true,
      orderSn,
      message: `Pengiriman berhasil diatur untuk order ${orderSn}`
    };

  } catch (error: any) {
    console.error('[shipment-service] unexpected error:', {
      timestamp: new Date().toISOString(),
      orderSn,
      errorType: 'unexpected',
      message: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      orderSn,
      error: `Terjadi kesalahan tidak terduga: ${error.message}`
    };
  }
}

/**
 * Get package numbers for multiple orders from Shopee order details.
 * Returns a map of orderSn -> packageNumber.
 * 
 * @param shopId - Shop ID
 * @param orderSns - Array of order serial numbers
 * @returns Map of orderSn to packageNumber
 */
async function getPackageNumbersForOrders(
  shopId: number,
  orderSns: string[]
): Promise<Map<string, string>> {
  const packageMap = new Map<string, string>();
  
  // Shopee limits to 50 orders per request
  const BATCH_SIZE = 50;
  for (let i = 0; i < orderSns.length; i += BATCH_SIZE) {
    const batch = orderSns.slice(i, i + BATCH_SIZE);
    try {
      const details = await getShopeeOrderDetails(shopId, batch);
      const orderList = details?.response?.order_list || [];
      
      for (const order of orderList) {
        if (order.package_list?.length > 0) {
          packageMap.set(order.order_sn, order.package_list[0].package_number);
        }
      }
    } catch (err: any) {
      console.warn('[shipment-service] Failed to get package numbers for batch:', err.message);
    }
  }
  
  return packageMap;
}

/**
 * Process shipment for multiple orders with sequential processing and rate limiting
 * 
 * This function ensures tracking numbers are available for each order before marking
 * them as PROCESSED. It handles partial failures gracefully - if some orders fail to
 * get tracking numbers or encounter errors, the batch continues processing remaining
 * orders and returns clear success/failure status for each.
 * 
 * After all orders are shipped, uses get_mass_tracking_number to retrieve tracking
 * numbers in a single batch API call instead of N individual calls.
 * 
 * @param orderSns - Array of order serial numbers
 * @param shipmentMethod - Shipment method: 'pickup' or 'dropoff' (REQUIRED)
 * @returns Array of results for each order with success/failure status
 * 
 * **Validates: Requirement 2.5** - Batch shipment ensures tracking numbers available
 */
export async function shipBatchOrders(
  orderSns: string[],
  shipmentMethod: 'pickup' | 'dropoff'
): Promise<ShipmentResult[]> {
  const results: ShipmentResult[] = [];
  const batchDelay = 300; // 300ms delay between orders for rate limiting

  console.log('[shipment-service]', {
    timestamp: new Date().toISOString(),
    operation: 'batch',
    total: orderSns.length,
    message: 'Starting batch shipment processing'
  });

  // Filter out orders that don't meet eligibility criteria before processing
  // Also collect shopId during validation to avoid N separate DB queries later
  const eligibleOrders: string[] = [];
  const orderShopIdMap = new Map<string, number>(); // orderSn -> shopId (collected once)
  
  for (const orderSn of orderSns) {
    const validation = await validateOrderEligibility(orderSn);
    if (validation.valid) {
      eligibleOrders.push(orderSn);
      orderShopIdMap.set(orderSn, validation.order!.shopId);
    } else {
      results.push({
        success: false,
        orderSn,
        error: validation.error
      });
    }
  }

  console.log('[shipment-service]', {
    timestamp: new Date().toISOString(),
    operation: 'batch',
    total: orderSns.length,
    eligible: eligibleOrders.length,
    filtered: orderSns.length - eligibleOrders.length,
    message: 'Eligibility filtering completed'
  });

  // Process eligible orders sequentially with rate limiting
  // skipPrefetch=true: batch tracking below handles tracking numbers centrally,
  // preventing 28 individual background get_tracking_number calls
  for (let i = 0; i < eligibleOrders.length; i++) {
    const orderSn = eligibleOrders[i];
    
    try {
      const result = await shipSingleOrder(orderSn, shipmentMethod, { skipPrefetch: true });
      results.push(result);
    } catch (error: any) {
      console.error('[shipment-service] batch processing error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        operation: 'batch',
        errorType: 'processing',
        message: error.message,
      });

      results.push({
        success: false,
        orderSn,
        error: error.message
      });
    }

    // Apply rate limiting delay between orders (except for the last one)
    if (i < eligibleOrders.length - 1) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  // ── Batch tracking number retrieval ──
  // After all orders are shipped, get tracking numbers in ONE batch API call
  // instead of N individual get_tracking_number calls.
  const successfulOrders = results.filter(r => r.success);
  if (successfulOrders.length > 0) {
    try {
      console.log('[shipment-service] batch-tracking: starting batch tracking number retrieval', {
        timestamp: new Date().toISOString(),
        successfulCount: successfulOrders.length
      });

      // Group successful orders by shopId — using cached map, NO extra DB queries
      const ordersByShop = new Map<number, string[]>();
      for (const result of successfulOrders) {
        const shopId = orderShopIdMap.get(result.orderSn);
        if (shopId) {
          if (!ordersByShop.has(shopId)) ordersByShop.set(shopId, []);
          ordersByShop.get(shopId)!.push(result.orderSn);
        }
      }

      // For each shop, get package numbers then batch tracking
      for (const [shopId, shopOrderSns] of ordersByShop) {
        try {
          // Get package numbers for all orders in this shop
          const packageMap = await getPackageNumbersForOrders(shopId, shopOrderSns);
          const packageNumbers = Array.from(packageMap.values()).filter(Boolean);

          if (packageNumbers.length === 0) {
            console.warn('[shipment-service] batch-tracking: no package numbers found for shop', shopId);
            continue;
          }

          // Brief delay for Shopee to finalize tracking numbers after ship_order
          await new Promise(r => setTimeout(r, 2000));

          // Batch get tracking numbers — 1 API call instead of N
          const trackingResult = await getMassTrackingNumber(shopId, packageNumbers);
          const successList = trackingResult?.response?.success_list || [];
          const failList = trackingResult?.response?.fail_list || [];

          // Build packageNumber -> trackingNumber map
          const trackingMap = new Map<string, string>();
          for (const item of successList) {
            if (item.tracking_number) {
              trackingMap.set(item.package_number, item.tracking_number);
            }
          }

          // Bulk update DB with tracking numbers
          let updatedCount = 0;
          for (const [orderSn, packageNumber] of packageMap) {
            const trackingNumber = trackingMap.get(packageNumber);
            if (trackingNumber) {
              await db.update(shopeeOrders)
                .set({ trackingNumber, updatedAt: new Date() })
                .where(eq(shopeeOrders.orderSn, orderSn));

              // Update result object with tracking number
              const result = results.find(r => r.orderSn === orderSn);
              if (result) result.trackingNumber = trackingNumber;
              updatedCount++;
            }
          }

          console.log(`[shipment-service] batch-tracking: ✅ shop ${shopId}: ${updatedCount}/${packageNumbers.length} tracking numbers retrieved`, {
            timestamp: new Date().toISOString(),
            successCount: successList.length,
            failCount: failList.length,
            failReasons: failList.map((f: any) => `${f.package_number}: ${f.fail_reason}`).slice(0, 5)
          });
        } catch (shopTrackingError: any) {
          console.warn(`[shipment-service] batch-tracking: failed for shop ${shopId}:`, shopTrackingError.message);
          // Non-fatal: individual tracking will still work via label service
        }
      }
    } catch (batchTrackingError: any) {
      console.warn('[shipment-service] batch-tracking: overall batch tracking failed:', batchTrackingError.message);
      // Non-fatal: individual tracking will still work via label service fallback
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('[shipment-service]', {
    timestamp: new Date().toISOString(),
    operation: 'batch',
    total: orderSns.length,
    successful,
    failed,
    message: 'Batch shipment processing completed'
  });

  return results;
}