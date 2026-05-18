/**
 * Test script to find SPX Standard order and check its logistics_channel_id
 */

import { db } from './src/db/client';
import { shopeeOrders } from './src/db/schema';
import { and, eq, like, isNotNull } from 'drizzle-orm';
import { collectLabelData } from './src/services/label-data.service';

async function testSpxStandard() {
  console.log('\n🔍 Finding SPX Standard order...\n');

  // Find a PROCESSED order with SPX Standard and tracking number
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
    console.log('❌ No PROCESSED SPX Standard orders found with tracking number');
    console.log('\nSearching for any SPX Standard order (any status)...');
    
    const anyStandard = await db
      .select()
      .from(shopeeOrders)
      .where(like(shopeeOrders.shippingCarrier, '%SPX Standard%'))
      .limit(5);
    
    if (anyStandard.length > 0) {
      console.log(`\nFound ${anyStandard.length} SPX Standard orders:`);
      anyStandard.forEach(o => {
        console.log(`  - ${o.orderSn} (${o.orderStatus}) - Tracking: ${o.trackingNumber || 'N/A'}`);
      });
      
      // Try to test the first one even without tracking number
      if (anyStandard.length > 0) {
        const testOrder = anyStandard.find(o => o.orderStatus === 'PROCESSED') || anyStandard[0];
        console.log(`\n📦 Testing order: ${testOrder.orderSn}`);
        console.log(`   Status: ${testOrder.orderStatus}`);
        console.log(`   Shipping Carrier: ${testOrder.shippingCarrier}`);
        console.log(`   Tracking Number: ${testOrder.trackingNumber || 'N/A'}`);
        console.log('');
        
        if (testOrder.orderStatus !== 'PROCESSED') {
          console.log('⚠️  Order is not PROCESSED, might not have tracking number yet');
          console.log('   But we can still check logistics_channel_id from get_order_detail\n');
        }
        
        // Just get order detail to see logistics_channel_id
        console.log('📄 Fetching order detail to check logistics_channel_id...\n');
        
        try {
          const { getShopeeOrderDetails } = await import('./src/services/shopee-raw');
          const detailRes = await getShopeeOrderDetails(testOrder.shopId, [testOrder.orderSn]);
          const orderDetail = detailRes?.response?.order_list?.[0];
          const logisticsChannelId = orderDetail?.package_list?.[0]?.logistics_channel_id;
          
          console.log('✅ Order detail fetched:');
          console.log(`   Shipping Carrier: ${orderDetail?.shipping_carrier || orderDetail?.package_list?.[0]?.shipping_carrier || 'N/A'}`);
          console.log(`   Logistics Channel ID: ${logisticsChannelId || 'N/A'}`);
          console.log('');
          
          if (logisticsChannelId) {
            console.log(`🎯 SPX Standard logistics_channel_id = ${logisticsChannelId}`);
          } else {
            console.log('⚠️  logistics_channel_id not found in API response');
          }
        } catch (err: any) {
          console.error('❌ Error fetching order detail:', err.message);
        }
      }
    } else {
      console.log('❌ No SPX Standard orders found at all');
    }
    return;
  }

  const order = orders[0];
  console.log('📦 Found PROCESSED SPX Standard order:');
  console.log(`   Order SN: ${order.orderSn}`);
  console.log(`   Status: ${order.orderStatus}`);
  console.log(`   Shipping Carrier: ${order.shippingCarrier}`);
  console.log(`   Tracking Number: ${order.trackingNumber}`);
  console.log('');

  // Collect label data to see logistics_channel_id in logs
  console.log('📄 Collecting label data...\n');
  
  try {
    const labelData = await collectLabelData(order.orderSn);
    
    console.log('\n✅ Label data collected successfully:');
    console.log(`   Service Type: ${labelData.serviceType}`);
    console.log(`   Shipping Carrier: ${labelData.shippingCarrier}`);
    console.log(`   Tracking Number: ${labelData.trackingNumber}`);
    console.log('');
    
    if (labelData.serviceType === 'STD') {
      console.log('✅ Service type is correctly detected as STD');
    } else {
      console.log(`⚠️  Service type is ${labelData.serviceType}, expected STD`);
    }
  } catch (err: any) {
    console.error('❌ Error collecting label data:', err.message);
  }
}

testSpxStandard()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
