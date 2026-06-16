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

import { eq, inArray } from "drizzle-orm";
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
import { logLabelOperation, logPerformance, logBatchSummary, logInfo } from "./label-logger.util";
import { LabelError, LabelErrorType, mapErrorToUserMessage, determineErrorType } from "./label-errors.util";
import {
  validateLabelEligibility as _validateLabelEligibility,
  batchValidateLabelEligibility as _batchValidateLabelEligibility,
  type OrderRecord,
} from "./label-validation.service";

// Re-export from label-validation.service for backward compatibility
export { validateLabelEligibility, batchValidateLabelEligibility } from "./label-validation.service";
export type { OrderRecord } from "./label-validation.service";

// ─────────────────────────────────────────────────────────────────────────────
// Module-level constants (Requirement 7.1, 7.7, 7.8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated since v2 — only referenced by classifyChunkFreshness (deprecated).
 */
const STALE_SHIP_THRESHOLD_MS = 86_400_000;

/** Concurrent downloads per chunk for Background_Cache_Populate. Range 1..10. */
const PARALLEL_CHUNK_SIZE = 5;

/** Minimum delay (ms) between parallel chunks. Range 0..2000. */
const CHUNK_DELAY_MS = 300;

/**
 * Adaptive backoff for polling shipping_document_result.
 * Total max wait = sum(POLL_BACKOFF_MS) = 6300 ms = 6.3 s.
 */
const POLL_BACKOFF_MS: readonly number[] = [300, 500, 800, 1200, 1500, 2000];

/** Timeout per downloadShippingDocument call in Background_Cache_Populate. 30 seconds. */
const BG_DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * @deprecated since v2 — only referenced by classifyChunkFreshness (deprecated).
 */
const STALE_QUERY_TIMEOUT_MS = 2_000;

/** Fallback intervals when POLL_BACKOFF_MS is invalid (Requirement 3.7). */
const POLL_FALLBACK_CREATEPOLL_MS = 800;
const POLL_FALLBACK_CREATEPOLL_COUNT = 6;
const POLL_FALLBACK_SINGLE_MS = 500;
const POLL_FALLBACK_SINGLE_COUNT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// File-local helper utilities (not exported)
// ─────────────────────────────────────────────────────────────────────────────

/** Sleep helper: resolves after `ms` milliseconds. */
const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

/**
 * Race a promise against a timeout.
 * Rejects with an Error whose message contains `__TIMEOUT_<ms>__` on timeout.
 */
async function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`__TIMEOUT_${ms}__`)), ms)),
  ]);
}

/**
 * Emit a structured log payload via logInfo, swallowing any logger errors.
 * Requirement 10.5: logger failures MUST NOT propagate as errors to the caller.
 */
function emitLog(payload: Record<string, any>): void {
  try {
    logInfo(`[label-optimization] ${payload.operation}`, payload);
  } catch {
    /* Requirement 10.5: swallow logger errors */
  }
}

/**
 * Return a fresh copy of POLL_BACKOFF_MS intervals, validated for use in polling loops.
 *
 * - If POLL_BACKOFF_MS is undefined/empty or contains any invalid value (non-integer,
 *   < 100, or > 10000), emits a `poll_config_invalid` log and returns conservative
 *   fallback intervals appropriate for the given context.
 * - Otherwise returns a mutable copy of the constant array.
 *
 * @param context - 'createPoll' → fallback 800 ms × 6; 'single' → fallback 500 ms × 10
 * @returns number[] — array of sleep intervals in milliseconds (length ≥ 1)
 *
 * **Validates: Requirement 3.7**
 */
