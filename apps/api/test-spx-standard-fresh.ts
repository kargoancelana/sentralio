/**
 * Test SPX Standard with fresh API call (delete cache first)
 */

import { db } from './src/db/client';
import { shopeeOrders, labelCacheTable } from './src/db/schema';
import { and, eq, like, isNotNull } from 'drizzle-orm';
import { collectLabelData } from './src/services/label-data.service';

async function testSpxStandardFresh() {
  console.log('\n🔍 Finding SPX Standard order...\n');

  const orders = await db
    .select()
    .from(shopeeOrders)
    .where(
      and(
        eq(shopeeOrders.orderStatus, 'PROCESSED'),
        like(shopeeOrders.shippingCarrier, '%SPX Standard%'),
        isNotNull(shopeeOrders.trackingNumber)
      )
    )
    .limit(1);

  if (orders.length === 0) {
    console.log('❌ No PROCESSED SPX Standard orders found');
    return;
  }

  const order = orders[0];
  console.log('📦 Found order:', order.orderSn);
  console.log('   Carrier:', order.shippingCarrier);
  console.log('');

  // Delete cache first
  console.log('🗑️  Deleting cache...');
  await db
    .delete(labelCacheTable)
    .where(eq(labelCacheTable.orderSn, order.orderSn));
  console.log('✅ Cache deleted\n');

  // Collect label data (fresh API call)
  console.log('📄 Collecting label data (fresh API call)...\n');
  
  try {
    const labelData = await collectLabelData(order.orderSn);
    
    console.log('\n✅ Label data collected:');
    console.log(`   Service Type: ${labelData.serviceType}`);
    console.log(`   Shipping Carrier: ${labelData.shippingCarrier}`);
    console.log('');
    
    // Check logs above for logistics_channel_id
    console.log('👆 Check logs above for logistics_channel_id value');
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

testSpxStandardFresh()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
