/**
 * Background Sync Service
 * 
 * Handles automatic background synchronization of Shopee orders.
 * Uses incremental sync with overlap to prevent data loss.
 * 
 * RESILIENCE FEATURES:
 * - State persisted in database (survive server restart)
 * - Catch-up logic after downtime (no data loss)
 * - Lock system (prevent concurrent sync)
 * - Chunking for large gaps (avoid timeout)
 * 
 * OPTIMIZED STRATEGY (2024-05-07):
 * - Active orders: Sync every 2 min with 6 min overlap (near-realtime)
 * - Active safety net: Sync every 30 min (last 10 days) - safety net only
 * - Completed orders: Sync every 2 hours (last 30 days)
 * - Stuck orders: Refresh every 30 min (direct DB query + batch fetch)
 * 
 * API Usage: ~34.5 calls/hour (was ~98) - 65% reduction
 * 
 * Core Principle:
 * - Overlap >= 3x interval (prevent gaps)
 * - State tracking in database (survive restart)
 * - Better duplicate than miss data
 */

import { db } from "../db/client";
import { shopeeCredentials, shopeeOrders, syncState } from "../db/schema";
import { syncShopeeOrdersService, syncShopeeOrdersIncremental } from "./order.service";
import { getShopeeOrderDetails } from "./shopee-raw";
import { eq, and, or, inArray } from "drizzle-orm";

interface SyncJobConfig {
  intervalMs: number;
  daysBack?: number;          // For first run or safety net jobs
  overlapSeconds?: number;    // For incremental jobs
  orderStatus?: string;
  description: string;
  isIncremental?: boolean;    // Use state tracking
  timeRangeField?: 'create_time' | 'update_time';  // CRITICAL: Which time field to query by
}

interface SyncStats {
  lastSyncTime: Date;
  totalSynced: number;
  errors: number;
  activeJobs: number;
}

class BackgroundSyncService {
  private syncStats: Map<string, SyncStats> = new Map();
  private activeJobs: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown = false;
  
  // Chunking configuration
  private readonly CHUNK_SIZE_HOURS = 2;  // Process 2 hours at a time for large gaps
  private readonly MAX_GAP_HOURS = 2;     // If gap > 2 hours, use chunking

  /**
   * Get sync state from database
   */
  private async getSyncState(jobName: string, shopId: number) {
    const states = await db.select()
      .from(syncState)
      .where(and(
        eq(syncState.jobName, jobName),
        eq(syncState.shopId, shopId)
      ))
      .limit(1);
    
    return states.length > 0 ? states[0] : null;
  }

  /**
   * Update sync state in database
   */
  private async updateSyncState(
    jobName: string,
    shopId: number,
    lastSyncTime: Date,
    lastSyncEndTime: Date,
    totalSynced: number = 0,
    errors: number = 0
  ) {
    const existing = await this.getSyncState(jobName, shopId);
    
    if (existing) {
      await db.update(syncState)
        .set({
          lastSyncTime,
          lastSyncEndTime,
          syncInProgress: 0,
          totalSynced: existing.totalSynced + totalSynced,
          errors: existing.errors + errors,
          updatedAt: new Date()
        })
        .where(and(
          eq(syncState.jobName, jobName),
          eq(syncState.shopId, shopId)
        ));
    } else {
      await db.insert(syncState).values({
        jobName,
        shopId,
        lastSyncTime,
        lastSyncEndTime,
        syncInProgress: 0,
        totalSynced,
        errors,
        updatedAt: new Date()
      });
    }
  }

  /**
   * Set sync lock (prevent concurrent sync)
   */
  private async setSyncLock(jobName: string, shopId: number, locked: boolean): Promise<boolean> {
    const existing = await this.getSyncState(jobName, shopId);
    
    if (!existing) {
      // First run, create with lock
      await db.insert(syncState).values({
        jobName,
        shopId,
        lastSyncTime: new Date(),
        lastSyncEndTime: new Date(),
        syncInProgress: locked ? 1 : 0,
        totalSynced: 0,
        errors: 0,
        updatedAt: new Date()
      });
      return true;
    }
    
    // Check if already locked
    if (locked && existing.syncInProgress === 1) {
      // Stale lock detection: if lock is older than 10 minutes, force release
      const lockAge = Date.now() - existing.updatedAt.getTime();
      const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
      
      if (lockAge > STALE_THRESHOLD_MS) {
        console.warn(`[background-sync] ⚠️ Stale lock detected for "${jobName}" shop ${shopId} (${Math.round(lockAge / 60000)} min old), force releasing`);
        // Fall through to acquire lock below
      } else {
        console.warn(`[background-sync] Job "${jobName}" for shop ${shopId} is already in progress, skipping`);
        return false;
      }
    }
    
    // Update lock
    await db.update(syncState)
      .set({
        syncInProgress: locked ? 1 : 0,
        updatedAt: new Date()
      })
      .where(and(
        eq(syncState.jobName, jobName),
        eq(syncState.shopId, shopId)
      ));
    
    return true;
  }

  /**
   * Calculate gap and determine if catch-up is needed
   */
  private calculateGap(lastSyncTime: Date): { gapHours: number; needsCatchup: boolean; needsChunking: boolean } {
    const now = new Date();
    const gapMs = now.getTime() - lastSyncTime.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);
    