function getPollIntervals(context: 'createPoll' | 'single'): number[] {
  if (!Array.isArray(POLL_BACKOFF_MS) || POLL_BACKOFF_MS.length === 0) {
    emitLog({ operation: 'poll_config_invalid', reason: 'undefined or empty', context });
    return context === 'createPoll'
      ? new Array(POLL_FALLBACK_CREATEPOLL_COUNT).fill(POLL_FALLBACK_CREATEPOLL_MS)
      : new Array(POLL_FALLBACK_SINGLE_COUNT).fill(POLL_FALLBACK_SINGLE_MS);
  }
  for (const v of POLL_BACKOFF_MS) {
    if (!Number.isInteger(v) || v < 100 || v > 10_000) {
      emitLog({ operation: 'poll_config_invalid', reason: `bad value: ${v}`, context });
      return context === 'createPoll'
        ? new Array(POLL_FALLBACK_CREATEPOLL_COUNT).fill(POLL_FALLBACK_CREATEPOLL_MS)
        : new Array(POLL_FALLBACK_SINGLE_COUNT).fill(POLL_FALLBACK_SINGLE_MS);
    }
  }
  return [...POLL_BACKOFF_MS];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types (file-local, not exported)
// ─────────────────────────────────────────────────────────────────────────────

type FreshnessDecision = {
  action: 'wait_5s' | 'skip_to_fallback';
  freshCount: number;
  staleCount: number;
};

type BackgroundCacheResult = 'success' | 'failure';

/**
 * @deprecated since v2 — fallback_decision log is no longer emitted (Requirement 1.3, 6.1).
 */
type FallbackDecisionLog = {
  operation: 'fallback_decision';
  chunkSize: number;     // 1..50
  freshOrders: number;   // ≥ 0
  staleOrders: number;   // ≥ 0
  decision: 'wait_5s' | 'skip_to_fallback';
};

type PollAttemptLog = {
  operation: 'poll_attempt';
  pollIndex: number;     // 1..POLL_BACKOFF_MS.length
  delayMs: number;       // ≥ 0
  readyCount: number;    // ≥ 0
  pendingCount: number;  // ≥ 0
};

type BackgroundCachePopulateLog = {
  operation: 'background_cache_populate';
  orderSn: string;
  durationMs: number;
  chunkIndex: number;    // ≥ 0
  result: BackgroundCacheResult;
  error?: string;
};

type BackgroundCacheSummaryLog = {
  operation: 'background_cache_summary';
  totalOrders: number;
  successCount: number;
  failedCount: number;
  totalDurationMs: number;
};

type TrackingSkipLog = {
  operation: 'tracking_skip';
  totalOrders: number;   // ≥ 0
  dbHitCount: number;    // ≥ 0, dbHitCount + apiCallCount ≤ totalOrders
  apiCallCount: number;  // ≥ 0
};

type BatchOptimizedSummaryLog = {
  operation: 'batch_optimized_summary';
  totalOrders: number;
  cachedCount: number;
  fastPathCount: number;
  fallbackCount: number;
  failedCount: number;
  userFacingDurationMs: number;
};

// Suppress unused-type warnings — these are referenced by emitLog call sites in future tasks.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _InternalLogTypes =
  | FallbackDecisionLog
  | PollAttemptLog
  | BackgroundCachePopulateLog
  | BackgroundCacheSummaryLog
  | TrackingSkipLog
  | BatchOptimizedSummaryLog;

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

// OrderRecord, validateLabelEligibility, batchValidateLabelEligibility have been
// moved to label-validation.service.ts and re-exported above.






/**
 * @deprecated since v2 (label-print-v2) — the wait_5s strategy was removed because Shopee
 * typically requires > 15 s to auto-generate labels after init_logistic_batch, so a 5-second
 * delay never enables the fast-path retry to succeed. ALL [FALLBACK_REQUIRED] chunks now
 * route directly to createPollAndDownload. This function is retained for ATC test
 * compatibility and is safe to delete in a follow-up cleanup spec.
 *
 * Classify a chunk of orders as fresh or stale based on their `updatedAt` timestamp.
 *
 * Runs a single batch DB query wrapped in a 2-second timeout. If all orders in the
 * chunk are older than `STALE_SHIP_THRESHOLD_MS` (24 h), returns `skip_to_fallback` so
 * the 5-second retry delay can be skipped. If any order is fresh, NULL, or missing,
 * returns `wait_5s` (conservative).
 *
 * On DB exception or query timeout, falls back to conservative `wait_5s` with
 * `freshCount = chunk.length` and `staleCount = 0`.
 *
 * @param chunk - Array of `{ order_sn, package_number }` objects from the failing fast-path chunk
 * @returns FreshnessDecision — action, freshCount, staleCount
 *
 * **Validates: Requirements 2.1, 2.4, 2.5**
 */
async function classifyChunkFreshness(
  chunk: Array<{ order_sn: string; package_number: string }>
): Promise<FreshnessDecision> {
  try {
    const orderSns = chunk.map(o => o.order_sn);

    // Requirement 2.5: exactly one batch DB query per chunk, wrapped in a 2s timeout
    const rows = await raceWithTimeout(
      db.select({ orderSn: shopeeOrders.orderSn, updatedAt: shopeeOrders.updatedAt })
        .from(shopeeOrders)
        .where(inArray(shopeeOrders.orderSn, orderSns)),
      STALE_QUERY_TIMEOUT_MS
    );

    const now = Date.now();
    const updatedMap = new Map<string, Date>(
      rows.map(r => [r.orderSn, r.updatedAt] as [string, Date])
    );

    let freshCount = 0;
    let staleCount = 0;

    for (const o of chunk) {
      const updatedAt = updatedMap.get(o.order_sn);
      if (!updatedAt) {
        // Requirement 2.4: NULL or missing updatedAt → treat as fresh (conservative)
        freshCount++;
      } else {
        const ageMs = now - updatedAt.getTime();
        if (ageMs > STALE_SHIP_THRESHOLD_MS) {
          staleCount++;
        } else {
          freshCount++;
        }
      }
    }

    // Requirement 2.3: only skip delay when every order in the chunk is stale
    return {
      action: freshCount === 0 ? 'skip_to_fallback' : 'wait_5s',
      freshCount,
      staleCount,
    };
  } catch {
    // Requirement 2.4: exception or timeout → conservative (treat entire chunk as fresh)
    return { action: 'wait_5s', freshCount: chunk.length, staleCount: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v2: Fast-Path Chunk Processing
// ─────────────────────────────────────────────────────────────────────────────

type FastPathChunkOutcome = {
  /** PDF buffers produced by this chunk. May be 0 (full chunk queued/failed),
   *  1 (whole-chunk batch download succeeded), or N (parallel-per-order branch). */
  base64Buffers: string[];
  /** Orders deferred to createPollAndDownload (FALLBACK_REQUIRED). */
  toFallback: Array<{ order_sn: string; package_number: string }>;
  /** Per-order failures with the same error strings v1 produces. */
  failed: Array<{ orderSn: string; error: string }>;
};

/**
 * Process a single Fast_Path_Batch chunk. Captures the three v1 error branches
 * (FALLBACK_REQUIRED → queue; packages_can_not_download_together → parallel per-order;
 * other → per-order failure). Does NOT throw. Does NOT call classifyChunkFreshness.
 * Does NOT sleep.
 *
 * Validates: Requirements 1.1, 1.4, 1.5, 1.6, 2.5, 2.6
 */
async function processFastPathChunk(
  shopId: number,
  chunk: Array<{ order_sn: string; package_number: string }>
): Promise<FastPathChunkOutcome> {
  const out: FastPathChunkOutcome = { base64Buffers: [], toFallback: [], failed: [] };

  try {
    const result = await downloadShippingDocumentBatch(
      shopId,
      chunk as Array<{ order_sn: string; package_number?: string }>,
      'THERMAL_AIR_WAYBILL'
    );
    out.base64Buffers.push(result.base64);
    return out;
  } catch (chunkError: any) {
    const msg: string = chunkError.message ?? '';

    // Branch A: FALLBACK_REQUIRED — queue directly, no sleep, no retry (Requirement 1.1, 1.4)
    if (msg.includes('[FALLBACK_REQUIRED]')) {
      console.log('[label-service] batch: chunk needs create+poll, queuing', chunk.length, 'orders for fallback');
      out.toFallback.push(...chunk);
      return out;
    }

    // Branch B: mixed channels → parallel per-order (Requirement 1.5, 2.6)
    if (msg.includes('packages_can_not_download_together') || msg.includes('can not download together')) {
      console.log('[label-service] batch: channel group download failed (mixed channels), parallel per-order for', chunk.length, 'orders');
      const PARALLEL_LIMIT = 5; // unchanged from v1
      for (let pi = 0; pi < chunk.length; pi += PARALLEL_LIMIT) {
        const parallelBatch = chunk.slice(pi, pi + PARALLEL_LIMIT);
        const parallelResults = await Promise.allSettled(
          parallelBatch.map(async (order) => {
            const singleResult = await downloadShippingDocumentBatch(
              shopId,
              [order as { order_sn: string; package_number?: string }],
              'THERMAL_AIR_WAYBILL'
            );
            return { order, base64: singleResult.base64 };
          })
        );
        for (let i = 0; i < parallelResults.length; i++) {
          const pr = parallelResults[i];
          const failedOrder = parallelBatch[i];
          if (!pr || !failedOrder) continue; // defensive: should never happen
          if (pr.status === 'fulfilled') {
            out.base64Buffers.push((pr as PromiseFulfilledResult<{ order: { order_sn: string; package_number: string }; base64: string }>).value.base64);
          } else {
            const errMsg: string = (pr as PromiseRejectedResult).reason?.message || 'Download failed';
            if (errMsg.includes('[FALLBACK_REQUIRED]')) {
              out.toFallback.push(failedOrder);
            } else {
              out.failed.push({ orderSn: failedOrder.order_sn, error: errMsg });
            }
          }
        }
      }
      return out;
    }

    // Branch C: any other error — record per-order failures (unchanged from v1)
    for (const order of chunk) {
      out.failed.push({ orderSn: order.order_sn, error: msg });
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v2: Channel Group Download Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download all chunks for a single channel group, sequentially within the channel.
 * Pushes per-order failures into `failedOrders` (shared mutable array, same as v1).
 * Returns the channel's PDF base64 buffers in chunk order.
 *
 * The inner loop remains sequential to preserve per-channel API rate-limit safety
 * (Requirement 3.2).
 *
 * `failedOrders` is passed by reference; each channel's task mutates it concurrently.
 * This is safe because `Array.prototype.push` is synchronous and the JS event loop
 * serializes reentries between awaits. No extra synchronization is needed.
 *
 * Note: v1 does NOT distinguish [FALLBACK_REQUIRED] in this code site — Requirement 3.5
 * explicitly preserves that behaviour. Any error becomes per-order failures for the chunk.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
async function downloadChannelGroup(
  shopId: number,
  channelOrders: Array<{ order_sn: string; package_number: string }>,
  batchChunkSize: number,
  failedOrders: Array<{ orderSn: string; error: string }>
): Promise<string[]> {
  const buffers: string[] = [];
  const chunks = chunkArray(channelOrders, batchChunkSize);

  // Inner loop SEQUENTIAL by design — within a channel, chunks share a rate-limit window.
  // Different channels run in parallel via Promise.allSettled at the call site.
  for (const chunk of chunks) {
    try {
      const result = await downloadShippingDocumentBatch(
        shopId,
        chunk as Array<{ order_sn: string; package_number?: string }>,
        'THERMAL_AIR_WAYBILL'
      );
      buffers.push(result.base64);
    } catch (err: any) {
      // Same per-order failure logic as v1 at this site.
      // [FALLBACK_REQUIRED] here is treated as terminal (Requirement 3.5).
      for (const order of chunk) {
        failedOrders.push({ orderSn: order.order_sn, error: err.message });
      }
    }
  }

  return buffers;
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
    const validationResult = await _validateLabelEligibility(orderSn);
    
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
          
          // Adaptive poll with backoff intervals (Requirement 3.4, 3.5, 3.6, 9.3, 9.4)
          let documentReady = false;
          const fastPathIntervals = getPollIntervals('single');

          for (let pollIndex = 0; pollIndex < fastPathIntervals.length; pollIndex++) {
            await sleep(fastPathIntervals[pollIndex]);
            try {
              await getShippingDocumentResult(shopId, orderSn, packageNumber);
              console.log(`[label-service] Document ready after ${pollIndex + 1} attempts (fallback)`);
              emitLog({
                operation: 'poll_attempt',
                pollIndex: pollIndex + 1,
                delayMs: fastPathIntervals[pollIndex],
                readyCount: 1,
                pendingCount: 0,
              });
              documentReady = true;
              break;
            } catch (error: any) {
              if (!error.message?.includes('belum tersedia')) throw error;
              console.log(`[label-service] Document still processing, attempt ${pollIndex + 1}/${fastPathIntervals.length}`);
              emitLog({
                operation: 'poll_attempt',
                pollIndex: pollIndex + 1,
                delayMs: fastPathIntervals[pollIndex],
                readyCount: 0,
                pendingCount: 1,
              });
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
        
        // Adaptive poll with backoff intervals (Requirement 3.4, 3.5, 3.6, 9.3, 9.4)
        let documentReady = false;
        const standardIntervals = getPollIntervals('single');

        for (let pollIndex = 0; pollIndex < standardIntervals.length; pollIndex++) {
          await sleep(standardIntervals[pollIndex]);
          try {
            await getShippingDocumentResult(shopId, orderSn, packageNumber);
            console.log(`[label-service] Document ready after ${pollIndex + 1} attempts`);
            emitLog({
              operation: 'poll_attempt',
              pollIndex: pollIndex + 1,
              delayMs: standardIntervals[pollIndex],
              readyCount: 1,
              pendingCount: 0,
            });
            documentReady = true;
            break;
          } catch (error: any) {
            if (!error.message?.includes('belum tersedia')) throw error;
            console.log(`[label-service] Document still processing, attempt ${pollIndex + 1}/${standardIntervals.length}`);
            emitLog({
              operation: 'poll_attempt',
              pollIndex: pollIndex + 1,
              delayMs: standardIntervals[pollIndex],
              readyCount: 0,
              pendingCount: 1,
            });
          }
        }
        
        if (!documentReady) {
          throw new Error('Timeout: Label pengiriman tidak siap setelah polling.');
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
 * Download a single order's shipping document via `downloadShippingDocument` and upsert
 * the result into `label_cache`.
 *
 * - Applies a 30-second timeout (BG_DOWNLOAD_TIMEOUT_MS) to the download call.
 * - Validates the response: base64 must be non-empty, decoded buffer must be non-empty,
 *   and the first 5 bytes must spell `%PDF-`.
 * - On success: upserts via `labelCache.set` (always writes, never reads cache first –
 *   Requirement 1.9) and emits a `background_cache_populate` log with `result: 'success'`.
 * - On any failure (timeout, error response, invalid PDF): emits a
 *   `background_cache_populate` log with `result: 'failure'` and does NOT write to cache.
 *   Auto-retry is NOT performed (Requirement 1.6, 1.11).
 *
 * @param shopId               - Shop identifier for the Shopee API call
 * @param order                - Object with `order_sn` and `package_number`
 * @param shippingDocumentType - Shipping document type string (e.g. 'THERMAL_AIR_WAYBILL')
 * @param chunkIndex           - Zero-based index of the chunk this order belongs to (for logging)
 * @returns `'success'` if the PDF was downloaded and cached, `'failure'` otherwise
 *
 * **Validates: Requirements 1.2, 1.3, 1.6, 1.9, 1.10, 1.11, 6.2, 6.6, 8.6**
 */
async function downloadAndCacheSingle(
  shopId: number,
  order: { order_sn: string; package_number: string },
  shippingDocumentType: string,
  chunkIndex: number
): Promise<'success' | 'failure'> {
  const t0 = Date.now();
  try {
    // Requirement 1.11: apply 30-second timeout per download call
    const doc = await raceWithTimeout(
      downloadShippingDocument(shopId, order.order_sn, order.package_number, shippingDocumentType),
      BG_DOWNLOAD_TIMEOUT_MS
    );

    // Requirement 1.6 / 6.6: validate base64 is non-empty
    if (!doc?.base64 || doc.base64.length === 0) {
      throw new Error('empty PDF');
    }

    // Requirement 6.2 / 6.6: decode and validate magic header %PDF-
    const buf = Buffer.from(doc.base64, 'base64');
    if (buf.length === 0 || !buf.subarray(0, 5).toString('utf8').startsWith('%PDF-')) {
      throw new Error('invalid PDF (missing %PDF- header)');
    }

    // Requirement 1.3 / 1.9: upsert into label_cache (no cache-read first)
    await labelCache.set(order.order_sn, {
      orderSn: order.order_sn,
      url: `data:application/pdf;base64,${doc.base64}`,
      format: 'pdf',
      trackingNumber: '',
      retrievedAt: new Date(),
    });

    // Requirement 1.10: emit success log
    emitLog({
      operation: 'background_cache_populate',
      orderSn: order.order_sn,
      durationMs: Date.now() - t0,
      chunkIndex,
      result: 'success',
    } satisfies BackgroundCachePopulateLog);

    return 'success';
  } catch (err: any) {
    // Requirement 1.6 / 1.10: emit failure log; do NOT write to cache; do NOT retry
    emitLog({
      operation: 'background_cache_populate',
      orderSn: order.order_sn,
      durationMs: Date.now() - t0,
      chunkIndex,
      result: 'failure',
      error: err?.message ?? String(err),
    } satisfies BackgroundCachePopulateLog);

    return 'failure';
  }
}

/**
 * Populate `label_cache` for all successful orders after the batch download is complete.
 *
 * Non-blocking: intended to be scheduled via `queueMicrotask` / `Promise.resolve().then()`
 * so the HTTP response is already sent before the first chunk starts (Requirement 1.7).
 *
 * - Chunks `successOrders` into groups of `PARALLEL_CHUNK_SIZE` (default 5).
 * - For each chunk, fans out via `Promise.allSettled` so one order's failure never blocks others.
 * - Waits `CHUNK_DELAY_MS` (default 300 ms) between consecutive chunks, EXCEPT after the last.
 * - At the end emits a single `background_cache_summary` log (Requirement 10.4).
 * - MUST NOT call `getSingleLabel` for caching purposes (Requirement 1.8).
 *
 * @param shopId                - Shopee shop identifier
 * @param successOrders         - Orders to cache (from successful batch download)
 * @param shippingDocumentType  - e.g. 'THERMAL_AIR_WAYBILL'
 *
 * **Validates: Requirements 1.4, 1.5, 1.6, 1.8, 6.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.4**
 */
async function populateCacheInBackground(
  shopId: number,
  successOrders: Array<{ order_sn: string; package_number: string }>,
  shippingDocumentType: string
): Promise<void> {
  const startTime = Date.now();
  let successCount = 0;
  let failedCount = 0;

  // Requirements 1.4, 8.1: chunk into groups of PARALLEL_CHUNK_SIZE
  const chunks = chunkArray(successOrders, PARALLEL_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];

    // Requirements 1.4, 8.1: fan-out with Promise.allSettled so failures are isolated
    const results = await Promise.allSettled(
      chunk.map(o => downloadAndCacheSingle(shopId, o, shippingDocumentType, chunkIndex))
    );

    // Tally results — a fulfilled promise with value 'success' counts as success,
    // everything else (rejected OR fulfilled with 'failure') counts as failed.
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === 'success') {
        successCount++;
      } else {
        failedCount++;
      }
    }

    // Requirement 1.5, 8.2: wait CHUNK_DELAY_MS between chunks, skip after the last chunk
    if (chunkIndex < chunks.length - 1) {
      await sleep(CHUNK_DELAY_MS);
    }
  }

  // Requirement 10.4: emit exactly one background_cache_summary log
  // Invariant: successCount + failedCount === successOrders.length (totalOrders)
  emitLog({
    operation: 'background_cache_summary',
    totalOrders: successOrders.length,
    successCount,
    failedCount,
    totalDurationMs: Date.now() - startTime,
  } satisfies BackgroundCacheSummaryLog);
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

  // ── Optimasi 4: Skip get_mass_tracking_number pre-step ──
  // Requirement 4.1–4.8, 7.5
  let dbHitCount = 0;
  let apiCallCount = 0;
  const totalOrders = orders.length;

  // Requirement 4.1: skip query for empty list, emit log, return early
  if (orders.length === 0) {
    emitLog({ operation: 'tracking_skip', totalOrders, dbHitCount, apiCallCount });
    return pdfBuffers;
  }

  let trackingMap = new Map<string, string>(); // package_number → tracking_number

  try {
    const { getMassTrackingNumber } = await import("./shopee-label");

    // Requirement 4.1: exactly one DB query with deduplicated order_sn list
    const uniqueOrderSns = [...new Set(orders.map(o => o.order_sn))];
    const rows = await db
      .select({ orderSn: shopeeOrders.orderSn, trackingNumber: shopeeOrders.trackingNumber })
      .from(shopeeOrders)
      .where(inArray(shopeeOrders.orderSn, uniqueOrderSns));

    // Build map order_sn → tracking_number (only for non-null, non-empty after trim)
    const dbTrackingByOrderSn = new Map<string, string>();
    for (const r of rows) {
      const tn = r.trackingNumber?.trim();
      if (tn && tn.length >= 1) dbTrackingByOrderSn.set(r.orderSn, tn);
    }

    // Partition orders into "covered by DB" vs "needs API"
    const ordersNeedingApi: Array<{ order_sn: string; package_number: string }> = [];
    for (const o of orders) {
      const dbTn = dbTrackingByOrderSn.get(o.order_sn);
      if (dbTn) {
        // Requirement 4.5a: DB value has highest priority
        (o as any).tracking_number = dbTn;
        trackingMap.set(o.package_number, dbTn);
        dbHitCount++;
      } else {
        ordersNeedingApi.push(o);
      }
    }

    // Requirement 4.2/4.3: call API only for orders without DB tracking
    if (ordersNeedingApi.length > 0) {
      apiCallCount++;
      const trackingResult = await getMassTrackingNumber(shopId, ordersNeedingApi.map(o => o.package_number));
      const successList = trackingResult?.response?.success_list || [];

      for (const item of successList) {
        if (item.tracking_number) {
          trackingMap.set(item.package_number, item.tracking_number);
          const ord = ordersNeedingApi.find(o => o.package_number === item.package_number);
          if (ord) {
            // Requirement 4.5b: attach API result
            (ord as any).tracking_number = item.tracking_number;
            // Requirement 4.4: persist returned tracking back to DB (fire-and-forget)
            db.update(shopeeOrders)
              .set({ trackingNumber: item.tracking_number })
              .where(eq(shopeeOrders.orderSn, ord.order_sn))
              .execute()
              .catch(() => {});
          }
        }
      }

      console.log('[label-service] createPollAndDownload: DB hits:', dbHitCount, '/ API call for:', ordersNeedingApi.length, 'orders');
    } else {
      console.log('[label-service] createPollAndDownload: all', dbHitCount, 'tracking numbers found in DB — skipping API call');
    }
  } catch (e: any) {
    // Requirement 4.7: on any exception, fall back to flow lama (getMassTrackingNumber for all orders)
    console.warn('[label-service] createPollAndDownload: tracking pre-query failed, falling back to full API call:', e.message);
    trackingMap = new Map();
    dbHitCount = 0;
    try {
      const { getMassTrackingNumber } = await import("./shopee-label");
      apiCallCount++;
      const trackingResult = await getMassTrackingNumber(shopId, orders.map(o => o.package_number));
      const successList = trackingResult?.response?.success_list || [];
      for (const item of successList) {
        if (item.tracking_number) {
          trackingMap.set(item.package_number, item.tracking_number);
          const ord = orders.find(o => o.package_number === item.package_number);
          if (ord) (ord as any).tracking_number = item.tracking_number;
        }
      }
    } catch {
      // Mirror existing flow lama: non-fatal, continue without tracking
    }
  }

  // Requirement 4.8: emit exactly one tracking_skip log (invariant: dbHitCount + apiCallCount ≤ totalOrders)
  emitLog({ operation: 'tracking_skip', totalOrders, dbHitCount, apiCallCount });

  // Requirement 4.6: drop orders with no tracking_number after DB+API into failedOrders
  const ordersWithTracking: Array<{ order_sn: string; package_number: string }> = [];
  for (const o of orders) {
    const tn = (o as any).tracking_number || trackingMap.get(o.package_number);
    if (tn) {
      ordersWithTracking.push(o);
    } else {
      failedOrders.push({ orderSn: o.order_sn, error: 'Tracking number tidak tersedia' });
    }
  }

  // Continue only with orders that have a tracking number
  const ordersToProcess = ordersWithTracking;

  // If all orders were dropped due to missing tracking, return early
  if (ordersToProcess.length === 0) return pdfBuffers;

  // Create shipping documents (with tracking numbers from pre-step)
  // Use ordersToProcess (orders that have tracking numbers after DB+API lookup)
  const createOrders = ordersToProcess.map(o => ({
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
  const ordersToDownload = ordersToProcess.filter(o =>
    mergedCreateResult.successOrders.includes(o.order_sn)
  );

  if (ordersToDownload.length === 0) return pdfBuffers;

  // Poll for readiness using adaptive backoff intervals (Requirement 3.1–3.6, 9.2, 9.4)
  const intervals = getPollIntervals('createPoll');
  const readyOrders: string[] = [];
  let processingOrders = [...ordersToDownload];

  for (let pollIndex = 0; pollIndex < intervals.length; pollIndex++) {
    await sleep(intervals[pollIndex]);
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
        // Keep only orders still processing (not ready, not failed)
        const doneSet = new Set([...status.ready, ...status.failed.map(f => f.order_sn)]);
        stillProcessing.push(...chunk.filter(o => !doneSet.has(o.order_sn)));
      } catch {
        stillProcessing.push(...chunk);
      }
    }

    readyOrders.push(...newReady);
    processingOrders = stillProcessing;

    emitLog({
      operation: 'poll_attempt',
      pollIndex: pollIndex + 1,
      delayMs: intervals[pollIndex],
      readyCount: newReady.length,
      pendingCount: stillProcessing.length,
    });

    // Requirement 3.3: early exit when all orders are ready or failed
    if (stillProcessing.length === 0) break;
  }

  // Requirement 3.5, 9.4: timeout — mark remaining processing orders as failed (do NOT throw)
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

  // Dispatch one task per channel group concurrently (Requirement 3.1, 3.2, 3.4).
  const channelEntries = Array.from(byChannel.entries());
  const settledChannels = await Promise.allSettled(
    channelEntries.map(([, channelOrders]) =>
      downloadChannelGroup(shopId, channelOrders, batchChunkSize, failedOrders)
    )
  );

  // Aggregate results in channel iteration order (Requirement 3.3).
  for (let i = 0; i < settledChannels.length; i++) {
    const r = settledChannels[i];
    const [, channelOrders] = channelEntries[i];
    if (r.status === 'fulfilled') {
      pdfBuffers.push(...r.value);
    } else {
      // Defensive: downloadChannelGroup catches per-chunk errors, so this should not happen.
      // If it does, attribute failure to all orders in the channel.
      const msg = (r.reason as any)?.message ?? 'Channel download failed';
      for (const order of channelOrders) {
        failedOrders.push({ orderSn: order.order_sn, error: msg });
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

  // Counters for batch_optimized_summary log (Task 9.3 / Requirement 10.1)
  let cachedCount = 0;
  let fastPathCount = 0;
  let fallbackCount = 0;

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
      const { mergePdfBuffers } = await import('./pdf-merge.util');
      const mergedBase64 = await mergePdfBuffers(cachedPdfs);
      const pdfUrl = `data:application/pdf;base64,${mergedBase64}`;
      const duration = Date.now() - startTime;
      console.log('[label-service] ⚡ batch reprint ALL from cache:', { duration: `${duration}ms`, orders: orderSns.length });
      cachedCount = orderSns.length;
      emitLog({
        operation: 'batch_optimized_summary',
        totalOrders: orderSns.length,
        cachedCount,
        fastPathCount: 0,
        fallbackCount: 0,
        failedCount: 0,
        userFacingDurationMs: duration,
      } satisfies BatchOptimizedSummaryLog);
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
        const { mergePdfBuffers } = await import('./pdf-merge.util');
        const mergedBase64 = await mergePdfBuffers(allPdfBuffers);
        const pdfUrl = `data:application/pdf;base64,${mergedBase64}`;
        const duration = Date.now() - startTime;
        const totalSuccess = cachedPdfs.length + uncachedResult.successCount;
        console.log('[label-service] ⚡ batch partial cache merge:', { duration: `${duration}ms`, cached: cachedPdfs.length, fetched: uncachedResult.successCount, total: totalSuccess });
        const partialCachedCount = cachedPdfs.length;
        emitLog({
          operation: 'batch_optimized_summary',
          totalOrders: orderSns.length,
          cachedCount: partialCachedCount,
          fastPathCount: 0,
          fallbackCount: 0,
          failedCount: uncachedResult.failedOrders.length,
          userFacingDurationMs: duration,
        } satisfies BatchOptimizedSummaryLog);
        return { success: true, pdfUrl, successCount: totalSuccess, failedOrders: uncachedResult.failedOrders };
      }
      
      // If no PDFs at all, return uncached result as-is
      return uncachedResult;
    }

    console.log('[label-service] batch cache check:', { cached: cachedPdfs.length, uncached: uncachedOrderSns.length, total: orderSns.length });

    // ── Step 1: Validate orders and get shopId ──
    // Task 9.1 / Requirement 5.1–5.6, 5.10: one batch DB query instead of N sequential queries
    const validOrders: Array<{ orderSn: string; shopId: number; trackingNumber?: string; shippingCarrier?: string }> = [];

    const validationResults = await _batchValidateLabelEligibility(uncachedOrderSns);
    for (let i = 0; i < uncachedOrderSns.length; i++) {
      const orderSn = uncachedOrderSns[i];
      const validation = validationResults[i];
      if (validation.valid) {
        validOrders.push({
          orderSn,
          shopId: validation.order!.shopId,
          trackingNumber: validation.order!.trackingNumber || undefined,
          shippingCarrier: validation.order!.shippingCarrier || undefined,
        });
      } else {
        failedOrders.push({ orderSn, error: validation.error || 'Validation failed' });
      }
    }

    if (validOrders.length === 0) {
      const duration = Date.now() - startTime;
      emitLog({
        operation: 'batch_optimized_summary',
        totalOrders: orderSns.length,
        cachedCount,
        fastPathCount: 0,
        fallbackCount: 0,
        failedCount: failedOrders.length,
        userFacingDurationMs: duration,
      } satisfies BatchOptimizedSummaryLog);
      return { success: false, successCount: 0, failedOrders };
    }

    // ── Shop ID consistency check ──
    const uniqueShopIds = new Set(validOrders.map(o => o.shopId));
    if (uniqueShopIds.size > 1) {
      const duration = Date.now() - startTime;
      const multiShopFailed = validOrders.map(o => ({
        orderSn: o.orderSn,
        error: 'Semua order dalam batch harus dari shop yang sama'
      }));
      emitLog({
        operation: 'batch_optimized_summary',
        totalOrders: orderSns.length,
        cachedCount,
        fastPathCount: 0,
        fallbackCount: 0,
        failedCount: multiShopFailed.length + failedOrders.length,
        userFacingDurationMs: duration,
      } satisfies BatchOptimizedSummaryLog);
      return {
        success: false,
        successCount: 0,
        failedOrders: multiShopFailed
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
      const duration = Date.now() - startTime;
      emitLog({
        operation: 'batch_optimized_summary',
        totalOrders: orderSns.length,
        cachedCount,
        fastPathCount: 0,
        fallbackCount: 0,
        failedCount: failedOrders.length,
        userFacingDurationMs: duration,
      } satisfies BatchOptimizedSummaryLog);
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

      // Build a flat array of all chunks across all channels (Requirement 2.1, 2.2).
      // Chunking still happens per channel via chunkArray to preserve channel grouping
      // inside each chunk (Shopee cannot merge labels from different channels in one PDF).
      const allChunks: Array<{ order_sn: string; package_number: string }>[] = [];
      for (const [, channelOrders] of ordersByChannel) {
        allChunks.push(...chunkArray(channelOrders, BATCH_CHUNK_SIZE));
      }

      // Dispatch all chunks concurrently (Requirement 2.1, 2.4).
      // processFastPathChunk does not throw, so settled.status is always 'fulfilled' in practice.
      // We still use allSettled to defensively absorb any unexpected throws.
      const settled = await Promise.allSettled(
        allChunks.map(chunk => processFastPathChunk(shopId, chunk))
      );

      // Aggregate results in the order chunks were dispatched (Requirement 2.3).
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        const chunk = allChunks[i];
        if (r.status === 'fulfilled') {
          allPdfBuffers.push(...r.value.base64Buffers);
          fallbackOrders.push(...r.value.toFallback);
          failedOrders.push(...r.value.failed);
        } else {
          // Defensive: should not happen because processFastPathChunk catches everything.
          // If it does, treat the entire chunk as failed (Requirement 2.5).
          const msg = (r.reason as any)?.message ?? 'Unknown chunk error';
          for (const order of chunk) {
            failedOrders.push({ orderSn: order.order_sn, error: msg });
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
        const { mergePdfBuffers } = await import('./pdf-merge.util');
        const mergedBase64 = await mergePdfBuffers(allPdfBuffers);
        const pdfUrl = `data:application/pdf;base64,${mergedBase64}`;
        const successCount = batchOrders.length - failedOrders.filter(f => batchOrders.some(b => b.order_sn === f.orderSn)).length;
        const duration = Date.now() - startTime;
        console.log('[label-service] ⚡ batch download completed:', { duration: `${duration}ms`, orders: successCount, pdfs: allPdfBuffers.length, channels: ordersByChannel.size, fallback: fallbackOrders.length });

        // Task 9.3 / Requirement 10.1: compute per-path order counts for summary log
        // fallbackCount = orders that went through createPollAndDownload and succeeded
        // fastPathCount = remaining successes (downloaded via fast path)
        // Invariant: cachedCount + fastPathCount + fallbackCount + failedCount === totalOrders
        const failedOrderSns = new Set(failedOrders.map(f => f.orderSn));
        const successfulFallbackCount = fallbackOrders.filter(o => !failedOrderSns.has(o.order_sn)).length;
        fallbackCount = successfulFallbackCount;
        fastPathCount = successCount - fallbackCount;

        // Task 9.2 / Requirement 1.1, 1.7, 7.2: schedule Background_Cache_Populate after
        // merged PDF is ready, but non-blocking so the return statement flushes response first.
        const successOrders = batchOrders.filter(o => !failedOrderSns.has(o.order_sn));
        if (successOrders.length > 0) {
          queueMicrotask(() => {
            populateCacheInBackground(shopId, successOrders, 'THERMAL_AIR_WAYBILL').catch(() => {});
          });
        }

        // Task 9.3 / Requirement 10.1: emit exactly one summary log on success path
        emitLog({
          operation: 'batch_optimized_summary',
          totalOrders: orderSns.length,
          cachedCount,
          fastPathCount,
          fallbackCount,
          failedCount: failedOrders.length,
          userFacingDurationMs: duration,
        } satisfies BatchOptimizedSummaryLog);

        return { success: true, pdfUrl, successCount, failedOrders };
      }

      // No PDFs at all
      if (failedOrders.length === 0) {
        failedOrders.push({ orderSn: 'batch', error: 'No labels could be downloaded' });
      }
      {
        const duration = Date.now() - startTime;
        emitLog({
          operation: 'batch_optimized_summary',
          totalOrders: orderSns.length,
          cachedCount,
          fastPathCount,
          fallbackCount,
          failedCount: failedOrders.length,
          userFacingDurationMs: duration,
        } satisfies BatchOptimizedSummaryLog);
      }
      return { success: false, successCount: 0, failedOrders };

    } catch (downloadError: any) {
      console.error('[label-service] batch download: unexpected error:', downloadError.message);
      const duration = Date.now() - startTime;
      const downloadFailed = [...failedOrders, { orderSn: 'batch', error: downloadError.message }];
      emitLog({
        operation: 'batch_optimized_summary',
        totalOrders: orderSns.length,
        cachedCount,
        fastPathCount,
        fallbackCount,
        failedCount: downloadFailed.length,
        userFacingDurationMs: duration,
      } satisfies BatchOptimizedSummaryLog);
      return {
        success: false,
        successCount: 0,
        failedOrders: downloadFailed
      };
    }

  } catch (error: any) {
    console.error('[label-service] getBatchLabelsOptimized failed:', error.message);
    const duration = Date.now() - startTime;
    const allFailed = failedOrders.length > 0
      ? [...failedOrders, { orderSn: 'batch', error: error.message }]
      : [{ orderSn: 'batch', error: error.message }];
    emitLog({
      operation: 'batch_optimized_summary',
      totalOrders: orderSns.length,
      cachedCount,
      fastPathCount,
      fallbackCount,
      failedCount: allFailed.length,
      userFacingDurationMs: duration,
    } satisfies BatchOptimizedSummaryLog);
    return { success: false, successCount: 0, failedOrders: allFailed };
  }
}


// ─── Prefetch After Ship ─────────────────────────────────────────────────────

/**
 * Fire-and-forget label prefetch after a ship_order or mass_ship_order success.
 *
 * Why: when a user later clicks "Cetak Label", the cache will already be warm so
 * the print tab opens within a few seconds instead of 30+. This eliminates the
 * full Shopee `create_shipping_document` → poll → `download_shipping_document`
 * round-trip from the user-facing path.
 *
 * Behaviour:
 *  - Returns immediately. Caller does NOT await.
 *  - Schedules work via `setTimeout(..., delayMs)` so Shopee has time to start
 *    generating the document before we try to download.
 *  - Processes orders in chunks of {@link PARALLEL_CHUNK_SIZE} with
 *    `Promise.allSettled` so one order's failure never blocks the others.
 *  - Uses {@link getSingleLabel} (which already implements fast-path → create
 *    → poll → download with proper backoff) so we benefit from the same retry
 *    semantics the manual print path uses.
 *  - Idempotent — `getSingleLabel` checks the DB cache first, so calling this
 *    twice for the same order_sn is a no-op on the second call.
 *  - Tolerant — failures are logged but never bubble. The next time the user
 *    actually clicks "Cetak Label" the regular flow will retry.
 *
 * NOT a queue replacement — this is intentionally an in-process best-effort
 * mechanism scoped to "warm the cache for orders that just shipped". It does
 * not survive an API restart that happens between the ship call and the
 * scheduled fetch. That trade-off is acceptable for current scale (single shop,
 * <1k orders/day): a missed prefetch only means the next print is slow, never
 * a data error. See `analisa_flow.md` for a longer rationale.
 *
 * @param shopId    Shopee shop id (used implicitly through getSingleLabel)
 * @param orderSns  Order SNs to prefetch (de-duplicated internally)
 * @param delayMs   Delay before starting the prefetch. Default 3000 ms — same
 *                  as the existing single-ship prefetch. Rationale: Shopee
 *                  generates each shipping document on-demand per order
 *                  (triggered by our first download/create call), so batch
 *                  ship doesn't need a longer wait than single ship. If
 *                  Shopee is still processing when we hit it, getSingleLabel's
 *                  internal polling (~6.3 s of adaptive backoff) absorbs the
 *                  delay before giving up.
 */
export function prefetchLabelsInBackground(
  shopId: number,
  orderSns: string[],
  delayMs: number = 3000,
): void {
  if (!orderSns || orderSns.length === 0) return;

  // De-duplicate to avoid redundant work when the caller's success_list contains
  // duplicates (rare but possible across retried batch groups).
  const uniqueOrderSns = Array.from(new Set(orderSns));

  setTimeout(async () => {
    const startTime = Date.now();
    let successCount = 0;
    let failedCount = 0;

    console.log('[prefetch-label] start:', {
      shopId,
      orderCount: uniqueOrderSns.length,
      delayMs,
    });

    // Chunk so we never have more than PARALLEL_CHUNK_SIZE concurrent in-flight
    // requests against Shopee. Same constant as populateCacheInBackground for
    // consistency.
    const chunks = chunkArray(uniqueOrderSns, PARALLEL_CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const results = await Promise.allSettled(
        chunk.map(sn => getSingleLabel(sn))
      );

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const orderSn = chunk[i];
        if (r.status === 'fulfilled' && r.value.success) {
          successCount++;
        } else {
          failedCount++;
          const reason = r.status === 'fulfilled'
            ? r.value.error
            : (r.reason as Error)?.message;
          console.warn(`[prefetch-label] failed for ${orderSn}:`, reason);
        }
      }

      // Pace ourselves between chunks (skip after the last one) so we don't
      // hammer Shopee. Same delay as populateCacheInBackground.
      if (chunkIndex < chunks.length - 1) {
        await sleep(CHUNK_DELAY_MS);
      }
    }

    console.log('[prefetch-label] done:', {
      shopId,
      total: uniqueOrderSns.length,
      successCount,
      failedCount,
      durationMs: Date.now() - startTime,
    });
  }, delayMs);
}
