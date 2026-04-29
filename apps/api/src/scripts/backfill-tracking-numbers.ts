/**
 * Backfill Tracking Numbers Script
 * 
 * This script fetches and updates tracking numbers for all PROCESSED orders
 * that don't have tracking numbers yet in the database.
 * 
 * Usage:
 *   bun run apps/api/src/scripts/backfill-tracking-numbers.ts
 */

import { db } from "../db/client";
import { shopeeOrders } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getTrackingNumber } from "../services/shopee-label";

async function backfillTrackingNumbers() {
  console.log('[backfill] Starting tracking number backfill...');
  console.log('[backfill] Timestamp:', new Date().toISOString());

  try {
    // Find all PROCESSED orders without tracking numbers
    const ordersWithoutTracking = await db.select()
      .from(shopeeOrders)
      .where(and(
        eq(shopeeOrders.orderStatus, 'PROCESSED'),
        isNull(shopeeOrders.trackingNumber)
      ));

    console.log(`[backfill] Found ${ordersWithoutTracking.length} PROCESSED orders without tracking numbers`);

    if (ordersWithoutTracking.length === 0) {
      console.log('[backfill] No orders to backfill. Exiting.');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let notAvailableCount = 0;

    // Process each order
    for (let i = 0; i < ordersWithoutTracking.length; i++) {
      const order = ordersWithoutTracking[i];
      const progress = `[${i + 1}/${ordersWithoutTracking.length}]`;

      console.log(`${progress} Processing order: ${order.orderSn}`);

      try {
        // Fetch tracking number from Shopee API
        const trackingInfo = await getTrackingNumber(order.shopId, order.orderSn);
        const trackingNumber = trackingInfo?.response?.tracking_number
          || trackingInfo?.result?.tracking_number;

        if (trackingNumber) {
          // Update database
          await db.update(shopeeOrders)
            .set({
              trackingNumber: trackingNumber,
              updatedAt: new Date()
            })
            .where(eq(shopeeOrders.orderSn, order.orderSn));

          console.log(`${progress} ✅ Success: ${order.orderSn} → ${trackingNumber}`);
          successCount++;
        } else {
          console.log(`${progress} ⚠️  Not available yet: ${order.orderSn}`);
          notAvailableCount++;
        }

        // Rate limiting: wait 500ms between requests
        if (i < ordersWithoutTracking.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error: any) {
        console.error(`${progress} ❌ Error: ${order.orderSn} - ${error.message}`);
        failCount++;

        // Continue with next order even if this one fails
        continue;
      }
    }

    // Summary
    console.log('\n[backfill] ═══════════════════════════════════════');
    console.log('[backfill] Backfill completed!');
    console.log('[backfill] ═══════════════════════════════════════');
    console.log(`[backfill] Total orders processed: ${ordersWithoutTracking.length}`);
    console.log(`[backfill] ✅ Successfully updated: ${successCount}`);
    console.log(`[backfill] ⚠️  Not available yet: ${notAvailableCount}`);
    console.log(`[backfill] ❌ Failed: ${failCount}`);
    console.log('[backfill] ═══════════════════════════════════════\n');

    if (notAvailableCount > 0) {
      console.log('[backfill] Note: Some tracking numbers are not available yet.');
      console.log('[backfill] You can run this script again later to retry those orders.');
    }

  } catch (error: any) {
    console.error('[backfill] Fatal error:', error.message);
    console.error('[backfill] Stack:', error.stack);
    process.exit(1);
  }
}

// Run the backfill
backfillTrackingNumbers()
  .then(() => {
    console.log('[backfill] Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[backfill] Script failed:', error);
    process.exit(1);
  });
