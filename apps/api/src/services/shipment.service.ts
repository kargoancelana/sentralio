import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";
import { getValidToken } from "./shopee-auth";
import { shipShopeeOrder, getShopeeOrderDetails, getShipmentList, searchPackageList } from "./shopee-raw";
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
  trackingNumber: string | null;
  packageNumber: string | null;
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
  const maxRetries = 3; // Reduced from 6 for faster UX (6s total)
  const retryInterval = 2000; // 2 seconds (reduced from 5s)
  const startTime = Date.now();

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
        const elapsed = Date.now() - startTime;
        console.log(`[shipment-service] ✅ Tracking number ${orderSn}: ${trackingNumber} (${elapsed}ms, attempt ${attempt})`);

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
  const elapsed = Date.now() - startTime;
  console.error(`[shipment-service] ❌ Tracking number ${orderSn}: TIMEOUT after ${elapsed}ms (${maxRetries} attempts)`);
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
        order: order as OrderRecord,
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
      console.log(`[shipment-service] 🔄 Updating database for ${orderSn}...`);
      console.log(`[shipment-service]    Before: orderStatus will be set to PROCESSED`);
      
      const updateResult = await db.update(shopeeOrders)
        .set({
          orderStatus: "PROCESSED",
          updatedAt: new Date()
        })
        .where(eq(shopeeOrders.orderSn, orderSn));

      console.log(`[shipment-service] ✅ ${orderSn}: ship_order success, status → PROCESSED`);
      console.log(`[shipment-service]    Update result:`, updateResult);
      
      // Verify the update
      const verifyOrder = await db.select()
        .from(shopeeOrders)
        .where(eq(shopeeOrders.orderSn, orderSn))
        .limit(1);
      
      if (verifyOrder.length > 0) {
        console.log(`[shipment-service] ✅ Verification: orderStatus = ${verifyOrder[0].orderStatus}`);
      } else {
        console.error(`[shipment-service] ❌ Verification failed: Order not found after update!`);
      }
    } catch (error: any) {
      console.error(`[shipment-service] DB update failed for ${orderSn}:`, error.message);
      console.error(`[shipment-service] Error stack:`, error.stack);

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
 * Batch group interface for grouping orders by logistics configuration
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
export interface BatchGroup {
  shopId: number;
  logisticsChannelId: number;
  productLocationId: string;
  orders: Array<{
    orderSn: string;
    packageNumber: string;
  }>;
}

/**
 * Get package numbers and logistics information for multiple orders using searchPackageList.
 * Calls searchPackageList in batches of 50 orders to get package_number, logistics_channel_id,
 * and product_location_id for READY_TO_SHIP orders.
 * Handles missing package information gracefully by skipping those orders.
 * 
 * **API Used**: searchPackageList (referensi_api/4.md) - Returns complete logistics data
 * **Previous API**: getShipmentList (referensi_api/3.md) - Only returned order_sn + package_number (incomplete)
 * 
 * **Fix**: Replaced getShipmentList with searchPackageList to enable batch grouping
 * - searchPackageList returns logistics_channel_id and product_location_id
 * - These fields are required for grouping orders by logistics configuration
 * - Enables batch API usage (get_mass_shipping_parameter + mass_ship_order)
 * - Performance: 3.3× faster (18s → 5.5s for 10 orders)
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.8, 2.9, 2.10**
 * 
 * @param shopId - Shop ID
 * @param orderSns - Array of order serial numbers
 * @returns Object containing maps for packageNumber, logisticsChannelId, and productLocationId
 */
async function getPackageNumbersForOrders(
  shopId: number,
  orderSns: string[]
): Promise<{
  packageMap: Map<string, string>;
  logisticsMap: Map<string, number>;
  locationMap: Map<string, string>;
  arrangedMap: Map<string, boolean>;
}> {
  console.log('[shipment-service] getPackageNumbersForOrders started:', {
    timestamp: new Date().toISOString(),
    operation: 'get_package_numbers',
    shopId,
    totalOrders: orderSns.length,
    message: 'Starting package number extraction for batch orders'
  });

  const packageMap = new Map<string, string>();
  const logisticsMap = new Map<string, number>();
  const locationMap = new Map<string, string>();
  const arrangedMap = new Map<string, boolean>();
  
  // Track orders with missing fields for detailed logging
  const ordersMissingPackageNumber: string[] = [];
  const ordersMissingLogisticsChannel: string[] = [];
  const ordersMissingProductLocation: string[] = [];
  
  // Shopee limits to 50 orders per request
  const BATCH_SIZE = 50;
  for (let i = 0; i < orderSns.length; i += BATCH_SIZE) {
    const batch = orderSns.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(orderSns.length / BATCH_SIZE);
    
    console.log('[shipment-service] API call: searchPackageList:', {
      timestamp: new Date().toISOString(),
      operation: 'api_call',
      apiEndpoint: 'search_package_list',
      shopId,
      batchNumber,
      totalBatches,
      batchSize: batch.length,
      message: `Calling searchPackageList for batch ${batchNumber}/${totalBatches}`
    });
    
    try {
      // Call searchPackageList to get package_number, logistics_channel_id, and product_location_id
      // This API is specifically designed for batch shipment processing and returns complete package information
      const shipmentList = await searchPackageList(shopId, batch);
      const shipmentOrders = shipmentList?.response?.packages_list || [];
      
      console.log('[shipment-service] API success: searchPackageList:', {
        timestamp: new Date().toISOString(),
        operation: 'api_success',
        apiEndpoint: 'search_package_list',
        shopId,
        batchNumber,
        totalBatches,
        requested: batch.length,
        received: shipmentOrders.length,
        message: `searchPackageList returned ${shipmentOrders.length}/${batch.length} orders with package info`
      });
      
      // Track which orders were returned by API
      const returnedOrderSns = new Set(shipmentOrders.map((o: any) => o.order_sn));
      const ordersNotReturned = batch.filter(sn => !returnedOrderSns.has(sn));
      
      if (ordersNotReturned.length > 0) {
        console.warn('[shipment-service] API response validation: orders not returned by searchPackageList:', {
          timestamp: new Date().toISOString(),
          operation: 'api_validation',
          apiEndpoint: 'search_package_list',
          shopId,
          batchNumber,
          ordersNotReturned: ordersNotReturned.length,
          orderSns: ordersNotReturned,
          message: `${ordersNotReturned.length} orders were not returned in API response`
        });
      }
      
      // Extract package_number, logistics_channel_id, and product_location_id from getShipmentList response
      for (const order of shipmentOrders) {
        const orderSn = order.order_sn;
        
        // Track missing fields for this order
        const missingFields: string[] = [];
        
        // Extract package_number
        if (order.package_number) {
          packageMap.set(orderSn, order.package_number);
        } else {
          missingFields.push('package_number');
          ordersMissingPackageNumber.push(orderSn);
        }
        
        // Extract logistics_channel_id
        if (order.logistics_channel_id) {
          logisticsMap.set(orderSn, order.logistics_channel_id);
        } else {
          missingFields.push('logistics_channel_id');
          ordersMissingLogisticsChannel.push(orderSn);
        }
        
        // Extract product_location_id
        if (order.product_location_id) {
          locationMap.set(orderSn, order.product_location_id);
        } else {
          missingFields.push('product_location_id');
          ordersMissingProductLocation.push(orderSn);
        }
        
        // Extract is_shipment_arranged flag
        arrangedMap.set(orderSn, !!order.is_shipment_arranged);
        
        // Log orders with missing fields
        if (missingFields.length > 0) {
          console.warn('[shipment-service] order missing fields:', {
            timestamp: new Date().toISOString(),
            operation: 'field_extraction',
            orderSn,
            shopId,
            missingFields,
            hasPackageNumber: !!order.package_number,
            hasLogisticsChannel: !!order.logistics_channel_id,
            hasProductLocation: !!order.product_location_id,
            message: `Order ${orderSn} missing fields: ${missingFields.join(', ')}`
          });
        }
      }
      
      // Log batch summary
      const ordersWithPackageNumber = Array.from(packageMap.keys()).filter(sn => batch.includes(sn)).length;
      const ordersWithLogisticsChannel = Array.from(logisticsMap.keys()).filter(sn => batch.includes(sn)).length;
      const ordersWithProductLocation = Array.from(locationMap.keys()).filter(sn => batch.includes(sn)).length;
      const ordersWithCompleteData = batch.filter(sn => 
        packageMap.has(sn) && logisticsMap.has(sn) && locationMap.has(sn)
      ).length;
      
      console.log('[shipment-service] batch extraction summary:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_extraction',
        shopId,
        batchNumber,
        totalBatches,
        totalOrders: batch.length,
        ordersWithCompleteData,
        ordersWithPackageNumber,
        ordersWithLogisticsChannel,
        ordersWithProductLocation,
        missingPackageNumber: batch.length - ordersWithPackageNumber,
        missingLogisticsChannel: batch.length - ordersWithLogisticsChannel,
        missingProductLocation: batch.length - ordersWithProductLocation,
        completionRate: `${((ordersWithCompleteData / batch.length) * 100).toFixed(1)}%`,
        message: `Batch ${batchNumber}/${totalBatches}: ${ordersWithCompleteData}/${batch.length} orders with complete data`
      });
    } catch (err: any) {
      console.error('[shipment-service] API failure: searchPackageList batch failed:', {
        timestamp: new Date().toISOString(),
        operation: 'api_failure',
        apiEndpoint: 'search_package_list',
        errorType: 'batch_api_error',
        shopId,
        batchNumber,
        totalBatches,
        batchSize: batch.length,
        affectedOrders: batch,
        errorMessage: err.message,
        message: `Failed to get package numbers for batch ${batchNumber}/${totalBatches}`
      });
    }
  }
  
  // Calculate success rates
  const packageNumberSuccessRate = orderSns.length > 0 
    ? ((packageMap.size / orderSns.length) * 100).toFixed(1) 
    : '0.0';
  const logisticsChannelSuccessRate = orderSns.length > 0 
    ? ((logisticsMap.size / orderSns.length) * 100).toFixed(1) 
    : '0.0';
  const productLocationSuccessRate = orderSns.length > 0 
    ? ((locationMap.size / orderSns.length) * 100).toFixed(1) 
    : '0.0';
  
  // Count orders with complete data (all three fields present)
  const ordersWithCompleteData = orderSns.filter(sn => 
    packageMap.has(sn) && logisticsMap.has(sn) && locationMap.has(sn)
  ).length;
  const completeDataSuccessRate = orderSns.length > 0 
    ? ((ordersWithCompleteData / orderSns.length) * 100).toFixed(1) 
    : '0.0';
  
  // Final summary with detailed statistics
  console.log('[shipment-service] getPackageNumbersForOrders completed:', {
    timestamp: new Date().toISOString(),
    operation: 'get_package_numbers_completed',
    shopId,
    totalRequested: orderSns.length,
    ordersWithCompleteData,
    completeDataSuccessRate: `${completeDataSuccessRate}%`,
    packageMapSize: packageMap.size,
    logisticsMapSize: logisticsMap.size,
    locationMapSize: locationMap.size,
    packageNumberSuccessRate: `${packageNumberSuccessRate}%`,
    logisticsChannelSuccessRate: `${logisticsChannelSuccessRate}%`,
    productLocationSuccessRate: `${productLocationSuccessRate}%`,
    missingPackageNumber: orderSns.length - packageMap.size,
    missingLogisticsChannel: orderSns.length - logisticsMap.size,
    missingProductLocation: orderSns.length - locationMap.size,
    message: `Package extraction completed: ${ordersWithCompleteData}/${orderSns.length} orders with complete data (${completeDataSuccessRate}% success rate)`
  });
  
  // Log detailed breakdown of orders with missing fields (if any)
  if (ordersMissingPackageNumber.length > 0 || ordersMissingLogisticsChannel.length > 0 || ordersMissingProductLocation.length > 0) {
    console.warn('[shipment-service] orders with missing fields summary:', {
      timestamp: new Date().toISOString(),
      operation: 'missing_fields_summary',
      shopId,
      totalOrders: orderSns.length,
      ordersMissingPackageNumber: ordersMissingPackageNumber.length,
      ordersMissingLogisticsChannel: ordersMissingLogisticsChannel.length,
      ordersMissingProductLocation: ordersMissingProductLocation.length,
      sampleOrdersMissingPackageNumber: ordersMissingPackageNumber.slice(0, 5),
      sampleOrdersMissingLogisticsChannel: ordersMissingLogisticsChannel.slice(0, 5),
      sampleOrdersMissingProductLocation: ordersMissingProductLocation.slice(0, 5),
      message: 'Orders with missing fields will be skipped from batch grouping and processed individually'
    });
  }
  
  return { packageMap, logisticsMap, locationMap, arrangedMap };
}

