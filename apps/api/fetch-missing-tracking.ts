/**
 * Fetch missing tracking numbers for PROCESSED orders
 * This script fetches tracking numbers for orders that were successfully processed
 * but don't have tracking numbers yet due to batch tracking retrieval failure
 */

import { db } from "./src/db/client";
import { shopeeOrders } from "./src/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getTrackingNumber } from "./src/services/shopee-label";

async function fetchMissingTrackingNumbers() {
  console.log('🔍 Finding PROCESSED orders without tracking numbers...\n');

  // Find all PROCESSED orders without tracking numbers
  const ordersWithoutTracking = await db.select()
    .from(shopeeOrders)
    .where(
      and(
        eq(shopeeOrders.orderStatus, "PROCESSED"),
        isNull(shopeeOrders.trackingNumber)
      )
    );

  console.log(`📋 Found ${ordersWithoutTracking.length} orders without tracking numbers\n`);

  if (ordersWithoutTracking.length === 0) {
    console.log('✅ All PROCESSED orders have tracking numbers');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const order of ordersWithoutTracking) {
    try {
      console.log(`\n🔄 Fetching tracking for ${order.orderSn}...`);
      
      // Wait 500ms between requests to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

      const trackingResponse = await getTrackingNumber(order.shopId, order.orderSn);
      const trackingNumber = trackingResponse?.response?.tracking_number
        || trackingResponse?.result?.tracking_number;

      if (trackingNumber) {
        // Update database
        await db.update(shopeeOrders)
          .set({
            trackingNumber: trackingNumber,
            updatedAt: new Date()
          })
          .where(eq(shopeeOrders.orderSn, order.orderSn));

        console.log(`✅ ${order.orderSn}: ${trackingNumber}`);
        successCount++;
      } else {
        console.log(`⚠️  ${order.orderSn}: Tracking number not yet available`);
        failCount++;
      }
    } catch (error: any) {
      console.error(`❌ ${order.orderSn}: Error - ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📦 Total: ${ordersWithoutTracking.length}`);
}

// Run the script
fetchMissingTrackingNumbers()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
