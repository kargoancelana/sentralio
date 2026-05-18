import { db } from './src/db/client';
import { shopeeOrderItems } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function checkEmptySku() {
  console.log('Checking items with empty/null model_sku...\n');

  // Count items with empty SKU
  const emptySkuResult = await db.select({ count: sql<number>`count(*)` })
    .from(shopeeOrderItems)
    .where(sql`model_sku IS NULL OR model_sku = ''`);
  const emptyCount = emptySkuResult[0].count;

  console.log(`Total items with empty/null model_sku: ${emptyCount}\n`);

  if (emptyCount > 0) {
    // Show sample of empty SKU items
    const samples = await db.select({
      orderSn: shopeeOrderItems.orderSn,
      itemName: shopeeOrderItems.itemName,
      modelName: shopeeOrderItems.modelName,
      modelSku: shopeeOrderItems.modelSku,
      qty: shopeeOrderItems.qty
    })
    .from(shopeeOrderItems)
    .where(sql`model_sku IS NULL OR model_sku = ''`)
    .limit(20);

    console.log('Sample items with empty SKU:');
    samples.forEach(item => {
      console.log(`\nOrder: ${item.orderSn}`);
      console.log(`  Item: ${item.itemName}`);
      console.log(`  Model Name: ${item.modelName || 'NULL'}`);
      console.log(`  Model SKU: ${item.modelSku || 'NULL'}`);
      console.log(`  Qty: ${item.qty}`);
    });
  }

  process.exit(0);
}

checkEmptySku().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
