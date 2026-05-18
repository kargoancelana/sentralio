import { db } from './src/db/client';
import { shopeeOrderItems, shopeeOrders } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function checkSpecificOrder() {
  const orderSn = '260503F59667KC';
  
  console.log(`Checking order: ${orderSn}\n`);
  
  // Get order info
  const orderResult = await db.select()
    .from(shopeeOrders)
    .where(eq(shopeeOrders.orderSn, orderSn))
    .limit(1);
  
  if (orderResult.length === 0) {
    console.log('Order not found!');
    process.exit(1);
  }
  
  console.log('Order info:');
  console.log(`  Shop ID: ${orderResult[0].shopId}`);
  console.log(`  Status: ${orderResult[0].orderStatus}`);
  console.log(`  Tracking: ${orderResult[0].trackingNumber || 'NULL'}\n`);
  
  // Get order items
  const items = await db.select()
    .from(shopeeOrderItems)
    .where(eq(shopeeOrderItems.orderSn, orderSn));
  
  console.log(`Order items (${items.length} items):`);
  items.forEach((item, idx) => {
    console.log(`\n  Item ${idx + 1}:`);
    console.log(`    Item Name: ${item.itemName}`);
    console.log(`    Model Name: ${item.modelName || 'NULL'}`);
    console.log(`    Model SKU: ${item.modelSku || 'NULL'}`);
    console.log(`    Qty: ${item.qty}`);
    console.log(`    Is Empty: ${!item.modelSku || item.modelSku === ''}`);
  });
  
  process.exit(0);
}

checkSpecificOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
