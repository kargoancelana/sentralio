import { db } from './src/db/client';
import { shopeeOrderItems } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function checkWithSku() {
  console.log('Checking items WITH model_sku...\n');

  const items = await db.select({
    orderSn: shopeeOrderItems.orderSn,
    itemName: shopeeOrderItems.itemName,
    modelName: shopeeOrderItems.modelName,
    modelSku: shopeeOrderItems.modelSku,
    qty: shopeeOrderItems.qty
  })
  .from(shopeeOrderItems)
  .where(sql`model_sku IS NOT NULL AND model_sku != ''`)
  .limit(20);

  console.log(`Found ${items.length} items with model_sku:\n`);

  items.forEach(item => {
    console.log(`Order: ${item.orderSn}`);
    console.log(`  Model Name: ${item.modelName}`);
    console.log(`  Model SKU: ${item.modelSku}`);
    console.log(`  Qty: ${item.qty}\n`);
  });

  process.exit(0);
}

checkWithSku().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
