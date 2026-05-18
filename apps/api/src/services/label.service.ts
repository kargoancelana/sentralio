/**
 * Label Service
 * 
 * Service for managing shipping label operations including:
 * - Label eligibility validation
 * - Single label retrieval
 * - Batch label retrieval
 * - Integration with Shopee Logistics API
 * - Caching and performance optimization
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";
import { labelCache } from "./label-cache.service";
import { 
  getShippingParameter, 
  initLogistic, 
  getTrackingNumber, 
  getShippingDocumentParameter,
  createShippingDocument, 
  getShippingDocumentResult, 
  downloadShippingDocument 
} from "./shopee-label";
import { logLabelOperation, logPerformance, logBatchSummary } from "./label-logger";
import { LabelError, LabelErrorType, mapErrorToUserMessage, determineErrorType } from "./label-errors";

/**
 * Label document interface representing a shipping label
 */
export interface LabelDocument {
  orderSn: string;
  url: string;
  format: 'pdf' | 'png' | 'jpg';
  trackingNumber: string;
  retrievedAt: Date;
}

/**
 * Result interface for label operations
 */
export interface LabelResult {
  success: boolean;
  orderSn: string;
  label?: LabelDocument;
  error?: string;
}

/**
 * Order record interface for validation
 */
export interface OrderRecord {
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
 * Validate order eligibility for label printing
 * 
 * Checks:
 * 1. Order exists in database
 * 2. Order status is PROCESSED
 * 3. Order has tracking number (shipping_carrier field)
 * 
 * @param orderSn - Order serial number to validate
 * @returns Validation result with order data or error
 * 
 * **Validates: Requirements 2.2, 11.6**
 */
export async function validateLabelEligibility(orderSn: string): Promise<{
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

    // Check if order status allows label printing
    // PROCESSED: standard label printing after shipment
    // SHIPPED / TO_CONFIRM_RECEIVE: re-print for orders already in transit
    const LABEL_ELIGIBLE_STATUSES = ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE'];
    if (!LABEL_ELIGIBLE_STATUSES.includes(order.orderStatus)) {
      return {
        valid: false,
        error: `Order ${orderSn} tidak dapat dicetak labelnya: status saat ini adalah ${order.orderStatus}`
      };
    }

    // Note: We don't check for tracking number here because:
    // 1. shippingCarrier contains courier name, not tracking number
    // 2. Shopee API will generate tracking number when we create shipping document
    // 3. We only need order to be PROCESSED status

    return {
      valid: true,
      order: order as OrderRecord
    };
  } catch (error: any) {
    console.error('[label-service] validateLabelEligibility error:', {
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
 * Retrieve shipping label for a single order
 * 
 * Process:
 * 1. Validate order eligibility
 * 2. Check cache for existing label
 * 3. If cache miss, call Shopee API to retrieve label
 * 4. Store label in cache
 * 5. Return LabelResult with success/error
 * 
 * @param orderSn - Shopee order serial number
 * @returns Result with label data or error
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 6.7, 12.1, 12.2**
 */
export async function getSingleLabel(orderSn: string): Promise<LabelResult> {
  const startTime = Date.now();
  let shopId: number | undefined;

  try {
    // Log operation start
    logLabelOperation({
      orderSn,
      operationType: 'single',
      result: 'success',
      message: `Starting single label retrieval for order ${orderSn}`
    });

    // Step 1: Check cache FIRST — if label was already downloaded, return instantly
    // This ensures re-prints are fast even if order status changed (PROCESSED → SHIPPED)
    const cachedLabel = await labelCache.get(orderSn);
    
    if (cachedLabel) {
      const duration = Date.now() - startTime;
      
      logPerformance({
        operation: 'getSingleLabel_cache_hit',
        duration,
        orderSn,
        message: `Cache hit for order ${orderSn} (${duration}ms)`
      });

      return {
        success: true,
        orderSn,
        label: cachedLabel
      };
    }

    // Step 2: Cache miss — validate order eligibility before calling Shopee API
    const validationResult = await validateLabelEligibility(orderSn);
    
    if (!validationResult.valid) {
      const error = new LabelError(
        validationResult.error || 'Order validation failed',
        LabelErrorType.VALIDATION,
        orderSn
      );

      logLabelOperation({
        orderSn,
        operationType: 'validation',
        result: 'failure',
        message: `Order validation failed: ${validationResult.error}`,
        errorType: LabelErrorType.VALIDATION,
        errorMessage: validationResult.error
      });

      return {
        success: false,
        orderSn,
        error: mapErrorToUserMessage(error, orderSn)
      };
    }

    const order = validationResult.order!;
    shopId = order.shopId;


    // Step 3: Cache miss - retrieve from Shopee API
    logLabelOperation({
      orderSn,
      shopId,
      operationType: 'single',
      result: 'success',
      message: `Cache miss for order ${orderSn}, retrieving from Shopee API`
    });

    // For PROCESSED orders, use the correct Shopee workflow:
    // 1. get_shipping_parameter (check shipping mode)
    // 2. init_logistic (actually ship the order in Shopee)
    // 3. get_tracking_number (get AWB)
    // 4. create_shipping_document (generate label)
    // 5. get_shipping_document_result (polling until READY)
    // 6. download_shipping_document (get PDF)
    
    console.log('[label-service] Starting complete Shopee workflow for order:', orderSn);

    // Step 3a: Determine if order is already shipped
    // PROCESSED, SHIPPED, TO_CONFIRM_RECEIVE are all already shipped — skip initLogistic & getShippingParameter
    const isAlreadyShipped = ['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE'].includes(order.orderStatus);

    // Step 3b: Get shipping parameter to determine mode
    // SKIP for already PROCESSED orders - they don't need shipping parameter
    let shippingMode: 'pickup' | 'dropoff' | 'non_integrated' = 'pickup';
    let shippingParams: any = null;
    
    if (!isAlreadyShipped) {
      try {
        shippingParams = await getShippingParameter(shopId, orderSn);
        
        // Determine shipping mode from response
        if (shippingParams.result?.pickup) {
          shippingMode = 'pickup';
        } else if (shippingParams.result?.dropoff) {
          shippingMode = 'dropoff';
        } else if (shippingParams.result?.non_integrated) {
          shippingMode = 'non_integrated';
        }
        
        console.log('[label-service] Shipping mode determined:', shippingMode);
      } catch (paramError: any) {
        console.warn('[label-service] Could not get shipping parameter, using default pickup mode:', paramError.message);
        // Continue with default pickup mode
      }
    } else {
      console.log('[label-service] Order already PROCESSED, skipping get_shipping_parameter');
    }

    // Step 3c: Init logistic (actually ship the order in Shopee)
    // Skip if order is already PROCESSED (already shipped)
    let initResult: any = null;
    
    if (isAlreadyShipped) {
      console.log('[label-service] Order already PROCESSED, skipping initLogistic');
      
      // For already shipped orders, MUST get tracking number from Shopee
      // Without tracking number, create_shipping_document will fail
      if (!order.trackingNumber) {
        console.log('[label-service] Tracking number missing in database, fetching from Shopee (REQUIRED)');
        try {
          const trackingInfo = await getTrackingNumber(shopId, orderSn);
          const trackingNumber = trackingInfo?.response?.tracking_number 
            || trackingInfo?.result?.tracking_number;
          
          if (trackingNumber) {
            console.log('[label-service] Tracking number retrieved from Shopee:', trackingNumber);
            
            // Update database with tracking number
            await db.update(shopeeOrders)
              .set({
                trackingNumber: trackingNumber,
                updatedAt: new Date()
              })
              .where(eq(shopeeOrders.orderSn, orderSn));
            
            // Update local order object
            order.trackingNumber = trackingNumber;
            
            console.log('[label-service] Tracking number saved to database');
          } else {
            console.error('[label-service] CRITICAL: No tracking number in Shopee response');
            throw new Error('Tracking number tidak tersedia dari Shopee. Order mungkin belum di-ship dengan benar.');
          }
        } catch (trackingError: any) {
          console.error('[label-service] CRITICAL: Failed to fetch tracking number from Shopee:', trackingError.message);
          throw new Error(`Tracking number tidak tersedia: ${trackingError.message}. Tanpa tracking number, label tidak bisa dicetak.`);
        }
      } else {
        console.log('[label-service] Tracking number already in database:', order.trackingNumber);
      }
    } else {
      try {
        // For pickup mode, use default address and time slot
        const initOptions: any = {};
        
        if (shippingMode === 'pickup') {
          // Use first available address and pickup time from shipping params
          if (shippingParams?.result?.pickup?.address_list?.[0]) {
            initOptions.address_id = shippingParams.result.pickup.address_list[0].address_id;
          }
          if (shippingParams?.result?.pickup?.time_slot_list?.[0]) {
            initOptions.pickup_time_id = shippingParams.result.pickup.time_slot_list[0].pickup_time_id;
          }
        } else if (shippingMode === 'dropoff') {
          // Use first available branch from shipping params
          if (shippingParams?.result?.dropoff?.branch_list?.[0]) {
            initOptions.branch_id = shippingParams.result.dropoff.branch_list[0].branch_id;
          }
        }
        
        initResult = await initLogistic(shopId, orderSn, shippingMode, initOptions);
        console.log('[label-service] Order shipped successfully in Shopee');
      } catch (initError: any) {
        // Check if order is already shipped
        if (initError.message?.includes('already') || initError.message?.includes('sudah') || initError.message?.includes('error_not_found')) {
          console.log('[label-service] Order already shipped, continuing to label generation');
        } else {
          console.error('[label-service] Failed to ship order:', initError.message);
          throw new Error(`Gagal mengirim order di Shopee: ${initError.message}`);
        }
      }
    }

    // Step 3c: Get package_number from Shopee order details
    // For Indonesian orders, Shopee wraps orders in packages. ALL logistics document APIs
    // require package_number - without it, create_shipping_document fails with tracking_number_invalid
    let packageNumber: string | undefined;
    try {
      const { getShopeeOrderDetails } = await import("./shopee-raw");
      const orderDetails = await getShopeeOrderDetails(shopId, [orderSn]);
      const orderDetail = orderDetails?.response?.order_list?.[0] || orderDetails?.result?.order_list?.[0];
      
      // package_list contains the package_number for packaged orders
      if (orderDetail?.package_list?.length > 0) {
        packageNumber = orderDetail.package_list[0].package_number;
        console.log('[label-service] Package number found:', packageNumber);
      } else {
        console.log('[label-service] No package_list in order details, order may not be packaged');
      }
    } catch (pkgError: any) {
      console.warn('[label-service] Could not fetch package_number from order details:', pkgError.message);
    }

    // Step 3d: Get tracking number (ensure AWB exists)
    // Skip API call if tracking number already available from DB or earlier fetch
    let trackingNumber: string | undefined = order.trackingNumber || undefined;
    
    if (trackingNumber) {
      console.log('[label-service] Tracking number already available, skipping API call:', trackingNumber);
    } else {
      try {
        const trackingInfo = await getTrackingNumber(shopId, orderSn);
        
        trackingNumber = trackingInfo?.response?.tracking_number 
          || trackingInfo?.result?.tracking_number;
        
        if (trackingNumber) {
          console.log('[label-service] Tracking number retrieved from API:', trackingNumber);
          
          await db.update(shopeeOrders)
            .set({
              trackingNumber: trackingNumber,
              updatedAt: new Date()
            })
            .where(eq(shopeeOrders.orderSn, orderSn));
          
          order.trackingNumber = trackingNumber;
          console.log('[label-service] Tracking number saved to database');
        } else {
          console.warn('[label-service] No tracking number available from any source');
        }
      } catch (trackingError: any) {
        console.warn('[label-service] Could not get tracking number from API:', trackingError.message);
      }
    }

    // Step 3e: Get document parameters to determine correct document type
    let documentType = 'THERMAL_AIR_WAYBILL';
    try {
      const docParams = await getShippingDocumentParameter(shopId, orderSn, packageNumber);
      const orderResult = docParams?.response?.result_list?.[0] || docParams?.result?.result_list?.[0];
      if (orderResult?.suggest_shipping_document_type) {
        documentType = orderResult.suggest_shipping_document_type;
      }
      // If get_shipping_document_parameter returns package_number and we didn't have one
      if (!packageNumber && orderResult?.package_number) {
        packageNumber = orderResult.package_number;
        console.log('[label-service] Package number from doc params:', packageNumber);
      }
      console.log('[label-service] Document type:', documentType, 'Package:', packageNumber || 'none');
    } catch (docParamError: any) {
      console.warn('[label-service] Could not get shipping document parameter:', docParamError.message);
    }

    // Step 3f: Download or create shipping document
    let finalDocument: any = null;
    
    console.log('[label-service] Using tracking number for label:', trackingNumber || 'NONE');
    
    if (isAlreadyShipped) {
      // ── FAST PATH: Order already shipped (PROCESSED/SHIPPED/TO_CONFIRM_RECEIVE)
      // Label is almost certainly already created by Shopee after shipment.
      // Try direct download FIRST to skip the expensive create+poll cycle (~10s savings).
      console.log('[label-service] ⚡ Fast path: trying direct download first for already-shipped order');
      
      try {
        finalDocument = await downloadShippingDocument(shopId, orderSn, packageNumber, documentType);
        console.log('[label-service] ✅ Direct download succeeded — label already existed!');
      } catch (downloadError: any) {
        // Label doesn't exist yet (rare for shipped orders) — fallback to create+poll+download
        console.log('[label-service] Direct download failed, falling back to create+poll:', downloadError.message);
        
        try {
          await createShippingDocument(shopId, orderSn, documentType, packageNumber, trackingNumber);
          console.log('[label-service] Shipping document creation initiated (fallback)');
          
          // Poll with shorter interval (500ms instead of 2000ms)
          let documentReady = false;
          const maxAttempts = 10;
          
          for (let attempts = 0; attempts < maxAttempts; attempts++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
              await getShippingDocumentResult(shopId, orderSn, packageNumber);
              console.log(`[label-service] Document ready after ${attempts + 1} attempts (fallback)`);
              documentReady = true;
              break;
            } catch (error: any) {
              if (!error.message?.includes('belum tersedia')) throw error;
              console.log(`[label-service] Document still processing, attempt ${attempts + 1}/${maxAttempts}`);
            }
          }
          
          if (!documentReady) {
            throw new Error('Timeout: Label pengiriman tidak siap setelah polling.');
          }
          
          finalDocument = await downloadShippingDocument(shopId, orderSn, packageNumber, documentType);
          console.log('[label-service] PDF document downloaded after create+poll fallback');
        } catch (createError: any) {
          const errorHint = !trackingNumber 
            ? ' (Tracking number tidak tersedia)'
            : !packageNumber
            ? ' (Package number tidak tersedia)'
            : '';
          
          throw new Error(`Gagal mencetak label${errorHint}. download: ${downloadError.message}. create: ${createError.message}`);
        }
      }
    } else {
      // ── STANDARD PATH: First-time shipment (creating label for the first time)
      if (!trackingNumber) {
        console.error('[label-service] CRITICAL WARNING: No tracking number available. Label creation will likely fail.');
      }
      
      try {
        await createShippingDocument(shopId, orderSn, documentType, packageNumber, trackingNumber);
        console.log('[label-service] Shipping document creation initiated');
        
        // Poll with 500ms interval (was 2000ms)
        let documentReady = false;
        const maxAttempts = 10;
        
        for (let attempts = 0; attempts < maxAttempts; attempts++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          try {
            await getShippingDocumentResult(shopId, orderSn, packageNumber);
            console.log(`[label-service] Document ready after ${attempts + 1} attempts`);
            documentReady = true;
            break;
          } catch (error: any) {
            if (!error.message?.includes('belum tersedia')) throw error;
            console.log(`[label-service] Document still processing, attempt ${attempts + 1}/${maxAttempts}`);
          }
        }
        
        if (!documentReady) {
          throw new Error('Timeout: Label pengiriman tidak siap setelah 5 detik.');
        }
        
        finalDocument = await downloadShippingDocument(shopId, orderSn, packageNumber, documentType);
        console.log('[label-service] PDF document downloaded after create flow');
      } catch (createError: any) {
        const isTrackingInvalid = createError.message?.includes('tracking_number_invalid');
        const isTimeout = createError.message?.includes('Timeout');
        
        if (isTrackingInvalid || isTimeout) {
          console.log('[label-service] create failed, trying direct download as fallback...');
          
          try {
            finalDocument = await downloadShippingDocument(shopId, orderSn, packageNumber, documentType);
            console.log('[label-service] Direct download succeeded - document already existed!');
          } catch (downloadError: any) {
            const errorHint = !trackingNumber 
              ? ' (Tracking number tidak tersedia - order mungkin belum di-ship oleh Shopee)'
              : !packageNumber
              ? ' (Package number tidak tersedia - order mungkin belum di-package oleh Shopee)'
              : '';
            
            throw new Error(`Gagal mencetak label${errorHint}. create: ${createError.message}. download: ${downloadError.message}`);
          }
        } else {
          throw createError;
        }
      }
    }

    // Step 4: Create label document and store in cache
    let labelUrl: string;
    
    if (finalDocument.base64) {
      labelUrl = `data:application/pdf;base64,${finalDocument.base64}`;
    } else if (finalDocument.url) {
      labelUrl = finalDocument.url;
    } else {
      throw new Error('Label document tidak memiliki URL atau data base64');
    }

    // Extract tracking number from various sources
    let trackingNumberForLabel = 'Unknown';
    if (trackingNumber) {
      trackingNumberForLabel = trackingNumber;
    } else if (order.trackingNumber) {
      trackingNumberForLabel = order.trackingNumber;
    } else if (order.shippingCarrier) {
      trackingNumberForLabel = order.shippingCarrier;
    }

    const labelDocument: LabelDocument = {
      orderSn,
      url: labelUrl,
      format: finalDocument.format || 'pdf',
      trackingNumber: trackingNumberForLabel,
      retrievedAt: new Date()
    };

    // Store in cache
    await labelCache.set(orderSn, labelDocument);

    const duration = Date.now() - startTime;

    // Log successful operation
    logLabelOperation({
      orderSn,
      shopId,
      operationType: 'single',
      result: 'success',
      message: `Label successfully retrieved and cached for order ${orderSn}`,
      duration
    });

    logPerformance({
      operation: 'getSingleLabel_api_call',
      duration,
      orderSn,
      shopId,
      message: `API call completed for order ${orderSn}`
    });

    return {
      success: true,
      orderSn,
      label: labelDocument
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorType = determineErrorType(error);
    const userMessage = mapErrorToUserMessage(error, orderSn);

    // Log error
    logLabelOperation({
      orderSn,
      shopId,
      operationType: 'single',
      result: 'failure',
      message: `Failed to retrieve label for order ${orderSn}`,
      duration,
      errorType,
      errorMessage: error.message || String(error)
    });

    return {
      success: false,
      orderSn,
      error: userMessage
    };
  }
}

/**
 * Retrieve shipping labels for multiple orders
 * 
 * Process:
 * 1. Validate all orders for eligibility
 * 2. Process up to 5 orders concurrently using Promise.all
 * 3. Apply rate limiting (10 req/sec, 300ms delay between batches)
 * 4. Continue processing on individual failures
 * 5. Return array of LabelResult for each order
 * 
 * @param orderSns - Array of order serial numbers
 * @returns Array of results for each order
 * 
 * **Validates: Requirements 3.2, 3.3, 3.6, 13.5, 13.6, 12.3**
 */
export async function getBatchLabels(orderSns: string[]): Promise<LabelResult[]> {
  const startTime = Date.now();
  const results: LabelResult[] = [];
  
  // Configuration
  const MAX_CONCURRENT = 5; // Process up to 5 orders concurrently
  const DELAY_BETWEEN_BATCHES = 300; // 300ms delay between batches (rate limiting)
  
  try {
    // Step 1: Validate all orders for eligibility (quick validation pass)
    // This is done sequentially to fail fast if there are validation issues
    // However, we continue processing even if some orders fail validation
    
    // Step 2: Process orders in batches of MAX_CONCURRENT
    for (let i = 0; i < orderSns.length; i += MAX_CONCURRENT) {
      const batch = orderSns.slice(i, i + MAX_CONCURRENT);
      
      // Process batch concurrently
      const batchResults = await Promise.all(
        batch.map(async (orderSn) => {
          try {
            // Use getSingleLabel for each order (handles validation, cache, API calls, logging)
            return await getSingleLabel(orderSn);
          } catch (error: any) {
            // If getSingleLabel throws (shouldn't happen as it catches internally),
            // return a failure result
            return {
              success: false,
              orderSn,
              error: error.message || 'Terjadi kesalahan tidak terduga'
            } as LabelResult;
          }
        })
      );
      
      // Add batch results to overall results
      results.push(...batchResults);
      
      // Apply rate limiting delay between batches (except for last batch)
      if (i + MAX_CONCURRENT < orderSns.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Step 3: Log batch summary
    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    logBatchSummary({
      total: orderSns.length,
      successful,
      failed,
      duration,
      message: `Batch label retrieval completed: ${successful}/${orderSns.length} successful`
    });
    
    return results;
    
  } catch (error: any) {
    // This catch block handles unexpected errors in the batch processing logic itself
    // Individual order failures are already handled within getSingleLabel
    
    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    logBatchSummary({
      total: orderSns.length,
      successful,
      failed,
      duration,
      message: `Batch label retrieval failed: ${error.message}`
    });
    
    // Return results collected so far, plus failures for remaining orders
    const processedOrderSns = new Set(results.map(r => r.orderSn));
    const remainingOrders = orderSns.filter(sn => !processedOrderSns.has(sn));
    
    const remainingResults: LabelResult[] = remainingOrders.map(orderSn => ({
      success: false,
      orderSn,
      error: 'Batch processing interrupted'
    }));
    
    return [...results, ...remainingResults];
  }
}


// ═══════════════════════════════════════════════════════════════════
// OPTIMIZED BATCH LABEL ASLI — Uses batch APIs (6-8 calls for 50 orders)
// ═══════════════════════════════════════════════════════════════════

import {
  createShippingDocumentBatch,
  getShippingDocumentResultBatch,
  downloadShippingDocumentBatch
} from "./shopee-label";

/**
 * Split an array into chunks of a given size.
 * Used to respect Shopee's 50-item-per-call limit for batch APIs.
 *
 * @param arr - The array to split
 * @param size - Maximum chunk size (must be > 0)
 * @returns Array of chunks, each with at most `size` items
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Helper: Create shipping documents, poll for readiness, and download PDFs.
 * Used as fallback when direct download fails (labels not yet created).
 * Early-exits if all failures are tracking_number_invalid (orders need more time after ship).
 */
async function createPollAndDownload(
  shopId: number,
  orders: Array<{ order_sn: string; package_number: string }>,
  channelMap: Map<string, number>,
  failedOrders: Array<{ orderSn: string; error: string }>,
  batchChunkSize: number
): Promise<string[]> {
  const pdfBuffers: string[] = [];

  // ── Pre-step: Fetch tracking numbers for orders that don't have them ──
  // This prevents "tracking_number_invalid" errors during create_shipping_document
  // Uses getMassTrackingNumber (1 API call for all orders) — no spam
  try {
    const { getMassTrackingNumber } = await import("./shopee-label");
    const packageNumbers = orders.map(o => o.package_number);
    
    console.log('[label-service] createPollAndDownload: fetching tracking numbers for', orders.length, 'orders');
    const trackingResult = await getMassTrackingNumber(shopId, packageNumbers);
    const successList = trackingResult?.response?.success_list || [];
    
    // Build tracking map: package_number → tracking_number
    const trackingMap = new Map<string, string>();
    for (const item of successList) {
      if (item.tracking_number) {
        trackingMap.set(item.package_number, item.tracking_number);
      }
    }

    // Update DB with tracking numbers (fire-and-forget, non-blocking)
    if (trackingMap.size > 0) {
      const { db } = await import("../db/client");
      const { shopeeOrders } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      
      for (const order of orders) {
        const tn = trackingMap.get(order.package_number);
        if (tn) {
          // Attach tracking to order object for use in create_shipping_document
          (order as any).tracking_number = tn;
          db.update(shopeeOrders)
            .set({ trackingNumber: tn })
            .where(eq(shopeeOrders.orderSn, order.order_sn))
            .execute()
            .catch(() => {});
        }
      }
      console.log('[label-service] createPollAndDownload: got tracking numbers for', trackingMap.size, '/', orders.length, 'orders');
    }
  } catch (e: any) {
    // Non-fatal: if tracking fetch fails, create_shipping_document will still try
    console.warn('[label-service] createPollAndDownload: tracking fetch failed (non-fatal):', e.message);
  }

  // Create shipping documents (with tracking numbers from pre-step)
  const createOrders = orders.map(o => ({
    order_sn: o.order_sn,
    package_number: o.package_number,
    tracking_number: (o as any).tracking_number || undefined,
    shipping_document_type: 'THERMAL_AIR_WAYBILL'
  }));

  const createChunks = chunkArray(createOrders, batchChunkSize);
  const mergedCreateResult: { successOrders: string[]; failedOrders: Array<{ order_sn: string; fail_error: string; fail_message: string }> } = {
    successOrders: [],
    failedOrders: []
  };

  for (const chunk of createChunks) {
    const chunkResult = await createShippingDocumentBatch(shopId, chunk as any);
    mergedCreateResult.successOrders.push(...chunkResult.successOrders);
    mergedCreateResult.failedOrders.push(...chunkResult.failedOrders);
  }

  // Record create failures
  for (const fail of mergedCreateResult.failedOrders) {
    failedOrders.push({ orderSn: fail.order_sn, error: `${fail.fail_error}: ${fail.fail_message}` });
  }

  // Early-exit: if ALL failures are tracking_number_invalid, skip polling
  const allTrackingInvalid = mergedCreateResult.failedOrders.length > 0 &&
    mergedCreateResult.failedOrders.every(f =>
      f.fail_error?.includes('tracking_number_invalid') || f.fail_message?.includes('tracking number is invalid')
    );

  if (allTrackingInvalid && mergedCreateResult.successOrders.length === 0) {
    console.log('[label-service] createPollAndDownload: all failures are tracking_number_invalid, skipping poll');
    return pdfBuffers;
  }

  // Filter to only successfully created orders
  const ordersToDownload = orders.filter(o =>
    mergedCreateResult.successOrders.includes(o.order_sn)
  );

  if (ordersToDownload.length === 0) return pdfBuffers;

  // Poll for readiness (max 6 polls × 800ms = 4.8s max)
  const maxPolls = 6;
  const readyOrders: string[] = [];
  let processingOrders = [...ordersToDownload];

  for (let poll = 0; poll < maxPolls; poll++) {
    await new Promise(r => setTimeout(r, 800));
    if (processingOrders.length === 0) break;

    const pollChunks = chunkArray(processingOrders, batchChunkSize);
    const newReady: string[] = [];
    const stillProcessing: Array<{ order_sn: string; package_number: string }> = [];

    for (const chunk of pollChunks) {
      try {
        const status = await getShippingDocumentResultBatch(
          shopId,
          chunk as Array<{ order_sn: string; package_number?: string }>
        );
        newReady.push(...status.ready);
        for (const fail of status.failed) {
          failedOrders.push({ orderSn: fail.order_sn, error: `${fail.fail_error}: ${fail.fail_message}` });
        }
        // Keep only processing orders
        const doneSet = new Set([...status.ready, ...status.failed.map(f => f.order_sn)]);
        stillProcessing.push(...chunk.filter(o => !doneSet.has(o.order_sn)));
      } catch {
        stillProcessing.push(...chunk);
      }
    }

    readyOrders.push(...newReady);
    processingOrders = stillProcessing;
  }

  // Timeout remaining
  for (const order of processingOrders) {
    failedOrders.push({ orderSn: order.order_sn, error: 'Timeout: label belum siap setelah polling' });
  }

  // Download ready orders grouped by channel
  const finalOrders = ordersToDownload.filter(o => readyOrders.includes(o.order_sn));
  if (finalOrders.length === 0) return pdfBuffers;

  const byChannel = new Map<number | 'unknown', Array<{ order_sn: string; package_number: string }>>();
  for (const order of finalOrders) {
    const ch = channelMap.get(order.order_sn) || 'unknown';
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch)!.push(order);
  }

  for (const [, channelOrders] of byChannel) {
    const chunks = chunkArray(channelOrders, batchChunkSize);
    for (const chunk of chunks) {
      try {
        const result = await downloadShippingDocumentBatch(
          shopId,
          chunk as Array<{ order_sn: string; package_number?: string }>,
          'THERMAL_AIR_WAYBILL'
        );
        pdfBuffers.push(result.base64);
      } catch (err: any) {
        for (const order of chunk) {
          failedOrders.push({ orderSn: order.order_sn, error: err.message });
        }
      }
    }
  }

  return pdfBuffers;
}

/**
 * Optimized batch retrieval of official Shopee labels (PDF).
 * Uses batch APIs to minimize API calls:
 * 1. get_order_detail (batch 50) → package_numbers
 * 2. Try download_shipping_document (batch) → if labels already exist
 * 3. If not: create_shipping_document (batch) → poll get_shipping_document_result (batch) → download (batch)
 * 
 * Returns a single merged PDF containing all labels.
 * 
 * @param orderSns - Array of order serial numbers (max 50)
 * @returns Result with merged PDF base64 URL or per-order errors
 */
export async function getBatchLabelsOptimized(orderSns: string[]): Promise<{
  success: boolean;
  pdfUrl?: string;
  pdfUrls?: string[];
  successCount: number;
  failedOrders: Array<{ orderSn: string; error: string }>;
}> {
  const startTime = Date.now();
  const failedOrders: Array<{ orderSn: string; error: string }> = [];

  console.log('[label-service] getBatchLabelsOptimized started:', { count: orderSns.length });

  try {
    // ── Step 0: Check cache for all orders — instant reprint if all cached ──
    const cachedPdfs: string[] = [];
    const uncachedOrderSns: string[] = [];

    for (const orderSn of orderSns) {
      const cached = await labelCache.get(orderSn);
      if (cached && cached.url) {
        // Extract base64 from data URL
        const base64Match = cached.url.match(/^data:application\/pdf;base64,(.+)$/);
        if (base64Match && base64Match[1]) {
          cachedPdfs.push(base64Match[1]);
        } else {
          uncachedOrderSns.push(orderSn);
        }
      } else {
        uncachedOrderSns.push(orderSn);
      }
    }

    // If ALL orders are cached, merge and return immediately (0 API calls)
    if (uncachedOrderSns.length === 0 && cachedPdfs.length > 0) {
      const { mergePdfBuffers } = await import('./pdf-merge');
      const mergedBase64 = await mergePdfBuffers(cachedPdfs);
      const pdfUrl = `data:application/pdf;base64,${mergedBase64}`;
      const duration = Date.now() - startTime;
      console.log('[label-service] ⚡ batch reprint ALL from cache:', { duration: `${duration}ms`, orders: orderSns.length });
      return { success: true, pdfUrl, successCount: orderSns.length, failedOrders: [] };
    }

    // If MOST are cached (>50%), merge cached + only fetch uncached from Shopee
    // This avoids re-downloading already-cached labels
    if (cachedPdfs.length > 0 && uncachedOrderSns.length > 0) {
      console.log('[label-service] batch: partial cache hit, fetching only uncached orders from Shopee:', { cached: cachedPdfs.length, uncached: uncachedOrderSns.length, total: orderSns.length });
      
      // Recursively fetch only uncached orders
      const uncachedResult = await getBatchLabelsOptimized(uncachedOrderSns);
      
      // Merge cached PDFs with freshly fetched ones (maintain original order)
      const allPdfBuffers: string[] = [];
      let uncachedIdx = 0;
      const uncachedPdfBuffers: string[] = [];
      
      // Extract base64 from uncached result
      if (uncachedResult.pdfUrl) {
        const match = uncachedResult.pdfUrl.match(/^data:application\/pdf;base64,(.+)$/);
        if (match) uncachedPdfBuffers.push(match[1]);
      }
      
      // Build merged PDF in original order: cached first, then uncached
      // (Shopee batch download already handles ordering within each group)
      allPdfBuffers.push(...cachedPdfs);
      allPdfBuffers.push(...uncachedPdfBuffers);
      
      // Merge all
      if (allPdfBuffers.length > 0) {
        const { mergePdfBuffers } = await import('./pdf-merge');
        const mergedBase64 = await mergePdfBuffers(allPdfBuffers);
        const pdfUrl = `data:application/pdf;base64,${mergedBase64}`;
        const duration = Date.now() - startTime;
        const totalSuccess = cachedPdfs.length + uncachedResult.successCount;
        console.log('[label-service] ⚡ batch partial cache merge:', { duration: `${duration}ms`, cached: cachedPdfs.length, fetched: uncachedResult.successCount, total: totalSuccess });
        return { success: true, pdfUrl, successCount: totalSuccess, failedOrders: uncachedResult.failedOrders };
      }
      
      // If no PDFs at all, return uncached result as-is
      return uncachedResult;
    }

    console.log('[label-service] batch cache check:', { cached: cachedPdfs.length, uncached: uncachedOrderSns.length, total: orderSns.length });

    // ── Step 1: Validate orders and get shopId ──
    const validOrders: Array<{ orderSn: string; shopId: number; trackingNumber?: string; shippingCarrier?: string }> = [];

    for (const orderSn of orderSns) {
      const validation = await validateLabelEligibility(orderSn);
      if (validation.valid) {
        validOrders.push({
          orderSn,
          shopId: validation.order!.shopId,
          trackingNumber: (validation.order as any).trackingNumber || undefined,
          shippingCarrier: (validation.order as any).shippingCarrier || undefined
        });
      } else {
        failedOrders.push({ orderSn, error: validation.error || 'Validation failed' });
      }
    }

    if (validOrders.length === 0) {
      return { success: false, successCount: 0, failedOrders };
    }

    // ── Shop ID consistency check ──
    const uniqueShopIds = new Set(validOrders.map(o => o.shopId));
    if (uniqueShopIds.size > 1) {
      return {
        success: false,
        successCount: 0,
        failedOrders: validOrders.map(o => ({
          orderSn: o.orderSn,
          error: 'Semua order dalam batch harus dari shop yang sama'
        }))
      };
    }
    const shopId = validOrders[0].shopId;

    // ── Step 2: Get package_numbers via batch get_order_detail (1 API call for up to 50) ──
    const { getShopeeOrderDetails } = await import("./shopee-raw");

    const ORDER_DETAIL_TIMEOUT_MS = 15_000;
    let orderDetails: any;
    try {
      orderDetails = await Promise.race([
        getShopeeOrderDetails(shopId, validOrders.map(o => o.orderSn)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('__TIMEOUT__')), ORDER_DETAIL_TIMEOUT_MS)
        )
      ]);
    } catch (err: any) {
      if (err?.message === '__TIMEOUT__') {
        return {
          success: false,
          successCount: 0,
          failedOrders: [{ orderSn: 'batch', error: 'Timeout saat mengambil detail order' }]
        };
      }
      throw err;
    }

    // Check for API-level error (non-empty error field in response)
    if (orderDetails?.error) {
      return {
        success: false,
        successCount: 0,
        failedOrders: [{ orderSn: 'batch', error: orderDetails.error }]
      };
    }

    const orderDetailList = orderDetails?.response?.order_list || [];

    // Build package map and channel map, track orders present in the response
    const packageMap = new Map<string, string>();
    const channelMap = new Map<string, number>(); // orderSn → logistics_channel_id
    const responseOrderSns = new Set<string>();
    for (const detail of orderDetailList) {
      responseOrderSns.add(detail.order_sn);
      if (detail.package_list && detail.package_list.length > 0 && detail.package_list[0].package_number) {
        packageMap.set(detail.order_sn, detail.package_list[0].package_number);
        // Extract logistics_channel_id from package_list (primary source)
        if (detail.package_list[0].logistics_channel_id) {
          channelMap.set(detail.order_sn, detail.package_list[0].logistics_channel_id);
        }
      }
      // Fallback: logistics_channel_id at order level (some Shopee responses have it here)
      if (!channelMap.has(detail.order_sn) && detail.logistics_channel_id) {
        channelMap.set(detail.order_sn, detail.logistics_channel_id);
      }
    }

    // Secondary fallback: use shipping_carrier from DB as channel proxy
    // Orders with same carrier name are likely same channel
    if (channelMap.size < packageMap.size) {
      const carrierToChannel = new Map<string, number>();
      let syntheticChannelId = -1;
      for (const order of validOrders) {
        if (packageMap.has(order.orderSn) && !channelMap.has(order.orderSn)) {
          // Look up carrier from DB (already loaded in validOrders)
          const carrier = order.shippingCarrier || 'unknown';
          if (!carrierToChannel.has(carrier)) {
            carrierToChannel.set(carrier, syntheticChannelId--);
          }
          channelMap.set(order.orderSn, carrierToChannel.get(carrier)!);
        }
      }
      console.log('[label-service] batch: used carrier-based channel fallback for', packageMap.size - (channelMap.size - carrierToChannel.size), 'orders');
    }

    // Check for orders absent from API response or missing package_number
    for (const order of validOrders) {
      if (!responseOrderSns.has(order.orderSn)) {
        // Order was in request but not in get_order_detail response
        failedOrders.push({ orderSn: order.orderSn, error: `Order ${order.orderSn} tidak ditemukan di Shopee` });
      } else if (!packageMap.has(order.orderSn)) {
        // Order is in response but has empty/missing package_list or missing package_number
        failedOrders.push({ orderSn: order.orderSn, error: `Package number tidak tersedia untuk order ${order.orderSn}` });
      }
    }

    console.log('[label-service] batch: package_numbers fetched:', { found: packageMap.size, total: validOrders.length });

    // ── Step 3: Build order list for batch download ──
    const batchOrders = validOrders
      .filter(o => packageMap.has(o.orderSn))
      .map(o => ({
        order_sn: o.orderSn,
        package_number: packageMap.get(o.orderSn)!
      }));

    if (batchOrders.length === 0) {
      return { success: false, successCount: 0, failedOrders };
    }

    // ── Step 4: Try direct batch download first (fast path) ──
    // If labels were already created (e.g., by Shopee after ship_order), this returns immediately
    // CRITICAL: Shopee cannot merge labels from different logistics channels into 1 PDF.
    // We must group orders by logistics_channel_id and download each group separately.
    const BATCH_CHUNK_SIZE = 50;

    // Group batchOrders by logistics_channel_id
    const ordersByChannel = new Map<number | 'unknown', Array<{ order_sn: string; package_number: string }>>();
    for (const order of batchOrders) {
      const channelId = channelMap.get(order.order_sn) || 'unknown';
      if (!ordersByChannel.has(channelId)) ordersByChannel.set(channelId, []);
      ordersByChannel.get(channelId)!.push(order);
    }

    console.log('[label-service] batch: orders grouped by channel:', 
      Array.from(ordersByChannel.entries()).map(([ch, orders]) => ({ channel: ch, count: orders.length }))
    );

    try {
      const allPdfBuffers: string[] = [];
      const fallbackOrders: Array<{ order_sn: string; package_number: string }> = []; // orders that need create+poll

      for (const [, channelOrders] of ordersByChannel) {
        const chunks = chunkArray(channelOrders, BATCH_CHUNK_SIZE);
        for (const chunk of chunks) {
          try {
            const result = await downloadShippingDocumentBatch(
              shopId,
              chunk as Array<{ order_sn: string; package_number?: string }>,
              'THERMAL_AIR_WAYBILL'
            );
            allPdfBuffers.push(result.base64);
          } catch (chunkError: any) {
            // If "packages_can_not_download_together" → download each order individually
            if (chunkError.message?.includes('packages_can_not_download_together') || chunkError.message?.includes('can not download together')) {
              console.log('[label-service] batch: channel group download failed (mixed channels), falling back to per-order download for this chunk');
              for (const order of chunk) {
                try {
                  const singleResult = await downloadShippingDocumentBatch(
                    shopId,
                    [order as { order_sn: string; package_number?: string }],
                    'THERMAL_AIR_WAYBILL'
                  );
                  allPdfBuffers.push(singleResult.base64);
                } catch (singleErr: any) {
                  // If fallback required for this order, queue it for create+poll
                  if (singleErr.message?.includes('[FALLBACK_REQUIRED]')) {
                    fallbackOrders.push(order as { order_sn: string; package_number: string });
                  } else {
                    failedOrders.push({ orderSn: order.order_sn, error: singleErr.message });
                  }
                }
              }
            } else if (chunkError.message?.includes('[FALLBACK_REQUIRED]')) {
              // These orders need create+poll — queue them but don't discard already-downloaded PDFs
              console.log('[label-service] batch: chunk needs create+poll, queuing', chunk.length, 'orders for fallback');
              fallbackOrders.push(...(chunk as Array<{ order_sn: string; package_number: string }>));
            } else {
              // Other error — record all orders in chunk as failed
              for (const order of chunk) {
                failedOrders.push({ orderSn: order.order_sn, error: chunkError.message });
              }
            }
          }
        }
      }

      // If we have some PDFs from fast path AND some orders need fallback
      if (allPdfBuffers.length > 0 && fallbackOrders.length > 0) {
        console.log('[label-service] batch: partial fast path success, attempting create+poll for remaining', fallbackOrders.length, 'orders');
        
        // Try create+poll for fallback orders only
        const fallbackPdfs = await createPollAndDownload(shopId, fallbackOrders, channelMap, failedOrders, BATCH_CHUNK_SIZE);
        allPdfBuffers.push(...fallbackPdfs);
      } else if (allPdfBuffers.length === 0 && fallbackOrders.length > 0) {
        // All orders need fallback
        const fallbackPdfs = await createPollAndDownload(shopId, fallbackOrders, channelMap, failedOrders, BATCH_CHUNK_SIZE);
        allPdfBuffers.push(...fallbackPdfs);
      }

      if (allPdfBuffers.length > 0) {
        const { mergePdfBuffers } = await import('./pdf-merge');
        const mergedBase64 = await mergePdfBuffers(allPdfBuffers);
        const pdfUrl = `data:application/pdf;base64,${mergedBase64}`;
        const successCount = batchOrders.length - failedOrders.filter(f => batchOrders.some(b => b.order_sn === f.orderSn)).length;
        const duration = Date.now() - startTime;
        console.log('[label-service] ⚡ batch download completed:', { duration: `${duration}ms`, orders: successCount, pdfs: allPdfBuffers.length, channels: ordersByChannel.size, fallback: fallbackOrders.length });

        // Fire-and-forget: cache each order's label individually for instant reprints
        // getSingleLabel will fast-path download (label exists) and save to cache
        Promise.resolve().then(async () => {
          for (const order of batchOrders) {
            try {
              await getSingleLabel(order.order_sn);
            } catch { /* non-critical */ }
          }
          console.log('[label-service] batch: background cache population complete for', batchOrders.length, 'orders');
        }).catch(() => { /* ignore */ });

        return { success: true, pdfUrl, successCount, failedOrders };
      }

      // No PDFs at all
      if (failedOrders.length === 0) {
        failedOrders.push({ orderSn: 'batch', error: 'No labels could be downloaded' });
      }
      return { success: false, successCount: 0, failedOrders };

    } catch (downloadError: any) {
      console.error('[label-service] batch download: unexpected error:', downloadError.message);
      return {
        success: false,
        successCount: 0,
        failedOrders: [...failedOrders, { orderSn: 'batch', error: downloadError.message }]
      };
    }

  } catch (error: any) {
    console.error('[label-service] getBatchLabelsOptimized failed:', error.message);
    const allFailed = failedOrders.length > 0
      ? [...failedOrders, { orderSn: 'batch', error: error.message }]
      : [{ orderSn: 'batch', error: error.message }];
    return { success: false, successCount: 0, failedOrders: allFailed };
  }
}