    return {
      gapHours,
      needsCatchup: gapHours > 0.1, // > 6 minutes
      needsChunking: gapHours > this.MAX_GAP_HOURS
    };
  }

  /**
   * Start background sync for all shops
   * 
   * OPTIMIZED STRATEGY (2024-05-07):
   * 1. Active orders sync (every 2 min) - Near-realtime with 6 min overlap
   * 2. Active safety net (every 30 min) - Full scan 10 days (prevent miss)
   * 3. Completed orders (every 2 hours) - 30 days with 1 day overlap
   * 4. Stuck orders refresh (every 30 min) - Direct DB query + batch fetch
   * 
   * This ensures:
   * - Near-realtime monitoring (2 min, avg 1 min delay)
   * - No data missed (6 min overlap + 30 min safety net)
   * - Efficient API usage (~34.5 calls/hour vs ~98 before)
   * - Safe rate limits (well below Shopee's ~100-200 calls/hour limit)
   */
  async startBackgroundSync() {
    console.log('[background-sync] Starting background sync service...');

    // ── STALE LOCK RECOVERY ──
    // Release any locks stuck from previous crash/shutdown (older than 10 minutes)
    try {
      const STALE_THRESHOLD_MINUTES = 10;
      const staleResult = await db.execute(
        `UPDATE sync_state SET sync_in_progress = 0 WHERE sync_in_progress = 1 AND last_sync_time < DATE_SUB(NOW(), INTERVAL ${STALE_THRESHOLD_MINUTES} MINUTE)`
      );
      const affectedRows = (staleResult as any)[0]?.affectedRows || 0;
      if (affectedRows > 0) {
        console.log(`[background-sync] ⚠️ Released ${affectedRows} stale lock(s) from previous crash`);
      }
    } catch (err: any) {
      console.warn('[background-sync] Failed to release stale locks:', err.message);
    }

    // Get all connected shops
    const shops = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials)
      .where(eq(shopeeCredentials.status, "connected"));
    
    if (shops.length === 0) {
      console.warn('[background-sync] No shops connected, skipping background sync');
      return;
    }

    console.log(`[background-sync] Found ${shops.length} shop(s) to sync`);

    // Job 1: Active orders - High priority, incremental with overlap
    // OPTIMIZED: 2 minutes for near-realtime sync
    // Catches: New orders, payment updates, status changes, CANCELLED
    // CRITICAL: Uses update_time to catch status changes on orders
    // INCLUDES daysBack for first run to prevent missing orders after restart
    this.scheduleJob('active-orders', {
      intervalMs: 2 * 60 * 1000,     // 2 minutes (30 calls/hour)
      overlapSeconds: 6 * 60,        // 6 minutes overlap (3x interval)
      daysBack: 7,                   // First run: fetch last 7 days
      orderStatus: undefined,        // ALL statuses including CANCELLED
      description: 'Active orders (incremental with 6min overlap, update_time, 7 days first run)',
      isIncremental: true,
      timeRangeField: 'update_time',
    }, shops);

    // Stagger: wait 2s between job starts to avoid rate limit burst
    await new Promise(r => setTimeout(r, 2000));

    // Job 2: Realtime boost - REMOVED (redundant with 2-min active-orders)
    // The 2-minute active-orders job is already fast enough for near-realtime sync

    // Job 3: Active safety net - Medium priority, full scan
    // OPTIMIZED: 30 minutes (was 10 min) - safety net only
    // Safety net: Ensures no data is missed for active orders including CANCELLED
    this.scheduleJob('active-safety-net', {
      intervalMs: 30 * 60 * 1000,    // 30 minutes (2 calls/hour)
      daysBack: 10,                   // 10 days (reduced from 15)
      orderStatus: undefined,        // ALL statuses including CANCELLED
      description: 'Active safety net (last 10 days, update_time, includes CANCELLED)',
      isIncremental: false,
      timeRangeField: 'update_time',
    }, shops);

    await new Promise(r => setTimeout(r, 2000));

    // Job 4: Completed orders - Low priority, periodic sync
    // Catches: SHIPPED → COMPLETED transitions for older orders (>10 days)
    // Also catches: PROCESSED → CANCELLED transitions for older orders
    this.scheduleJob('completed-orders', {
      intervalMs: 2 * 60 * 60 * 1000, // 2 hours (0.5 calls/hour)
      overlapSeconds: 24 * 60 * 60,   // 1 day overlap
      daysBack: 30,                   // 30 days (will be auto-chunked)
      orderStatus: undefined,        // ALL statuses including CANCELLED
      description: 'Completed orders (30 days with auto-chunking, update_time, includes CANCELLED)',
      isIncremental: true,
      timeRangeField: 'update_time',
    }, shops);

    await new Promise(r => setTimeout(r, 2000));

    // Job 5: Stuck orders refresh - Directly query DB for orders stuck in
    // OPTIMIZED: 30 minutes (was 15 min)
    // READY_TO_SHIP, PROCESSED, or SHIPPED that should have progressed.
    // This bypasses get_order_list and directly fetches details for stuck orders.
    this.scheduleStuckOrdersJob(shops);

    await new Promise(r => setTimeout(r, 2000));

    // Job 6: Escrow sync — keeps escrow_release_time and fee breakdown up to
    // date so the financial report (Laporan Keuangan) doesn't drift from
    // Shopee's Income Report. Self-heals missing orders by pulling their
    // detail from get_order_detail before populating fees.
    //
    // Two-tier strategy:
    //   - HOT  (14 days, every 1 hour): catches recently-released escrows so
    //     today/yesterday's revenue is fresh in the financial report. Most
    //     Shopee escrow releases land here.
    //   - COLD (60 days, once per day): safety net for late releases caused
    //     by partial returns / disputes / AMS commission adjustments that
    //     can land up to 60 days after order completion.
    //
    // Each tier owns its own lock (`escrow_sync_hot` vs `escrow_sync_cold`)
    // so they don't block each other. The manual `/sync/escrow` endpoint
    // still uses the legacy `escrow_sync` lock — no conflict with either.
    this.scheduleEscrowSyncJob();

    await new Promise(r => setTimeout(r, 2000));

    // Job 7: Ads expense sync — keeps `shopee_ads_daily_expense` cache fresh
    // so the "Biaya Iklan" column on Laporan Keuangan reflects today's spend
    // and never goes stale for older periods.
    //
    // Two-tier strategy (mirrors escrow-sync):
    //   - HOT  (7 days, every 30 min):  refresh today + yesterday + recent
    //     days. Today is a special case anyway — service has its own 15-min
    //     TTL on today's row, so 30 min cadence is the right granularity.
    //   - COLD (180 days, once per day): keeps the 6-month window backfilled
    //     for any historical period the user may open. Important because
    //     Shopee Ads API only retains 6 months — letting the cache go stale
    //     means data is gone permanently.
    //
    // Each tier has its own lock (`ads_expense_sync_hot` vs `ads_expense_sync_cold`).
    this.scheduleAdsExpenseSyncJob();

    console.log('[background-sync] All sync jobs scheduled successfully');
  }

  /**
   * Schedule a sync job with specific configuration
   */
  private scheduleJob(
    jobName: string,
    config: SyncJobConfig,
    shops: { shopId: number }[]
  ) {
    // Initialize stats
    this.syncStats.set(jobName, {
      lastSyncTime: new Date(),
      totalSynced: 0,
      errors: 0,
      activeJobs: 0
    });

    // Run immediately on start
    this.runSyncJob(jobName, config, shops);

    // Schedule recurring job
    const intervalId = setInterval(() => {
      if (!this.isShuttingDown) {
        this.runSyncJob(jobName, config, shops);
      }
    }, config.intervalMs);

    this.activeJobs.set(jobName, intervalId);

    console.log(`[background-sync] Scheduled job "${jobName}": ${config.description} (every ${config.intervalMs / 1000}s)`);
  }

  /**
   * Run a single sync job for all shops
   * 
   * Features:
   * - Database state persistence (survive restart)
   * - Catch-up after downtime (no data loss)
   * - Lock system (prevent concurrent sync)
   * - Chunking for large gaps (avoid timeout)
   */
  private async runSyncJob(
    jobName: string,
    config: SyncJobConfig,
    shops: { shopId: number }[]
  ) {
    const stats = this.syncStats.get(jobName);
    if (!stats) return;

    console.log(`[background-sync] Running job "${jobName}": ${config.description}`);
    const startTime = Date.now();
    let totalSynced = 0;

    try {
      // Sync each shop sequentially to avoid rate limits
      for (const shop of shops) {
        // CRITICAL: Use try-finally to ensure lock is ALWAYS released
        let lockAcquired = false;
        try {
          // Check and set lock
          lockAcquired = await this.setSyncLock(jobName, shop.shopId, true);
          if (!lockAcquired) {
            console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Skipped (already in progress)`);
            continue;
          }

          const now = Math.floor(Date.now() / 1000);
          let timeFrom: number;
          let timeTo: number = now;

          // Get state from database
          const state = await this.getSyncState(jobName, shop.shopId);

          // Determine time range based on job type
          if (config.isIncremental) {
            if (!state && config.daysBack) {
              // First run: use daysBack
              timeFrom = now - (config.daysBack * 24 * 60 * 60);
              console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: First run, fetching last ${config.daysBack} days`);
            } else if (state && config.overlapSeconds) {
              // Check for gap (catch-up after downtime)
              const gap = this.calculateGap(state.lastSyncTime);
              
              if (gap.needsCatchup) {
                console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Gap detected (${gap.gapHours.toFixed(2)} hours), starting catch-up`);
                
                if (gap.needsChunking) {
                  // Large gap: use chunking
                  console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Large gap, using chunking (${this.CHUNK_SIZE_HOURS}h chunks)`);
                  const synced = await this.syncWithChunking(
                    jobName,
                    shop.shopId,
                    Math.floor(state.lastSyncTime.getTime() / 1000),
                    now,
                    config.orderStatus,
                    config.timeRangeField || 'update_time' // ✅ Pass timeRangeField
                  );
                  totalSynced += synced;
                  
                  // Update state after catch-up
                  await this.updateSyncState(
                    jobName,
                    shop.shopId,
                    new Date(now * 1000),
                    new Date(now * 1000),
                    synced,
                    0
                  );
                  
                  console.log(`[background-sync] Job "${jobName}" synced ${synced} orders from shop ${shop.shopId} (chunked catch-up)`);
                  continue;
                } else {
                  // Small gap: normal catch-up
                  timeFrom = Math.floor(state.lastSyncTime.getTime() / 1000) - config.overlapSeconds;
                  console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Catch-up sync from ${new Date(timeFrom * 1000).toISOString()}`);
                }
              } else {
                // Normal incremental sync with overlap
                const lastSync = Math.floor(state.lastSyncTime.getTime() / 1000);
                timeFrom = lastSync - config.overlapSeconds;
                console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Incremental sync from ${new Date(timeFrom * 1000).toISOString()} (${config.overlapSeconds}s overlap)`);
              }
            } else {
              // Fallback: use 1 hour
              timeFrom = now - (60 * 60);
              console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Fallback to 1 hour range`);
            }
          } else {
            // Full scan: use daysBack with chunking if > 15 days
            const daysBack = config.daysBack || 7;
            
            // CRITICAL: Shopee API limit is 15 days per request
            // If daysBack > 15, we need to use syncShopeeOrdersService for auto-chunking
            if (daysBack > 15) {
              console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Full scan ${daysBack} days (will use chunking)`);
              
              // Use syncShopeeOrdersService for auto-chunking
              const { syncShopeeOrdersService } = await import('./order.service');
              const result = await syncShopeeOrdersService(
                shop.shopId,
                daysBack,
                "",
                config.orderStatus,
                config.timeRangeField || 'update_time'  // ✅ Use update_time to catch status changes
              );
              
              totalSynced += result.syncedCount;
              
              console.log(`[background-sync] Job "${jobName}" synced ${result.syncedCount} orders from shop ${shop.shopId} (chunked)`);
              continue;
            }
            
            // Normal full scan for <= 15 days
            timeFrom = now - (daysBack * 24 * 60 * 60);
            console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Full scan, last ${daysBack} days`);
          }

          // Sync orders using time range
          let cursor = '';
          let hasMore = true;
          let pageCount = 0;

          while (hasMore) {
            const result = await syncShopeeOrdersIncremental(
              shop.shopId,
              timeFrom,
              timeTo,
              cursor,
              config.orderStatus,
              config.timeRangeField || 'update_time'  // ✅ Pass timeRangeField
            );

            totalSynced += result.syncedCount;
            cursor = result.next_cursor;
            hasMore = result.has_more;
            pageCount++;

            // Log progress for long-running jobs
            if (pageCount % 5 === 0) {
              console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: page ${pageCount}, synced ${totalSynced} orders so far`);
            }

            // Small delay between pages to avoid rate limits
            if (hasMore) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Safety: Break if too many pages (prevent infinite loop)
            if (pageCount > 50) {
              console.warn(`[background-sync] Job "${jobName}" exceeded 50 pages, stopping pagination`);
              break;
            }
          }

          // Update state in database
          if (config.isIncremental) {
            await this.updateSyncState(
              jobName,
              shop.shopId,
              new Date(timeTo * 1000),
              new Date(timeTo * 1000),
              totalSynced,
              0
            );
          }

          console.log(`[background-sync] Job "${jobName}" synced ${totalSynced} orders from shop ${shop.shopId}`);
        } catch (shopError: any) {
          console.error(`[background-sync] Error syncing shop ${shop.shopId} in job "${jobName}":`, shopError.message);
          stats.errors++;
          
          // Update error count in database
          const state = await this.getSyncState(jobName, shop.shopId);
          if (state) {
            await this.updateSyncState(
              jobName,
              shop.shopId,
              state.lastSyncTime,
              state.lastSyncEndTime,
              0,
              1
            );
          }
        } finally {
          // CRITICAL: Always release lock, even if error or continue was called
          if (lockAcquired) {
            await this.setSyncLock(jobName, shop.shopId, false);
            console.log(`[background-sync] Job "${jobName}" - shop ${shop.shopId}: Lock released`);
          }
        }
      }

      // Update stats
      stats.lastSyncTime = new Date();
      stats.totalSynced += totalSynced;

      const duration = Date.now() - startTime;
      console.log(`[background-sync] Job "${jobName}" completed in ${duration}ms, synced ${totalSynced} orders`);
    } catch (error: any) {
      console.error(`[background-sync] Job "${jobName}" failed:`, error.message);
      stats.errors++;
    }
  }

  /**
   * Sync with chunking for large gaps (avoid timeout)
   */
  private async syncWithChunking(
    jobName: string,
    shopId: number,
    timeFrom: number,
    timeTo: number,
    orderStatus?: string,
    timeRangeField: 'create_time' | 'update_time' = 'update_time'  // ✅ Added parameter
  ): Promise<number> {
    const chunkSizeSeconds = this.CHUNK_SIZE_HOURS * 60 * 60;
    let totalSynced = 0;
    let currentFrom = timeFrom;

    console.log(`[background-sync] Job "${jobName}" - shop ${shopId}: Chunking from ${new Date(timeFrom * 1000).toISOString()} to ${new Date(timeTo * 1000).toISOString()} (${timeRangeField})`);

    while (currentFrom < timeTo) {
      const currentTo = Math.min(currentFrom + chunkSizeSeconds, timeTo);
      
      console.log(`[background-sync] Job "${jobName}" - shop ${shopId}: Processing chunk ${new Date(currentFrom * 1000).toISOString()} to ${new Date(currentTo * 1000).toISOString()}`);

      let cursor = '';
      let hasMore = true;
      let pageCount = 0;

      while (hasMore) {
        const result = await syncShopeeOrdersIncremental(
          shopId,
          currentFrom,
          currentTo,
          cursor,
          orderStatus,
          timeRangeField  // ✅ Pass through timeRangeField
        );

        totalSynced += result.syncedCount;
        cursor = result.next_cursor;
        hasMore = result.has_more;
        pageCount++;

        // Small delay between pages
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Safety: Break if too many pages
        if (pageCount > 50) {
          console.warn(`[background-sync] Job "${jobName}" chunk exceeded 50 pages, stopping pagination`);
          break;
        }
      }

      console.log(`[background-sync] Job "${jobName}" - shop ${shopId}: Chunk completed, synced ${totalSynced} orders so far`);

      // Move to next chunk
      currentFrom = currentTo;

      // Delay between chunks to avoid rate limits
      if (currentFrom < timeTo) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[background-sync] Job "${jobName}" - shop ${shopId}: Chunking completed, total synced: ${totalSynced}`);
    return totalSynced;
  }

  /**
   * Schedule the stuck orders refresh job.
   * OPTIMIZED: 30 minutes (was 15 min) - reduced frequency for API efficiency
   * This job directly queries the WMS database for orders stuck in READY_TO_SHIP or PROCESSED,
   * then batch-fetches their current status from Shopee API.
   * This handles the edge case where both create_time and update_time are outside the sync window.
   */
  private scheduleStuckOrdersJob(shops: { shopId: number }[]) {
    const jobName = 'stuck-orders-refresh';
    const intervalMs = 30 * 60 * 1000; // Every 30 minutes (was 15 min)

    this.syncStats.set(jobName, {
      lastSyncTime: new Date(),
      totalSynced: 0,
      errors: 0,
      activeJobs: 0
    });

    // Run immediately
    this.runStuckOrdersRefresh(shops);

    // Schedule recurring
    const intervalId = setInterval(() => {
      if (!this.isShuttingDown) {
        this.runStuckOrdersRefresh(shops);
      }
    }, intervalMs);

    this.activeJobs.set(jobName, intervalId);
    console.log(`[background-sync] Scheduled job "${jobName}": Refresh stuck READY_TO_SHIP/PROCESSED/SHIPPED/TO_CONFIRM_RECEIVE orders (every ${intervalMs / 1000}s)`);
  }

  /**
   * Directly refresh orders that are stuck in READY_TO_SHIP or PROCESSED status.
   * Instead of querying Shopee's get_order_list (which requires time ranges),
   * this queries our DB for stuck orders and batch-fetches their details directly.
   * 
   * INCLUDES CANCELLED: Also catches orders that were PROCESSED but got cancelled.
   */
  private async runStuckOrdersRefresh(shops: { shopId: number }[]) {
    const jobName = 'stuck-orders-refresh';
    const stats = this.syncStats.get(jobName);
    if (!stats) return;

    console.log(`[background-sync] Running job "${jobName}": Refreshing stuck orders`);
    const startTime = Date.now();
    let totalUpdated = 0;

    try {
      // Find all orders in DB that are stuck in READY_TO_SHIP, PROCESSED, or SHIPPED
      // SHIPPED is included because some orders may have already transitioned to COMPLETED
      // but the sync hasn't caught the update yet (e.g., update_time outside 15-day window)
      const stuckOrders = await db.select({
        orderSn: shopeeOrders.orderSn,
        shopId: shopeeOrders.shopId,
        orderStatus: shopeeOrders.orderStatus,
      })
        .from(shopeeOrders)
        .where(
          or(
            eq(shopeeOrders.orderStatus, 'READY_TO_SHIP'),
            eq(shopeeOrders.orderStatus, 'PROCESSED'),
            eq(shopeeOrders.orderStatus, 'SHIPPED'),
            eq(shopeeOrders.orderStatus, 'TO_CONFIRM_RECEIVE')
          )
        );

      if (stuckOrders.length === 0) {
        console.log(`[background-sync] Job "${jobName}": No stuck orders found`);
        return;
      }

      console.log(`[background-sync] Job "${jobName}": Found ${stuckOrders.length} stuck orders`);

      // Group by shopId
      const ordersByShop = new Map<number, string[]>();
      for (const order of stuckOrders) {
        if (!ordersByShop.has(order.shopId)) {
          ordersByShop.set(order.shopId, []);
        }
        ordersByShop.get(order.shopId)!.push(order.orderSn);
      }

      // Batch-fetch details from Shopee API (max 50 per request)
      for (const [shopId, orderSns] of ordersByShop.entries()) {
        const BATCH = 50;
        for (let i = 0; i < orderSns.length; i += BATCH) {
          if (i > 0) await new Promise(r => setTimeout(r, 500));

          const batchSns = orderSns.slice(i, i + BATCH);
          try {
            const detailRes = await getShopeeOrderDetails(shopId, batchSns);
            if (detailRes.error) {
              console.warn(`[background-sync] Job "${jobName}": Error fetching details for shop ${shopId}:`, detailRes.message);
              continue;
            }

            const orderDetails = detailRes.response?.order_list || [];
            for (const order of orderDetails) {
              const apiStatus = order.order_status;
              const existingRows = await db.select().from(shopeeOrders)
                .where(eq(shopeeOrders.orderSn, order.order_sn)).limit(1);
              
              if (existingRows.length === 0) continue;
              const existing = existingRows[0];
              const oldStatus = existing.orderStatus;

              // Determine final status (same logic as order.service.ts)
              let finalStatus = apiStatus;
              if (order.pickup_done_time && order.pickup_done_time > 0 && finalStatus === 'READY_TO_SHIP') {
                finalStatus = 'SHIPPED';
              }

              // A "tertunda" (held) order flips to shippable WITHOUT a status
              // change: it stays READY_TO_SHIP and only ship_by_date goes from 0
              // to a real timestamp. So we must refresh ship_by_date even when
              // the status is unchanged, otherwise the "Tertunda" badge would
              // never clear via background sync (only via manual sync).
              const apiShipByDate = order.ship_by_date ?? existing.shipByDate;
              if (finalStatus === oldStatus && apiShipByDate !== existing.shipByDate) {
                await db.update(shopeeOrders)
                  .set({ shipByDate: apiShipByDate, updatedAt: new Date() })
                  .where(eq(shopeeOrders.orderSn, order.order_sn));
                console.log(`[background-sync] Job "${jobName}": 🔄 ${order.order_sn} ship_by_date ${existing.shipByDate} → ${apiShipByDate} (status unchanged)`);
                totalUpdated++;
              }

              // Only update if status actually changed AND is not a downgrade
              // CRITICAL: CANCELLED has priority 99, so it will always override PROCESSED
              if (finalStatus !== oldStatus) {
                const STATUS_PRIORITY: Record<string, number> = {
                  'UNPAID': 0, 'READY_TO_SHIP': 1, 'PROCESSED': 2,
                  'SHIPPED': 3, 'TO_RETURN': 4, 'TO_CONFIRM_RECEIVE': 4, 'COMPLETED': 5,
                  'IN_CANCEL': 99, 'CANCELLED': 99,  // Terminal states: always override
                };
                const oldP = STATUS_PRIORITY[oldStatus] ?? 0;
                const newP = STATUS_PRIORITY[finalStatus] ?? 0;

                if (newP >= oldP) {
                  // Extract shipping carrier
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

                  console.log(`[background-sync] Job "${jobName}": ✅ Updated ${order.order_sn}: ${oldStatus} → ${finalStatus}`);
                  totalUpdated++;
                }
              }
            }
          } catch (err: any) {
            console.error(`[background-sync] Job "${jobName}": Error processing batch for shop ${shopId}:`, err.message);
          }
        }
      }

      stats.lastSyncTime = new Date();
      stats.totalSynced += totalUpdated;
      const duration = Date.now() - startTime;
      console.log(`[background-sync] Job "${jobName}" completed in ${duration}ms, updated ${totalUpdated} stuck orders`);
    } catch (error: any) {
      console.error(`[background-sync] Job "${jobName}" failed:`, error.message);
      stats.errors++;
    }
  }

  /**
   * Schedule periodic escrow sync — keeps shopee_order_fees and
   * escrow_release_time up to date for the financial report.
   *
   * Schedules two tiers (each with its own DB lock so they never block
   * each other):
   *   - HOT:  14 days back, every 1 hour   → fresh data for recent orders
   *   - COLD: 60 days back, once per day   → safety net for late releases
   *
   * Both tiers wrap `EscrowSyncService.startEscrowSync()` and share the
   * same self-heal logic; the only difference is the lock name and cadence.
   */
  private scheduleEscrowSyncJob() {
    this.scheduleEscrowTier({
      jobName: 'escrow-sync-hot',
      lockName: 'escrow_sync_hot',
      intervalMs: 60 * 60 * 1000,        // every 1 hour
      daysBack: 14,
      runOnStartup: true,
    });

    this.scheduleEscrowTier({
      jobName: 'escrow-sync-cold',
      lockName: 'escrow_sync_cold',
      intervalMs: 24 * 60 * 60 * 1000,   // once per day
      daysBack: 60,
      // Cold tier doesn't run on startup so it doesn't pile API calls onto
      // the same boot-up window as the hot tier. The first run lands one
      // intervalMs after startup (~24h later), which is fine because the
      // hot tier already covers the last 14 days from minute zero.
      runOnStartup: false,
    });
  }

  /**
   * Generic helper to schedule one escrow sync tier with its own lock.
   */
  private scheduleEscrowTier(opts: {
    jobName: string;
    lockName: string;
    intervalMs: number;
    daysBack: number;
    runOnStartup: boolean;
  }) {
    const { jobName, lockName, intervalMs, daysBack, runOnStartup } = opts;

    this.syncStats.set(jobName, {
      lastSyncTime: new Date(),
      totalSynced: 0,
      errors: 0,
      activeJobs: 0,
    });

    const run = async () => {
      if (this.isShuttingDown) return;
      const stats = this.syncStats.get(jobName)!;
      console.log(`[background-sync] Running job "${jobName}": last ${daysBack} days`);
      const startTime = Date.now();
      try {
        // Lazy-import to avoid a circular dependency (escrow-sync imports the
        // shared db client which background-sync already initialised).
        const { EscrowSyncService } = await import('./escrow-sync.service');
        const service = new EscrowSyncService(lockName);
        const result = await service.startEscrowSync(daysBack);
        stats.lastSyncTime = new Date();
        stats.totalSynced += result.totalSynced;
        const duration = Date.now() - startTime;
        console.log(
          `[background-sync] Job "${jobName}" completed in ${duration}ms — synced ${result.totalSynced}, skipped ${result.totalSkipped}, errors ${result.errors}`
        );
      } catch (err: any) {
        // SYNC_IN_PROGRESS just means a previous run of THIS tier is still
        // executing (or a manual sync grabbed the same lock name). Skip
        // this tick — there's nothing to do.
        if (err.message === 'SYNC_IN_PROGRESS') {
          console.log(`[background-sync] Job "${jobName}" skipped — previous run still in progress`);
          return;
        }
        console.error(`[background-sync] Job "${jobName}" failed:`, err.message);
        stats.errors++;
      }
    };

    if (runOnStartup) {
      run();
    }
    const intervalId = setInterval(run, intervalMs);
    this.activeJobs.set(jobName, intervalId);

    const intervalLabel = intervalMs >= 60 * 60 * 1000
      ? `${intervalMs / (60 * 60 * 1000)}h`
      : `${intervalMs / (60 * 1000)}m`;
    console.log(`[background-sync] Scheduled job "${jobName}": Every ${intervalLabel}, last ${daysBack}d (lock=${lockName}${runOnStartup ? ', runs on startup' : ''})`);
  }

  /**
   * Schedule periodic Shopee Ads expense sync — keeps the
   * `shopee_ads_daily_expense` cache hot so the "Biaya Iklan" column on
   * Laporan Keuangan never goes stale.
   *
   * Two tiers (each with own DB lock):
   *   - HOT:  7 days back,   every 30 minutes  → keeps recent days fresh
   *   - COLD: 180 days back, once per day      → backfill safety net
   *
   * Both tiers reuse `getTotalAdsExpense` which is cache-first + idempotent
   * (upsert), so re-running them is safe and cheap when the cache is warm.
   */
  private scheduleAdsExpenseSyncJob() {
    this.scheduleAdsExpenseTier({
      jobName: 'ads-expense-sync-hot',
      lockName: 'ads_expense_sync_hot',
      intervalMs: 30 * 60 * 1000,        // every 30 minutes
      daysBack: 7,
      runOnStartup: true,
    });

    this.scheduleAdsExpenseTier({
      jobName: 'ads-expense-sync-cold',
      lockName: 'ads_expense_sync_cold',
      intervalMs: 24 * 60 * 60 * 1000,   // once per day
      daysBack: 180,
      // Cold tier doesn't run on startup so we don't pile a 180-day fetch
      // onto the boot sequence. First run lands ~24h after startup; if you
      // need an immediate full backfill, run scripts/backfill-ads-expense.ts.
      runOnStartup: false,
    });
  }

  /**
   * Generic helper to schedule one ads-expense sync tier with its own lock.
   *
   * Lock semantics: we acquire `lockName` in `sync_state` before each run.
   * If a previous run of THIS tier (or a manual backfill that grabbed the
   * same lock name) is still in progress, we skip this tick.
   */
  private scheduleAdsExpenseTier(opts: {
    jobName: string;
    lockName: string;
    intervalMs: number;
    daysBack: number;
    runOnStartup: boolean;
  }) {
    const { jobName, lockName, intervalMs, daysBack, runOnStartup } = opts;

    this.syncStats.set(jobName, {
      lastSyncTime: new Date(),
      totalSynced: 0,
      errors: 0,
      activeJobs: 0,
    });

    const run = async () => {
      if (this.isShuttingDown) return;
      const stats = this.syncStats.get(jobName)!;

      // Acquire lock (sentinel shopId 0 = global, matches escrow-sync convention)
      const locked = await this.setSyncLock(lockName, 0, true);
      if (!locked) {
        console.log(`[background-sync] Job "${jobName}" skipped — previous run still holds lock "${lockName}"`);
        return;
      }

      console.log(`[background-sync] Running job "${jobName}": last ${daysBack} days`);
      const startTime = Date.now();
      let synced = 0;

      try {
        // Lazy-import to avoid potential circular dependencies.
        const { getTotalAdsExpense } = await import('./ads-expense.service');

        // Compute WIB date range: today_minus_daysBack .. yesterday.
        // Today is excluded — the service already has a 15-min TTL for today's
        // row, so the next tick will refresh it naturally.
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric', month: '2-digit', day: '2-digit',
        });
        const startDate = fmt.format(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000));
        const endDate = fmt.format(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000));

        const shops = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials)
          .where(eq(shopeeCredentials.status, "connected"));
        if (shops.length === 0) {
          console.log(`[background-sync] Job "${jobName}" skipped — no shops connected`);
          return;
        }

        const shopIds = shops.map((s) => s.shopId);
        // forceRefresh: re-fetch from Shopee instead of trusting the cache.
        // Shopee revises ad spend retroactively for several days, so a plain
        // cache-first read leaves past days frozen at their first-fetched value.
        // The scheduled job exists precisely to keep those numbers accurate, so
        // it always pulls fresh data and overwrites the cache.
        const result = await getTotalAdsExpense(shopIds, startDate, endDate, { forceRefresh: true });
        synced = shopIds.length - result.skippedShops.length;

        stats.lastSyncTime = new Date();
        stats.totalSynced += synced;
        const duration = Date.now() - startTime;
        console.log(
          `[background-sync] Job "${jobName}" completed in ${duration}ms — range=${startDate}..${endDate}, ok=${synced}, skipped=${result.skippedShops.length}, total=Rp ${result.total.toLocaleString('id-ID')}`
        );
        if (result.skippedShops.length > 0) {
          for (const s of result.skippedShops) {
            console.warn(`[background-sync] Job "${jobName}" skipped shop ${s.shopId}: ${s.errorCode} — ${s.message}`);
          }
        }
      } catch (err: any) {
        console.error(`[background-sync] Job "${jobName}" failed:`, err.message);
        stats.errors++;
      } finally {
        // Always release lock so next tick can run.
        try {
          await this.setSyncLock(lockName, 0, false);
        } catch (lockErr: any) {
          console.warn(`[background-sync] Job "${jobName}" failed to release lock "${lockName}":`, lockErr.message);
        }
      }
    };

    if (runOnStartup) {
      run();
    }
    const intervalId = setInterval(run, intervalMs);
    this.activeJobs.set(jobName, intervalId);

    const intervalLabel = intervalMs >= 60 * 60 * 1000
      ? `${intervalMs / (60 * 60 * 1000)}h`
      : `${intervalMs / (60 * 1000)}m`;
    console.log(`[background-sync] Scheduled job "${jobName}": Every ${intervalLabel}, last ${daysBack}d (lock=${lockName}${runOnStartup ? ', runs on startup' : ''})`);
  }

  /**
   * Stop all background sync jobs
   */
  stopBackgroundSync() {
    console.log('[background-sync] Stopping background sync service...');
    this.isShuttingDown = true;

    // Clear all intervals
    for (const [jobName, intervalId] of this.activeJobs.entries()) {
      clearInterval(intervalId);
      console.log(`[background-sync] Stopped job "${jobName}"`);
    }

    this.activeJobs.clear();
    console.log('[background-sync] All sync jobs stopped');
  }

  /**
   * Get sync statistics for monitoring (from database)
   */
  async getSyncStats() {
    const stats: any = {};
    
    // Get all sync states from database
    const allStates = await db.select().from(syncState);
    
    // Group by job name
    const jobGroups = new Map<string, typeof allStates>();
    for (const state of allStates) {
      if (!jobGroups.has(state.jobName)) {
        jobGroups.set(state.jobName, []);
      }
      jobGroups.get(state.jobName)!.push(state);
    }
    
    // Aggregate stats per job
    for (const [jobName, states] of jobGroups.entries()) {
      const totalSynced = states.reduce((sum, s) => sum + s.totalSynced, 0);
      const totalErrors = states.reduce((sum, s) => sum + s.errors, 0);
      const lastSyncTimes = states.map(s => s.lastSyncTime.getTime());
      const latestSyncTime = new Date(Math.max(...lastSyncTimes));
      const anyInProgress = states.some(s => s.syncInProgress === 1);
      
      stats[jobName] = {
        lastSyncTime: latestSyncTime.toISOString(),
        totalSynced,
        errors: totalErrors,
        isActive: this.activeJobs.has(jobName),
        syncInProgress: anyInProgress,
        shops: states.length
      };
    }
    
    return stats;
  }

  /**
   * Force sync for specific order statuses (manual trigger)
   */
  async forceSyncOrders(orderStatus?: string, daysBack: number = 15) {
    console.log(`[background-sync] Force sync triggered for status: ${orderStatus || 'ALL'}, days: ${daysBack}`);
    
    const shops = await db.select({ shopId: shopeeCredentials.shopId }).from(shopeeCredentials)
      .where(eq(shopeeCredentials.status, "connected"));
    let totalSynced = 0;

    for (const shop of shops) {
      let cursor = '';
      let hasMore = true;

      while (hasMore) {
        const result = await syncShopeeOrdersService(
          shop.shopId,
          daysBack,
          cursor,
          orderStatus
        );

        totalSynced += result.syncedCount;
        cursor = result.next_cursor;
        hasMore = result.has_more;

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }

    console.log(`[background-sync] Force sync completed, synced ${totalSynced} orders`);
    return { totalSynced };
  }
}

// Singleton instance
export const backgroundSyncService = new BackgroundSyncService();
