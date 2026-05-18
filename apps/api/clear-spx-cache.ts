/**
 * Script to clear label cache for SPX orders
 * This forces fresh API calls to get logistics_channel_id
 */

import { db } from './src/db/client';
import { shopeeOrders, labelCacheTable } from './src/db/schema';
import { eq, like, inArray } from 'drizzle-orm';

async function clearSpxCache() {
  console.log('🗑️  Clearing SPX label cache...\n');

  // Find SPX orders with PROCESSED status
  const orders = await db
    .select()
    .from(shopeeOrders)
    .where(like(shopeeOrders.shippingCarrier, '%SPX%'))
    .limit(50);

  const orderSns = orders.map(o => o.orderSn);
  
  if (orderSns.length === 0) {
    console.log('No SPX orders found');
    return;
  }

  console.log(`Found ${orderSns.length} SPX orders`);

  // Delete cache for these orders
  const result = await db
    .delete(labelCacheTable)
    .where(inArray(labelCacheTable.orderSn, orderSns));

  console.log(`✅ Cleared cache for ${orderSns.length} SPX orders`);
  console.log('\nNow print a label for one of these orders:');
  
  // Show some PROCESSED orders
  const processedOrders = orders.filter(o => o.orderStatus === 'PROCESSED').slice(0, 5);
  if (processedOrders.length > 0) {
    console.log('\nPROCESSED orders (ready to print):');
    processedOrders.forEach(o => {
      console.log(`  - ${o.orderSn} (${o.shippingCarrier})`);
    });
  }
}

clearSpxCache()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