/**
 * Group orders by logistics configuration (shopId, logisticsChannelId, productLocationId).
 * Splits groups larger than 50 orders into multiple batches.
 * Filters out orders with missing package/logistics information.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * @param orders - Array of orders with shopId
 * @param packageMap - Map of orderSn to packageNumber
 * @param logisticsMap - Map of orderSn to logisticsChannelId
 * @param locationMap - Map of orderSn to productLocationId
 * @returns Array of BatchGroup objects
 */
export function groupOrdersByLogistics(
  orders: Array<{ orderSn: string; shopId: number }>,
  packageMap: Map<string, string>,
  logisticsMap: Map<string, number>,
  locationMap: Map<string, string>
): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  
  for (const order of orders) {
    const packageNumber = packageMap.get(order.orderSn);
    const logisticsChannelId = logisticsMap.get(order.orderSn);
    const productLocationId = locationMap.get(order.orderSn);
    
    // Filter out orders with missing package/logistics information
    if (!packageNumber || !logisticsChannelId || !productLocationId) {
      console.warn('[shipment-service] Skipping order with missing data:', {
        orderSn: order.orderSn,
        hasPackage: !!packageNumber,
        hasLogistics: !!logisticsChannelId,
        hasLocation: !!productLocationId
      });
      continue;
    }
    
    // Create unique key from shopId_logisticsChannelId_productLocationId tuple
    const groupKey = `${order.shopId}_${logisticsChannelId}_${productLocationId}`;
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        shopId: order.shopId,
        logisticsChannelId,
        productLocationId,
        orders: []
      });
    }
    
    groups.get(groupKey)!.orders.push({
      orderSn: order.orderSn,
      packageNumber
    });
  }
  
  // Split groups larger than 50 orders into multiple batches
  const finalGroups: BatchGroup[] = [];
  for (const group of groups.values()) {
    if (group.orders.length <= 50) {
      finalGroups.push(group);
    } else {
      // Split into chunks of 50
      for (let i = 0; i < group.orders.length; i += 50) {
        finalGroups.push({
          shopId: group.shopId,
          logisticsChannelId: group.logisticsChannelId,
          productLocationId: group.productLocationId,
          orders: group.orders.slice(i, i + 50)
        });
      }
    }
  }
  
  console.log('[shipment-service] Grouped orders by logistics:', {
    totalOrders: orders.length,
    uniqueGroups: groups.size,
    finalBatches: finalGroups.length,
    batchSizes: finalGroups.map(g => g.orders.length)
  });
  
  return finalGroups;
}

