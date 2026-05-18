/**
 * Test script to process order and print label
 * Order: 260507Q2S7HQC6
 */

import { db } from './src/db/client';
import { shopeeOrders } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { collectLabelData } from './src/services/label-data.service';

async function testOrderLabel() {
  const orderSn = '260507Q2S7HQC6';
  
  console.log(`\n🔍 Testing order: ${orderSn}\n`);

  // 1. Check order in database
  const orders = await db
    .select()
    .from(shopeeOrders)
    .where(eq(shopeeOrders.orderSn, orderSn))
    .limit(1);

  if (orders.length === 0) {
    console.log('❌ Order not found in database');
    console.log('Run order sync first to fetch this order from Shopee');
    return;
  }

  const order = orders[0];
  console.log('📦 Order found:');
  console.log(`   Status: ${order.orderStatus}`);
  console.log(`   Shipping Carrier: ${order.shippingCarrier}`);
  console.log(`   Tracking Number: ${order.trackingNumber || 'N/A'}`);
  console.log('');

  // 2. Collect label data (this will call Shopee API and log everything)
  console.log('📄 Collecting label data...\n');
  
  try {
    const labelData = await collectLabelData(orderSn);
    
    console.log('\n✅ Label data collected successfully:');
    console.log(`   Service Type: ${labelData.serviceType}`);
    console.log(`   Shipping Carrier: ${labelData.shippingCarrier}`);
    console.log(`   Tracking Number: ${labelData.trackingNumber}`);
    console.log(`   Sort Code: ${labelData.sortCode}`);
    console.log(`   Batch Code: ${labelData.batchCode}`);
    console.log(`   Weight: ${labelData.weight}`);
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

testOrderLabel()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
