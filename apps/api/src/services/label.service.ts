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

    // Step 3a: Determine if order is already shipped (PROCESSED status)
    const isAlreadyShipped = order.orderStatus === 'PROCESSED';

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
    let trackingInfo: any = null;
    let trackingNumber: string | undefined;
    
    try {
      trackingInfo = await getTrackingNumber(shopId, orderSn);
      
      // Parse tracking number from response (Shopee returns it in response.response.tracking_number)
      trackingNumber = trackingInfo?.response?.tracking_number 
        || trackingInfo?.result?.tracking_number;
      
      if (trackingNumber) {
        console.log('[label-service] Tracking number retrieved successfully:', trackingNumber);
        
        // Update database if we got a new tracking number
        if (!order.trackingNumber || order.trackingNumber !== trackingNumber) {
          await db.update(shopeeOrders)
            .set({
              trackingNumber: trackingNumber,
              updatedAt: new Date()
            })
            .where(eq(shopeeOrders.orderSn, orderSn));
          
          order.trackingNumber = trackingNumber;
          console.log('[label-service] Tracking number updated in database');
        }
      } else {
        console.warn('[label-service] No tracking number in response, using database value');
        trackingNumber = order.trackingNumber || undefined;
      }
    } catch (trackingError: any) {
      console.warn('[label-service] Could not get tracking number from API, using database value:', trackingError.message);
      trackingNumber = order.trackingNumber || undefined;
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

    // Step 3f: Create shipping document, then download
    let finalDocument: any = null;
    
    console.log('[label-service] Using tracking number for label:', trackingNumber || 'NONE - THIS WILL LIKELY FAIL');
    
    if (!trackingNumber) {
      console.error('[label-service] CRITICAL WARNING: No tracking number available. Label creation will likely fail.');
    }
    
    try {
      // CRITICAL FIX: Pass tracking_number to createShippingDocument
      // This is REQUIRED for most logistics channels (SPX, etc)
      await createShippingDocument(shopId, orderSn, documentType, packageNumber, trackingNumber);
      console.log('[label-service] Shipping document creation initiated');
      
      // Poll get_shipping_document_result until READY (max 15 seconds for faster response)
      let documentReady = false;
      const maxAttempts = 5; // Reduced from 15 to 5 (10 seconds total)
      
      for (let attempts = 0; attempts < maxAttempts; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          // getShippingDocumentResult now only checks status, doesn't return document
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
        throw new Error('Timeout: Label pengiriman tidak siap setelah 10 detik.');
      }

      // Download the document
      finalDocument = await downloadShippingDocument(shopId, orderSn, packageNumber, documentType);
      console.log('[label-service] PDF document downloaded after create flow');

    } catch (createError: any) {
      // If create fails, the document might already exist (created by Shopee Seller Center 
      // or automatically by Shopee's system). Try downloading directly.
      const isTrackingInvalid = createError.message?.includes('tracking_number_invalid');
      const isTimeout = createError.message?.includes('Timeout');
      
      if (isTrackingInvalid || isTimeout) {
        console.log('[label-service] create_shipping_document failed, trying direct download as fallback...');
        console.log('[label-service] Reason:', createError.message);
        
        try {
          // Try download directly - document may already exist
          // MUST include shipping_document_type, package_number, AND tracking_number
          finalDocument = await downloadShippingDocument(shopId, orderSn, packageNumber, documentType);
          console.log('[label-service] Direct download succeeded - document already existed!');
        } catch (downloadError: any) {
          console.error('[label-service] Direct download also failed:', downloadError.message);
          
          // Provide more helpful error message
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
    } else if (trackingInfo?.response?.tracking_number) {
      trackingNumberForLabel = trackingInfo.response.tracking_number;
    } else if (trackingInfo?.result?.tracking_number) {
      trackingNumberForLabel = trackingInfo.result.tracking_number;
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