/**
 * Process a single batch group using mass APIs
 * Calls getMassShippingParameter and massShipOrder for the entire group
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4**
 * 
 * @param group - BatchGroup containing orders with same logistics configuration
 * @param shipmentMethod - Shipment method: 'pickup' or 'dropoff'
 * @returns Array of ShipmentResult for each order in the group
 */
export async function processBatchGroup(
  group: BatchGroup,
  shipmentMethod: 'pickup' | 'dropoff'
): Promise<ShipmentResult[]> {
  const groupStartTime = Date.now();
  const results: ShipmentResult[] = [];
  
  console.log('[shipment-service] processBatchGroup started:', {
    timestamp: new Date().toISOString(),
    operation: 'batch_group_processing',
    groupSize: group.orders.length,
    shopId: group.shopId,
    logisticsChannelId: group.logisticsChannelId,
    productLocationId: group.productLocationId,
    shipmentMethod,
    message: 'Starting batch group processing'
  });

  try {
    // Step 1: Get mass shipping parameters
    const packageNumbers = group.orders.map(o => o.packageNumber);
    const { getMassShippingParameter, massShipOrder } = await import('./shopee-raw');
    
    console.log('[shipment-service] API call: getMassShippingParameter:', {
      timestamp: new Date().toISOString(),
      operation: 'api_call',
      apiEndpoint: 'get_mass_shipping_parameter',
      packageCount: packageNumbers.length,
      shopId: group.shopId,
      logisticsChannelId: group.logisticsChannelId,
      message: 'Calling getMassShippingParameter API'
    });
    
    const paramResponse = await getMassShippingParameter(
      group.shopId,
      packageNumbers,
      group.logisticsChannelId,
      group.productLocationId
    );

    // Extract parameters from response
    const paramResult = paramResponse?.response || paramResponse?.result || paramResponse || {};
    
    // **Validates: Requirement 10.3** - Log API call success with response summary
    console.log('[shipment-service] API success: getMassShippingParameter:', {
      timestamp: new Date().toISOString(),
      operation: 'api_success',
      apiEndpoint: 'get_mass_shipping_parameter',
      successCount: packageNumbers.length,
      hasPickup: !!paramResult.pickup,
      hasDropoff: !!paramResult.dropoff,
      addressCount: paramResult.pickup?.address_list?.length || 0,
      branchCount: paramResult.dropoff?.branch_list?.length || 0,
      shopId: group.shopId,
      message: 'Successfully retrieved shipping parameters for batch'
    });

    // DEBUG: Log full paramResult structure
    console.log('[shipment-service] DEBUG paramResult:', JSON.stringify(paramResult, null, 2));

    // Step 2: Build package list (simple, only package_number)
    const packages: Array<{ package_number: string }> = group.orders.map(order => ({
      package_number: order.packageNumber
    }));

    // Step 3: Build pickup/dropoff at TOP LEVEL (shared by all packages)
    // Per Shopee docs: "Developer should still include pickup/dropoff field even if has empty value"
    let pickup: any = {};
    let dropoff: any = {};

    if (shipmentMethod === 'pickup') {
      const pickupInfo = paramResult.pickup || {};
      const firstAddress = pickupInfo.address_list?.[0];
      
      if (firstAddress?.address_id) {
        const timeSlots = firstAddress.time_slot_list || [];
        const recommendedSlot = timeSlots.find((s: any) => s.flags?.includes('recommended'));
        const firstSlot = recommendedSlot || timeSlots[0];
        
        pickup = {
          address_id: firstAddress.address_id,
          pickup_time_id: firstSlot?.pickup_time_id || ''
        };
      }
      // Set dropoff to undefined for pickup method (don't send it)
      dropoff = undefined;
    } else if (shipmentMethod === 'dropoff') {
      const dropoffInfo = paramResult.dropoff || {};
      const firstBranch = dropoffInfo.branch_list?.[0];
      
      if (firstBranch?.branch_id) {
        dropoff = {
          branch_id: firstBranch.branch_id
        };
        
        if (dropoffInfo.sender_real_name) {
          dropoff.sender_real_name = dropoffInfo.sender_real_name;
        }
      }
      // Set pickup to undefined for dropoff method (don't send it)
      pickup = undefined;
    }

    console.log('[shipment-service] API call: massShipOrder:', {
      timestamp: new Date().toISOString(),
      operation: 'api_call',
      apiEndpoint: 'mass_ship_order',
      packageCount: packages.length,
      shopId: group.shopId,
      logisticsChannelId: group.logisticsChannelId,
      shipmentMethod,
      hasPickup: !!pickup,
      hasDropoff: !!dropoff,
      pickupData: pickup,
      dropoffData: dropoff,
      message: 'Calling massShipOrder API'
    });

    // Step 4: Call massShipOrder with pickup/dropoff at top level
    const shipResponse = await massShipOrder(
      group.shopId,
      packages,
      group.logisticsChannelId,
      group.productLocationId,
      pickup,
      dropoff
    );

    // DEBUG: Log raw response
    console.log('[shipment-service] massShipOrder RAW RESPONSE:', JSON.stringify(shipResponse, null, 2));

    const successList = shipResponse?.response?.success_list || shipResponse?.success_list || [];
    const failList = shipResponse?.response?.fail_list || shipResponse?.fail_list || [];

    // **Validates: Requirement 10.3** - Log API call success with success/failure counts
    console.log('[shipment-service] API success: massShipOrder:', {
      timestamp: new Date().toISOString(),
      operation: 'api_success',
      apiEndpoint: 'mass_ship_order',
      totalPackages: packages.length,
      successCount: successList.length,
      failCount: failList.length,
      shopId: group.shopId,
      message: `Batch shipment completed: ${successList.length} succeeded, ${failList.length} failed`
    });

    // Step 4: Process success_list - update database status to PROCESSED
    const successPackageNumbers = new Set(successList.map((s: any) => s.package_number));
    const prefetchOrderSns: string[] = [];

    for (const order of group.orders) {
      if (successPackageNumbers.has(order.packageNumber)) {
        try {
          // Update database
          await db.update(shopeeOrders)
            .set({
              orderStatus: "PROCESSED",
              updatedAt: new Date()
            })
            .where(eq(shopeeOrders.orderSn, order.orderSn));

          console.log(`[shipment-service] ✅ ${order.orderSn}: batch ship_order success, status → PROCESSED`);

          // Collect for post-batch label prefetch (see fire-and-forget call below).
          prefetchOrderSns.push(order.orderSn);

          results.push({
            success: true,
            orderSn: order.orderSn,
            message: `Pengiriman berhasil diatur untuk order ${order.orderSn}`
          });
        } catch (dbError: any) {
          console.error(`[shipment-service] DB update failed for ${order.orderSn}:`, dbError.message);

          // Even when our local DB update fails, the order IS shipped on Shopee
          // and a label CAN be generated — still queue it for prefetch so the
          // user-visible state catches up automatically once the user prints.
          prefetchOrderSns.push(order.orderSn);

          results.push({
            success: true,
            orderSn: order.orderSn,
            message: "Pengiriman berhasil diatur di Shopee, namun gagal memperbarui database lokal. Silakan tarik ulang pesanan."
          });
        }
      }
    }

    // Fire-and-forget label prefetch for all orders that successfully shipped
    // in this batch group. Returns immediately — work runs after a 3 s delay
    // (default in prefetchLabelsInBackground) so Shopee has time to populate
    // the shipping document. The user-visible mass-ship response is NOT delayed.
    //
    // Why batch (not per-order): the single-order shipSingleOrder() already
    // does its own prefetch when called outside batch mode (skipPrefetch=true
    // is passed during fallbacks to avoid double-prefetch).
    if (prefetchOrderSns.length > 0) {
      const { prefetchLabelsInBackground } = await import('./label.service');
      prefetchLabelsInBackground(group.shopId, prefetchOrderSns);
    }

    // Step 5: Process fail_list - collect error messages
    const failPackageMap = new Map(
      failList.map((f: any) => [f.package_number, f.fail_reason || f.error || 'Unknown error'])
    );
    
    // **Validates: Requirement 10.4** - Log API failures with error types, messages, and affected orders
    if (failList.length > 0) {
      const affectedOrders = group.orders
        .filter(o => failPackageMap.has(o.packageNumber))
        .map(o => o.orderSn);
      
      const errorSummary = failList.map((f: any) => ({
        packageNumber: f.package_number,
        errorType: f.error_type || 'shipment_error',
        errorMessage: f.fail_reason || f.error || 'Unknown error'
      }));

      console.error('[shipment-service] API failure: massShipOrder partial failures:', {
        timestamp: new Date().toISOString(),
        operation: 'api_failure',
        apiEndpoint: 'mass_ship_order',
        errorType: 'partial_failure',
        failCount: failList.length,
        affectedOrderCount: affectedOrders.length,
        affectedOrders: affectedOrders,
        errorDetails: errorSummary.slice(0, 5), // Log first 5 errors for brevity
        shopId: group.shopId,
        message: `${failList.length} orders failed in batch shipment`
      });
    }
    
    for (const order of group.orders) {
      const failReason = failPackageMap.get(order.packageNumber);
      if (failReason) {
        console.error(`[shipment-service] ❌ ${order.orderSn}: batch ship_order failed: ${failReason}`);
        
        results.push({
          success: false,
          orderSn: order.orderSn,
          error: `Shopee menolak pengaturan pengiriman: ${failReason}`
        });
      }
    }

    // **Validates: Requirement 10.2** - Log batch group completion with processing time
    const groupEndTime = Date.now();
    const groupProcessingTime = groupEndTime - groupStartTime;
    
    console.log('[shipment-service] processBatchGroup completed:', {
      timestamp: new Date().toISOString(),
      operation: 'batch_group_completed',
      groupSize: group.orders.length,
      shopId: group.shopId,
      logisticsChannelId: group.logisticsChannelId,
      productLocationId: group.productLocationId,
      successCount: results.filter(r => r.success).length,
      failCount: results.filter(r => !r.success).length,
      processingTime: `${groupProcessingTime}ms`,
      processingTimeSeconds: `${(groupProcessingTime / 1000).toFixed(2)}s`,
      message: 'Batch group processing completed successfully'
    });

    return results;

  } catch (error: any) {
    // **Validates: Requirement 10.4** - Log complete batch failures with error details
    const affectedOrders = group.orders.map(o => o.orderSn);
    
    console.error('[shipment-service] API failure: processBatchGroup complete failure:', {
      timestamp: new Date().toISOString(),
      operation: 'api_failure',
      errorType: 'batch_processing_error',
      groupSize: group.orders.length,
      shopId: group.shopId,
      logisticsChannelId: group.logisticsChannelId,
      affectedOrderCount: affectedOrders.length,
      affectedOrders: affectedOrders,
      errorMessage: error.message,
      stack: error.stack,
      message: 'Complete batch group processing failure, will trigger fallback'
    });

    // Re-throw to trigger fallback
    throw error;
  }
}

