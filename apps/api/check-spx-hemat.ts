/**
 * Script to check SPX Hemat order data from database
 * This helps debug the service type detection issue
 */

import { db } from './src/db/client';
import { shopeeOrders, labelCacheTable } from './src/db/schema';
import { eq, like } from 'drizzle-orm';

async function checkSpxHematOrders() {
  console.log('🔍 Checking SPX Hemat orders...\n');

  // Find orders with SPX Hemat in shipping carrier
  const orders = await db
    .select()
    .from(shopeeOrders)
    .where(like(shopeeOrders.shippingCarrier, '%SPX%'))
    .limit(20);

  console.log(`Found ${orders.length} SPX orders\n`);

  for (const order of orders) {
    console.log('─'.repeat(80));
    console.log(`Order SN: ${order.orderSn}`);
    console.log(`Status: ${order.orderStatus}`);
    console.log(`Shipping Carrier: ${order.shippingCarrier}`);
    console.log(`Tracking Number: ${order.trackingNumber || 'N/A'}`);
    
    // Check if label is cached
    const cache = await db
      .select()
      .from(labelCacheTable)
      .where(eq(labelCacheTable.orderSn, order.orderSn))
      .limit(1);

    if (cache.length > 0 && cache[0].labelDataJson) {
      try {
        const labelData = JSON.parse(cache[0].labelDataJson);
        console.log(`Cached Service Type: ${labelData.serviceType}`);
        console.log(`Cached Shipping Carrier: ${labelData.shippingCarrier}`);
      } catch (err) {
        console.log('Cache parse error');
      }
    } else {
      console.log('No cache found');
    }
    console.log('');
  }

  console.log('─'.repeat(80));
  console.log('\n✅ Done! Now we need to:');
  console.log('1. Find an order with "5-Day Delivery (SPX)" or similar');
  console.log('2. Delete its cache to force fresh API call');
  console.log('3. Print the label again to see logistics_channel_id in logs');
}

checkSpxHematOrders()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
