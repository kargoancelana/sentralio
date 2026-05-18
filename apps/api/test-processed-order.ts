/**
 * Test script to find and test a PROCESSED SPX Hemat order
 */

import { db } from './src/db/client';
import { shopeeOrders } from './src/db/schema';
import { and, eq, like, isNotNull } from 'drizzle-orm';
import { collectLabelData } from './src/services/label-data.service';

async function testProcessedOrder() {
  console.log('\n🔍 Finding PROCESSED SPX Hemat order...\n');

  // Find a PROCESSED order with SPX Hemat and tracking number
  const orders = await db
    .select()
    .from(shopeeOrders)
    .where(
      and(
        eq(shopeeOrders.orderStatus, 'PROCESSED'),
        like(shopeeOrders.shippingCarrier, '%SPX Hemat%'),
        isNotNull(shopeeOrders.trackingNumber)
      )
    )
    .limit(1);

  if (orders.length === 0) {
    console.log('❌ No PROCESSED SPX Hemat orders found with tracking number');
    console.log('\nTry finding any PROCESSED SPX order...');
    
    const anySpx = await db
      .select()
      .from(shopeeOrders)
      .where(
        and(
          eq(shopeeOrders.orderStatus, 'PROCESSED'),
          like(shopeeOrders.shippingCarrier, '%SPX%')
        )
      )
      .limit(5);
    
    if (anySpx.length > 0) {
      console.log(`\nFound ${anySpx.length} PROCESSED SPX orders:`);
      anySpx.forEach(o => {
        console.log(`  - ${o.orderSn} (${o.shippingCarrier}) - Tracking: ${o.trackingNumber || 'N/A'}`);
      });
    }
    return;
  }

  const order = orders[0];
  console.log('📦 Found PROCESSED order:');
  console.log(`   Order SN: ${order.orderSn}`);
  console.log(`   Status: ${order.orderStatus}`);
  console.log(`   Shipping Carrier: ${order.shippingCarrier}`);
  console.log(`   Tracking Number: ${order.trackingNumber}`);
  console.log('');

  // Collect label data
  console.log('📄 Collecting label data...\n');
  
  try {
    const labelData = await collectLabelData(order.orderSn);
    
    console.log('\n✅ Label data collected successfully:');
    console.log(`   Service Type: ${labelData.serviceType}`);
    console.log(`   Shipping Carrier: ${labelData.shippingCarrier}`);
    console.log(`   Tracking Number: ${labelData.trackingNumber}`);
    console.log('');
    
    if (labelData.serviceType === 'ECO') {
      console.log('🎉 SUCCESS! Service type is correctly detected as ECO');
    } else {
      console.log(`⚠️  WARNING! Service type is ${labelData.serviceType}, expected ECO`);
    }
  } catch (err: any) {
    console.error('❌ Error collecting label data:', err.message);
  }
}

testProcessedOrder()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