/**
 * Wrapper for processBatchGroup with fallback to single-order processing
 * If batch processing fails, falls back to processing each order individually
 * 
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**
 * 
 * @param group - BatchGroup containing orders with same logistics configuration
 * @param shipmentMethod - Shipment method: 'pickup' or 'dropoff'
 * @returns Array of ShipmentResult for each order in the group
 */
export async function processBatchGroupWithFallback(
  group: BatchGroup,
  shipmentMethod: 'pickup' | 'dropoff'
): Promise<ShipmentResult[]> {
  try {
    // Try batch processing first
    return await processBatchGroup(group, shipmentMethod);
  } catch (error: any) {
    // Batch processing failed - fall back to single-order processing
    console.warn('[shipment-service] batch processing failed, falling back to single-order:', {
      timestamp: new Date().toISOString(),
      operation: 'batch_group_fallback',
      groupSize: group.orders.length,
      shopId: group.shopId,
      logisticsChannelId: group.logisticsChannelId,
      productLocationId: group.productLocationId,
      errorType: 'fallback_triggered',
      errorMessage: error.message,
      fallbackTrigger: 'batch_api_failure',
      estimatedFallbackTime: `${(group.orders.length * 1.3).toFixed(1)}s`,
      message: `Batch API failed for group of ${group.orders.length} orders, triggering single-order fallback`
    });

    const results: ShipmentResult[] = [];

    // Process each order individually with rate limiting
    for (let i = 0; i < group.orders.length; i++) {
      const order = group.orders[i];
      
      try {
        console.log('[shipment-service] fallback: processing order individually:', {
          timestamp: new Date().toISOString(),
          operation: 'batch_group_fallback',
          orderSn: order.orderSn,
          shopId: group.shopId,
          progress: `${i + 1}/${group.orders.length}`,
          processingMode: 'single_order_fallback',
          message: `Processing order ${i + 1}/${group.orders.length} individually after batch failure`
        });

        const result = await shipSingleOrder(order.orderSn, shipmentMethod, { skipPrefetch: true });
        results.push(result);
        
        if (result.success) {
          console.log('[shipment-service] fallback: single-order success:', {
            timestamp: new Date().toISOString(),
            operation: 'batch_group_fallback',
            orderSn: order.orderSn,
            progress: `${i + 1}/${group.orders.length}`,
            message: `Successfully processed order ${order.orderSn} individually after batch failure`
          });
        } else {
          console.error('[shipment-service] fallback: single-order failed:', {
            timestamp: new Date().toISOString(),
            operation: 'batch_group_fallback',
            orderSn: order.orderSn,
            progress: `${i + 1}/${group.orders.length}`,
            errorMessage: result.error,
            message: `Failed to process order ${order.orderSn} individually after batch failure`
          });
        }
      } catch (singleError: any) {
        console.error('[shipment-service] fallback: single order processing error:', {
          timestamp: new Date().toISOString(),
          operation: 'batch_group_fallback',
          orderSn: order.orderSn,
          errorType: 'single_order_fallback',
          progress: `${i + 1}/${group.orders.length}`,
          errorMessage: singleError.message,
          message: `Exception during single-order fallback for ${order.orderSn}`
        });

        results.push({
          success: false,
          orderSn: order.orderSn,
          error: singleError.message
        });
      }

      // Apply 300ms rate limiting delay between individual orders (except for the last one)
      if (i < group.orders.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    // Log summary of fallback processing
    const fallbackSuccessCount = results.filter(r => r.success).length;
    const fallbackFailCount = results.filter(r => !r.success).length;
    
    console.log('[shipment-service] batch group fallback completed:', {
      timestamp: new Date().toISOString(),
      operation: 'batch_group_fallback',
      groupSize: group.orders.length,
      shopId: group.shopId,
      fallbackSuccessCount,
      fallbackFailCount,
      fallbackSuccessRate: `${((fallbackSuccessCount / group.orders.length) * 100).toFixed(1)}%`,
      message: `Fallback processing completed: ${fallbackSuccessCount}/${group.orders.length} orders succeeded after batch failure`
    });

    return results;
  }
}

/**
 * Process shipment for multiple orders using batch processing with mass APIs
 * 
 * This function optimizes batch order shipment by grouping orders by logistics
 * configuration and using Shopee's mass APIs (getMassShippingParameter, massShipOrder,
 * getMassTrackingNumber) instead of sequential single-order processing.
 * 
 * Performance: 28 orders complete in 6-9 seconds (vs 64-92 seconds sequential)
 * API calls: 3 batch calls (vs 57 individual calls)
 * 
 * The function handles partial failures gracefully and falls back to single-order
 * processing when batch operations fail.
 * 
 * @param orderSns - Array of order serial numbers
 * @param shipmentMethod - Shipment method: 'pickup' or 'dropoff' (REQUIRED)
 * @returns Array of results for each order with success/failure status
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 10.1, 10.2, 10.5, 11.1, 11.2, 11.3, 11.4**
 */
export async function shipBatchOrders(
  orderSns: string[],
  shipmentMethod: 'pickup' | 'dropoff'
): Promise<ShipmentResult[]> {
  const startTime = Date.now();
  const results: ShipmentResult[] = [];

  console.log('[shipment-service] batch processing started:', {
    timestamp: new Date().toISOString(),
    operation: 'batch_ship',
    totalOrders: orderSns.length,
    shipmentMethod,
    message: 'Starting batch shipment processing with mass APIs'
  });

  // ── PHASE 1: VALIDATION ──
  // Single batch query replaces N sequential validateOrderEligibility calls.
  // Results/error messages are identical to the per-order path (Task 1).
  // **Validates: Requirements 3.1, 8.1, 8.2, 10.1**
  const eligibleOrders: Array<{ orderSn: string; shopId: number }> = [];
  const orderShopIdMap = new Map<string, number>();

  const ELIGIBLE_STATUSES_FOR_SHIP = ['READY_TO_SHIP'];
  const ALREADY_SHIPPED_STATUSES = ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE'];

  try {
    const rows = await db.select().from(shopeeOrders).where(inArray(shopeeOrders.orderSn, orderSns));
    const byOrderSn = new Map<string, typeof rows[0]>();
    for (const r of rows) byOrderSn.set(r.orderSn, r);

    for (const orderSn of orderSns) {
      const order = byOrderSn.get(orderSn);
      if (!order) {
        results.push({ success: false, orderSn, error: `Order ${orderSn} tidak ditemukan dalam database` });
        continue;
      }
      if (ALREADY_SHIPPED_STATUSES.includes(order.orderStatus)) {
        results.push({ success: true, orderSn, message: 'Order sudah berhasil dikirim sebelumnya' });
        continue;
      }
      if (!ELIGIBLE_STATUSES_FOR_SHIP.includes(order.orderStatus)) {
        results.push({ success: false, orderSn, error: `Order ${orderSn} tidak dapat diatur pengiriman: status saat ini adalah ${order.orderStatus}` });
        continue;
      }
      eligibleOrders.push({ orderSn, shopId: order.shopId });
      orderShopIdMap.set(orderSn, order.shopId);
    }
  } catch (batchValidationErr: any) {
    // Fallback: per-order sequential validation if batch query fails
    console.warn('[shipment-service] batch validation failed, falling back per-order:', batchValidationErr.message);
    for (const orderSn of orderSns) {
      const validation = await validateOrderEligibility(orderSn);
      if (validation.valid) {
        const shopId = validation.order!.shopId;
        eligibleOrders.push({ orderSn, shopId });
        orderShopIdMap.set(orderSn, shopId);
      } else {
        const order = validation.order;
        if (order && ALREADY_SHIPPED_STATUSES.includes(order.orderStatus)) {
          results.push({ success: true, orderSn, message: 'Order sudah berhasil dikirim sebelumnya' });
        } else {
          results.push({ success: false, orderSn, error: validation.error });
        }
      }
    }
  }

  console.log('[shipment-service] eligibility filtering completed:', {
    timestamp: new Date().toISOString(),
    operation: 'batch_ship',
    totalOrders: orderSns.length,
    eligibleOrders: eligibleOrders.length,
    filteredOut: orderSns.length - eligibleOrders.length,
    message: 'Validation phase completed'
  });

  if (eligibleOrders.length === 0) {
    console.log('[shipment-service] no eligible orders to process');
    return results;
  }

  // ── PHASE 1.5: PRE-SYNC STATUS CHECK ──
  // Verify actual Shopee status before batch ship to detect stale orders
  // **Validates: Requirements 2.1, 2.2, 2.3**
  
  // Group eligible orders by shopId for pre-sync
  const preSyncByShop = new Map<number, string[]>();
  for (const order of eligibleOrders) {
    if (!preSyncByShop.has(order.shopId)) {
      preSyncByShop.set(order.shopId, []);
    }
    preSyncByShop.get(order.shopId)!.push(order.orderSn);
  }

  const staleOrderSns = new Set<string>(); // Track orders removed during pre-sync

  for (const [shopId, shopOrderSns] of preSyncByShop) {
    try {
      // Call getShopeeOrderDetails (1 API call per ≤50 orders)
      const PRESYNC_BATCH_SIZE = 50;
      for (let i = 0; i < shopOrderSns.length; i += PRESYNC_BATCH_SIZE) {
        const batch = shopOrderSns.slice(i, i + PRESYNC_BATCH_SIZE);
        
        console.log('[shipment-service] pre-sync: checking Shopee status:', {
          timestamp: new Date().toISOString(),
          operation: 'pre_sync',
          shopId,
          batchSize: batch.length,
          message: `Checking actual Shopee status for ${batch.length} orders`
        });

        const details = await getShopeeOrderDetails(shopId, batch);
        const orderList = details?.response?.order_list || [];

        for (const orderDetail of orderList) {
          const orderSn = orderDetail.order_sn;
          const shopeeStatus = orderDetail.order_status;

          if (shopeeStatus === 'SHIPPED' || shopeeStatus === 'PROCESSED') {
            // Stale shipped/processed → report as success, update DB
            staleOrderSns.add(orderSn);
            results.push({
              success: true,
              orderSn,
              message: 'Order sudah berhasil dikirim sebelumnya'
            });
            // Update DB status (fire-and-forget)
            db.update(shopeeOrders)
              .set({ orderStatus: shopeeStatus, updatedAt: new Date() })
              .where(eq(shopeeOrders.orderSn, orderSn))
              .execute()
              .catch(() => {});
          } else if (shopeeStatus === 'CANCELLED' || shopeeStatus === 'IN_CANCEL') {
            // Stale cancelled → report as failed, update DB
            staleOrderSns.add(orderSn);
            results.push({
              success: false,
              orderSn,
              error: 'Order sudah dibatalkan di Shopee'
            });
            // Update DB status (fire-and-forget)
            db.update(shopeeOrders)
              .set({ orderStatus: shopeeStatus, updatedAt: new Date() })
              .where(eq(shopeeOrders.orderSn, orderSn))
              .execute()
              .catch(() => {});
          }
          // Orders with READY_TO_SHIP status pass through unchanged
        }
      }
    } catch (preSyncError: any) {
      // If pre-sync fails for a shop, continue with all orders (don't block batch ship)
      console.warn('[shipment-service] pre-sync failed for shop, continuing with all orders:', {
        timestamp: new Date().toISOString(),
        operation: 'pre_sync',
        shopId,
        errorMessage: preSyncError.message,
        message: 'Pre-sync failed, proceeding without status filtering'
      });
    }
  }

  // Remove stale orders from eligible list
  const eligibleAfterPreSync = eligibleOrders.filter(o => !staleOrderSns.has(o.orderSn));

  console.log('[shipment-service] pre-sync completed:', {
    timestamp: new Date().toISOString(),
    operation: 'pre_sync',
    totalEligible: eligibleOrders.length,
    staleOrders: staleOrderSns.size,
    remainingEligible: eligibleAfterPreSync.length,
    message: `Pre-sync removed ${staleOrderSns.size} stale orders, ${eligibleAfterPreSync.length} orders proceed to batch ship`
  });

  if (eligibleAfterPreSync.length === 0) {
    console.log('[shipment-service] no orders remaining after pre-sync');
    return results;
  }

  // ── PHASE 2: BATCH GROUPING ──
  // Group eligible orders by shopId, then by logistics configuration
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 10.1, 10.2**
  
  // Top-level map to cache package numbers for Phase 4 reuse
  const allPackageMaps = new Map<string, string>(); // orderSn → packageNumber

  // Group by shopId first
  const ordersByShop = new Map<number, Array<{ orderSn: string; shopId: number }>>();
  for (const order of eligibleAfterPreSync) {
    if (!ordersByShop.has(order.shopId)) {
      ordersByShop.set(order.shopId, []);
    }
    ordersByShop.get(order.shopId)!.push(order);
  }

  console.log('[shipment-service] orders grouped by shop:', {
    timestamp: new Date().toISOString(),
    operation: 'batch_ship',
    shopCount: ordersByShop.size,
    shopDistribution: Array.from(ordersByShop.entries()).map(([shopId, orders]) => ({
      shopId,
      orderCount: orders.length
    }))
  });

  // For each shop group, get package numbers and logistics configuration
  const allBatchGroups: BatchGroup[] = [];
  const ordersSkippedDuringGrouping: Array<{ orderSn: string; shopId: number }> = [];
  
  for (const [shopId, shopOrders] of ordersByShop) {
    try {
      console.log('[shipment-service] fetching package numbers for shop:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        shopId,
        orderCount: shopOrders.length
      });

      // Get package numbers and logistics info for all orders in this shop
      const orderSns = shopOrders.map(o => o.orderSn);
      const { packageMap, logisticsMap, locationMap, arrangedMap } = await getPackageNumbersForOrders(shopId, orderSns);

      // Store package numbers in top-level map for Phase 4 reuse
      for (const [orderSn, packageNumber] of packageMap) {
        allPackageMaps.set(orderSn, packageNumber);
      }

      // Filter out orders with is_shipment_arranged: true
      const arrangedOrderSns: string[] = [];
      for (const [orderSn, isArranged] of arrangedMap) {
        if (isArranged) {
          arrangedOrderSns.push(orderSn);
        }
      }

      if (arrangedOrderSns.length > 0) {
        console.log('[shipment-service] filtering is_shipment_arranged orders:', {
          timestamp: new Date().toISOString(),
          operation: 'batch_ship',
          shopId,
          arrangedCount: arrangedOrderSns.length,
          message: `${arrangedOrderSns.length} orders already have shipment arranged, skipping from batch`
        });

        for (const orderSn of arrangedOrderSns) {
          results.push({
            success: true,
            orderSn,
            message: 'Order sedang diproses pengirimannya'
          });
        }
      }

      // Remove arranged orders from shopOrders for grouping
      const arrangedSet = new Set(arrangedOrderSns);
      const filteredShopOrders = shopOrders.filter(o => !arrangedSet.has(o.orderSn));

      // Track which orders were successfully grouped
      const ordersBeforeGrouping = filteredShopOrders.length;
      
      // Group orders by logistics configuration (logisticsChannelId, productLocationId)
      const batchGroups = groupOrdersByLogistics(filteredShopOrders, packageMap, logisticsMap, locationMap);
      allBatchGroups.push(...batchGroups);

      // Count how many orders were successfully grouped
      const ordersInGroups = batchGroups.reduce((sum, group) => sum + group.orders.length, 0);
      const ordersSkipped = ordersBeforeGrouping - ordersInGroups;
      const groupingSuccessRate = ordersBeforeGrouping > 0 
        ? ((ordersInGroups / ordersBeforeGrouping) * 100).toFixed(1) 
        : '0.0';
      
      // Track orders that were skipped during grouping (missing package/logistics info)
      if (ordersSkipped > 0) {
        const groupedOrderSns = new Set(
          batchGroups.flatMap(g => g.orders.map(o => o.orderSn))
        );
        
        // Identify skipped orders and determine reasons
        const skippedOrdersDetails: Array<{
          orderSn: string;
          reasons: string[];
        }> = [];
        
        for (const order of filteredShopOrders) {
          if (!groupedOrderSns.has(order.orderSn)) {
            ordersSkippedDuringGrouping.push(order);
            
            // Determine specific reasons for skipping
            const reasons: string[] = [];
            if (!packageMap.has(order.orderSn)) {
              reasons.push('missing_package_number');
            }
            if (!logisticsMap.has(order.orderSn)) {
              reasons.push('missing_logistics_channel_id');
            }
            if (!locationMap.has(order.orderSn)) {
              reasons.push('missing_product_location_id');
            }
            
            skippedOrdersDetails.push({
              orderSn: order.orderSn,
              reasons
            });
          }
        }
        
        // Log detailed information about skipped orders
        console.warn('[shipment-service] orders skipped during batch grouping:', {
          timestamp: new Date().toISOString(),
          operation: 'batch_grouping',
          shopId,
          totalOrders: ordersBeforeGrouping,
          ordersGrouped: ordersInGroups,
          ordersSkipped,
          groupingSuccessRate: `${groupingSuccessRate}%`,
          skippedOrdersDetails: skippedOrdersDetails.slice(0, 10), // Log first 10 for brevity
          totalSkippedOrders: skippedOrdersDetails.length,
          reasonBreakdown: {
            missingPackageNumber: skippedOrdersDetails.filter(o => o.reasons.includes('missing_package_number')).length,
            missingLogisticsChannel: skippedOrdersDetails.filter(o => o.reasons.includes('missing_logistics_channel_id')).length,
            missingProductLocation: skippedOrdersDetails.filter(o => o.reasons.includes('missing_product_location_id')).length
          },
          message: `${ordersSkipped} orders skipped from batch grouping due to missing data, will fall back to single-order processing`
        });
      }

      console.log('[shipment-service] batch groups created for shop:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        shopId,
        totalOrders: ordersBeforeGrouping,
        ordersGrouped: ordersInGroups,
        ordersSkipped,
        groupingSuccessRate: `${groupingSuccessRate}%`,
        batchGroupCount: batchGroups.length,
        groupSizes: batchGroups.map(g => g.orders.length),
        message: `Batch grouping completed: ${ordersInGroups}/${ordersBeforeGrouping} orders grouped (${groupingSuccessRate}% success rate)`
      });
    } catch (error: any) {
      console.error('[shipment-service] failed to create batch groups for shop:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        errorType: 'grouping',
        shopId,
        orderCount: shopOrders.length,
        errorMessage: error.message,
        fallbackTrigger: 'batch_grouping_failure',
        message: `Batch grouping failed for shop ${shopId}, triggering fallback to single-order processing for ${shopOrders.length} orders`
      });

      // Fall back to single-order processing for this shop's orders
      for (const order of shopOrders) {
        ordersSkippedDuringGrouping.push(order);
      }
      
      console.warn('[shipment-service] fallback triggered: all orders from shop will be processed individually:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        shopId,
        fallbackOrderCount: shopOrders.length,
        fallbackReason: 'batch_grouping_error',
        message: `${shopOrders.length} orders will fall back to single-order processing`
      });
    }
  }

  console.log('[shipment-service] batch grouping phase completed:', {
    timestamp: new Date().toISOString(),
    operation: 'batch_ship',
    totalEligibleOrders: eligibleAfterPreSync.length,
    totalBatchGroups: allBatchGroups.length,
    ordersInBatchGroups: allBatchGroups.reduce((sum, g) => sum + g.orders.length, 0),
    ordersSkippedDuringGrouping: ordersSkippedDuringGrouping.length,
    batchGroupingSuccessRate: eligibleAfterPreSync.length > 0 
      ? `${((allBatchGroups.reduce((sum, g) => sum + g.orders.length, 0) / eligibleAfterPreSync.length) * 100).toFixed(1)}%`
      : '0.0%',
    batchGroupSizes: allBatchGroups.map(g => g.orders.length),
    willUseBatchAPI: allBatchGroups.length > 0,
    willUseSingleOrderFallback: ordersSkippedDuringGrouping.length > 0,
    message: `Batch grouping completed: ${allBatchGroups.length} batch groups formed, ${ordersSkippedDuringGrouping.length} orders will use single-order fallback`
  });

  // ── PHASE 3: BATCH PROCESSING LOOP ──
  // Iterate through batch groups and process each with fallback
  // **Validates: Requirements 5.5, 10.2, 11.1, 11.2, 11.3, 11.4**
  
  for (let i = 0; i < allBatchGroups.length; i++) {
    const group = allBatchGroups[i];
    
    console.log('[shipment-service] processing batch group:', {
      timestamp: new Date().toISOString(),
      operation: 'batch_ship',
      groupIndex: i + 1,
      totalGroups: allBatchGroups.length,
      groupSize: group.orders.length,
      shopId: group.shopId,
      logisticsChannelId: group.logisticsChannelId,
      productLocationId: group.productLocationId,
      message: `Processing batch group ${i + 1}/${allBatchGroups.length}`
    });

    try {
      // Process batch group with fallback to single-order processing
      const groupResults = await processBatchGroupWithFallback(group, shipmentMethod);
      results.push(...groupResults);

      console.log('[shipment-service] batch group processed:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        groupIndex: i + 1,
        totalGroups: allBatchGroups.length,
        groupSize: group.orders.length,
        successCount: groupResults.filter(r => r.success).length,
        failCount: groupResults.filter(r => !r.success).length,
        message: `Batch group ${i + 1}/${allBatchGroups.length} completed`
      });
    } catch (error: any) {
      console.error('[shipment-service] batch group processing failed:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        groupIndex: i + 1,
        errorType: 'batch_group_processing',
        groupSize: group.orders.length,
        shopId: group.shopId,
        logisticsChannelId: group.logisticsChannelId,
        productLocationId: group.productLocationId,
        affectedOrders: group.orders.map(o => o.orderSn),
        errorMessage: error.message,
        fallbackTrigger: 'batch_group_processing_failure',
        message: `Batch group ${i + 1}/${allBatchGroups.length} processing failed, marking ${group.orders.length} orders as failed`
      });

      // Mark all orders in this group as failed
      for (const order of group.orders) {
        results.push({
          success: false,
          orderSn: order.orderSn,
          error: `Batch processing failed: ${error.message}`
        });
      }
    }

    // Apply 300ms delay between batch groups for rate limiting (except for the last group)
    if (i < allBatchGroups.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Process orders that were skipped during grouping (missing package/logistics info)
  // Fall back to single-order processing for these orders
  if (ordersSkippedDuringGrouping.length > 0) {
    console.log('[shipment-service] processing orders skipped during grouping:', {
      timestamp: new Date().toISOString(),
      operation: 'batch_ship',
      skippedCount: ordersSkippedDuringGrouping.length,
      totalOrders: orderSns.length,
      fallbackPercentage: `${((ordersSkippedDuringGrouping.length / orderSns.length) * 100).toFixed(1)}%`,
      fallbackTrigger: 'missing_package_logistics_data',
      message: `${ordersSkippedDuringGrouping.length} orders skipped — likely already shipped or status changed`
    });

    // Instead of trying to ship each one individually (which will fail with "already shipped"),
    // do a quick batch status check via getShopeeOrderDetails and report accurately
    const skippedByShop = new Map<number, string[]>();
    for (const order of ordersSkippedDuringGrouping) {
      if (!skippedByShop.has(order.shopId)) skippedByShop.set(order.shopId, []);
      skippedByShop.get(order.shopId)!.push(order.orderSn);
    }

    for (const [shopId, skippedSns] of skippedByShop) {
      try {
        // 1 API call to check actual status of all skipped orders
        const details = await getShopeeOrderDetails(shopId, skippedSns);
        const orderList = details?.response?.order_list || [];
        const statusMap = new Map<string, string>();
        for (const d of orderList) {
          statusMap.set(d.order_sn, d.order_status);
        }

        for (const orderSn of skippedSns) {
          const shopeeStatus = statusMap.get(orderSn);
          if (shopeeStatus && shopeeStatus !== 'READY_TO_SHIP') {
            // Order already shipped/processed — update DB and report
            results.push({
              success: false,
              orderSn,
              error: `Order sudah berstatus ${shopeeStatus} di Shopee (tidak perlu diatur pengiriman lagi)`
            });
            // Update DB status (fire-and-forget)
            db.update(shopeeOrders)
              .set({ orderStatus: shopeeStatus })
              .where(eq(shopeeOrders.orderSn, orderSn))
              .execute()
              .catch(() => {});
          } else {
            // Genuinely missing package info — try single ship as fallback
            try {
              const result = await shipSingleOrder(orderSn, shipmentMethod, { skipPrefetch: true });
              results.push(result);
            } catch (singleError: any) {
              results.push({ success: false, orderSn, error: singleError.message });
            }
          }
        }
      } catch {
        // If status check fails, fall back to single ship for all
        for (const orderSn of skippedSns) {
          try {
            const result = await shipSingleOrder(orderSn, shipmentMethod, { skipPrefetch: true });
            results.push(result);
          } catch (singleError: any) {
            results.push({ success: false, orderSn, error: singleError.message });
          }
        }
      }
    }
    
    // Log summary of skipped orders processing
    const fallbackSuccessCount = results.filter(r => 
      ordersSkippedDuringGrouping.some(o => o.orderSn === r.orderSn) && r.success
    ).length;
    const fallbackFailCount = ordersSkippedDuringGrouping.length - fallbackSuccessCount;
    
    console.log('[shipment-service] single-order fallback processing completed:', {
      timestamp: new Date().toISOString(),
      operation: 'batch_ship',
      totalFallbackOrders: ordersSkippedDuringGrouping.length,
      fallbackSuccessCount,
      fallbackFailCount,
      fallbackSuccessRate: `${((fallbackSuccessCount / ordersSkippedDuringGrouping.length) * 100).toFixed(1)}%`,
      message: `Single-order fallback completed: ${fallbackSuccessCount}/${ordersSkippedDuringGrouping.length} orders succeeded`
    });
  }

  // ── PHASE 4: BATCH TRACKING NUMBER RETRIEVAL ──
  // Filter successful orders and retrieve tracking numbers in batch
  // Only for orders that went through batch ship (not pre-sync stale orders)
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
  
  const successfulOrders = results.filter(r => r.success && !staleOrderSns.has(r.orderSn));
  const successOrdersByShop = new Map<number, string[]>(); // Declare outside for API call estimation
  
  if (successfulOrders.length > 0) {
    try {
      console.log('[shipment-service] batch tracking number retrieval started:', {
        timestamp: new Date().toISOString(),
        operation: 'batch_ship',
        successfulCount: successfulOrders.length,
        message: 'Starting batch tracking number retrieval'
      });

      // Group successful orders by shopId using cached orderShopIdMap
      for (const result of successfulOrders) {
        const shopId = orderShopIdMap.get(result.orderSn);
        if (shopId) {
          if (!successOrdersByShop.has(shopId)) {
            successOrdersByShop.set(shopId, []);
          }
          successOrdersByShop.get(shopId)!.push(result.orderSn);
        }
      }

      // For each shop, get package numbers then batch tracking
      for (const [shopId, shopOrderSns] of successOrdersByShop) {
        try {
          console.log('[shipment-service] retrieving tracking numbers for shop:', {
            timestamp: new Date().toISOString(),
            operation: 'batch_ship',
            shopId,
            orderCount: shopOrderSns.length
          });

          // Get package numbers from Phase 2 cache (avoid redundant searchPackageList call)
          const packageNumbers: string[] = [];
          const packageMap = new Map<string, string>(); // orderSn → packageNumber for tracking update
          for (const orderSn of shopOrderSns) {
            const pkgNum = allPackageMaps.get(orderSn);
            if (pkgNum) {
              packageNumbers.push(pkgNum);
              packageMap.set(orderSn, pkgNum);
            }
          }

          // Defensive fallback: if cache is empty, call getPackageNumbersForOrders
          if (packageNumbers.length === 0) {
            console.warn('[shipment-service] Phase 4: no cached package numbers, falling back to API:', {
              timestamp: new Date().toISOString(),
              operation: 'batch_ship',
              shopId,
              orderCount: shopOrderSns.length,
              message: 'Falling back to getPackageNumbersForOrders for tracking retrieval'
            });
            const fallbackResult = await getPackageNumbersForOrders(shopId, shopOrderSns);
            const fallbackPackageNumbers = Array.from(fallbackResult.packageMap.values()).filter(Boolean);
            if (fallbackPackageNumbers.length === 0) {
              console.warn('[shipment-service] no package numbers found for shop:', {
                timestamp: new Date().toISOString(),
                operation: 'batch_ship',
                shopId,
                message: 'Skipping tracking number retrieval'
              });
              continue;
            }
            packageNumbers.push(...fallbackPackageNumbers);
            for (const [orderSn, pkgNum] of fallbackResult.packageMap) {
              packageMap.set(orderSn, pkgNum);
            }
          }

          // Wait 1 second for Shopee to generate tracking numbers
          await new Promise(r => setTimeout(r, 1000));

          console.log('[shipment-service] API call: getMassTrackingNumber:', {
            timestamp: new Date().toISOString(),
            operation: 'api_call',
            apiEndpoint: 'get_mass_tracking_number',
            packageCount: packageNumbers.length,
            shopId,
            message: 'Calling getMassTrackingNumber API'
          });

          // Call getMassTrackingNumber with all package numbers
          const trackingResult = await getMassTrackingNumber(shopId, packageNumbers);
          const successList = trackingResult?.response?.success_list || [];
          const failList = trackingResult?.response?.fail_list || [];

          // **Validates: Requirement 10.3** - Log API call success with success/failure counts
          console.log('[shipment-service] API success: getMassTrackingNumber:', {
            timestamp: new Date().toISOString(),
            operation: 'api_success',
            apiEndpoint: 'get_mass_tracking_number',
            totalPackages: packageNumbers.length,
            successCount: successList.length,
            failCount: failList.length,
            shopId,
            message: `Tracking number retrieval completed: ${successList.length} succeeded, ${failList.length} failed`
          });

          // Process success_list: update database with tracking numbers
          const trackingMap = new Map<string, string>();
          for (const item of successList) {
            if (item.tracking_number) {
              trackingMap.set(item.package_number, item.tracking_number);
            }
          }

          // Update database and result objects with tracking numbers
          let updatedCount = 0;
          for (const [orderSn, packageNumber] of packageMap) {
            const trackingNumber = trackingMap.get(packageNumber);
            if (trackingNumber) {
              try {
                await db.update(shopeeOrders)
                  .set({ trackingNumber, packageNumber: packageNumber, updatedAt: new Date() })
                  .where(eq(shopeeOrders.orderSn, orderSn));

                // Update ShipmentResult object with tracking number
                const result = results.find(r => r.orderSn === orderSn);
                if (result) {
                  result.trackingNumber = trackingNumber;
                }
                updatedCount++;
              } catch (dbError: any) {
                console.error('[shipment-service] failed to update tracking number in database:', {
                  timestamp: new Date().toISOString(),
                  operation: 'batch_ship',
                  orderSn,
                  errorType: 'db_update',
                  message: dbError.message
                });
              }
            }
          }

          // Process fail_list: log warnings (non-fatal)
          if (failList.length > 0) {
            // **Validates: Requirement 10.4** - Log API failures with error details
            const failedPackages = failList.map((f: any) => ({
              packageNumber: f.package_number,
              errorType: 'tracking_unavailable',
              errorMessage: f.fail_reason || 'Tracking number not yet available'
            }));

            console.warn('[shipment-service] API failure: getMassTrackingNumber partial failures:', {
              timestamp: new Date().toISOString(),
              operation: 'api_failure',
              apiEndpoint: 'get_mass_tracking_number',
              errorType: 'tracking_unavailable',
              shopId,
              failCount: failList.length,
              errorDetails: failedPackages.slice(0, 5), // Log first 5 for brevity
              message: 'Some tracking numbers unavailable, will be available later via label service'
            });
          }

          console.log('[shipment-service] tracking numbers updated for shop:', {
            timestamp: new Date().toISOString(),
            operation: 'batch_ship',
            shopId,
            updatedCount,
            totalPackages: packageNumbers.length,
            message: `${updatedCount}/${packageNumbers.length} tracking numbers retrieved`
          });
        } catch (shopTrackingError: any) {
          // **Validates: Requirement 10.4** - Log API failures with error details
          console.warn('[shipment-service] API failure: tracking retrieval failed for shop:', {
            timestamp: new Date().toISOString(),
            operation: 'api_failure',
            apiEndpoint: 'get_mass_tracking_number',
            errorType: 'tracking_retrieval_error',
            shopId,
            affectedOrderCount: shopOrderSns.length,
            errorMessage: shopTrackingError.message,
            message: 'Non-fatal: tracking numbers will be available later via label service'
          });
        }
      }
    } catch (batchTrackingError: any) {
      // **Validates: Requirement 10.4** - Log API failures with error details
      console.warn('[shipment-service] API failure: batch tracking retrieval failed:', {
        timestamp: new Date().toISOString(),
        operation: 'api_failure',
        apiEndpoint: 'get_mass_tracking_number',
        errorType: 'batch_tracking_error',
        affectedOrderCount: successfulOrders.length,
        errorMessage: batchTrackingError.message,
        message: 'Non-fatal: tracking numbers will be available later via label service'
      });
    }
  }

  // ── PHASE 5: COMPLETION LOGGING ──
  // Log total order count, successful count, failed count, processing time, API call count
  // **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 10.5**
  
  const endTime = Date.now();
  const processingTime = endTime - startTime;
  const successfulCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  
  // Estimate API call count based on batch groups
  // Each batch group: 1 getMassShippingParameter + 1 massShipOrder = 2 calls
  // Plus 1 getMassTrackingNumber per shop with successful orders
  const estimatedApiCalls = (allBatchGroups.length * 2) + successOrdersByShop.size;

  console.log('[shipment-service] batch processing completed:', {
    timestamp: new Date().toISOString(),
    operation: 'batch_ship',
    totalOrders: orderSns.length,
    successfulCount,
    failedCount,
    processingTime: `${processingTime}ms`,
    processingTimeSeconds: `${(processingTime / 1000).toFixed(2)}s`,
    batchGroups: allBatchGroups.length,
    estimatedApiCalls,
    message: 'Batch shipment processing completed'
  });

  return results;
}