import { db } from './src/db/client';
import { shopeeOrderItems } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function checkModelSku() {
  console.log('Checking model_sku data in shopee_order_items...\n');

  // Count total items
  const totalResult = await db.select({ count: sql<number>`count(*)` }).from(shopeeOrderItems);
  const total = totalResult[0].count;
  console.log(`Total items: ${total}`);

  // Count items with model_sku
  const withSkuResult = await db.select({ count: sql<number>`count(*)` })
    .from(shopeeOrderItems)
    .where(sql`model_sku IS NOT NULL AND model_sku != ''`);
  const withSku = withSkuResult[0].count;
  console.log(`Items with model_sku: ${withSku}`);

  // Count items without model_sku
  const withoutSkuResult = await db.select({ count: sql<number>`count(*)` })
    .from(shopeeOrderItems)
    .where(sql`model_sku IS NULL OR model_sku = ''`);
  const withoutSku = withoutSkuResult[0].count;
  console.log(`Items without model_sku: ${withoutSku}`);

  // Sample data
  console.log('\nSample data (first 10 items):');
  const samples = await db.select({
    orderSn: shopeeOrderItems.orderSn,
    itemName: shopeeOrderItems.itemName,
    modelName: shopeeOrderItems.modelName,
    modelSku: shopeeOrderItems.modelSku,
    qty: shopeeOrderItems.qty
  }).from(shopeeOrderItems).limit(10);

  samples.forEach(item => {
    console.log(`\nOrder: ${item.orderSn}`);
    console.log(`  Item: ${item.itemName}`);
    console.log(`  Model Name: ${item.modelName || 'NULL'}`);
    console.log(`  Model SKU: ${item.modelSku || 'NULL'}`);
    console.log(`  Qty: ${item.qty}`);
  });

  process.exit(0);
}

checkModelSku().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
