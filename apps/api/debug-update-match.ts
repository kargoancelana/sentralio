import { db } from './src/db/client';
import { shopeeOrderItems, shopeeOrders, productGroups, products } from './src/db/schema';
import { eq, and } from 'drizzle-orm';

async function debugUpdateMatch() {
  const orderSn = '260503F59667KC';
  
  console.log(`Debugging update match for order: ${orderSn}\n`);
  
  // Get order items
  const items = await db.select({
    id: shopeeOrderItems.id,
    orderSn: shopeeOrderItems.orderSn,
    itemName: shopeeOrderItems.itemName,
    modelName: shopeeOrderItems.modelName,
    modelSku: shopeeOrderItems.modelSku
  })
  .from(shopeeOrderItems)
  .innerJoin(shopeeOrders, eq(shopeeOrderItems.orderSn, shopeeOrders.orderSn))
  .where(eq(shopeeOrderItems.orderSn, orderSn));
  
  console.log(`Order items (${items.length}):`);
  
  for (const item of items) {
    console.log(`\n--- Item: ${item.modelName} ---`);
    console.log(`  itemName: "${item.itemName}"`);
    console.log(`  modelName: "${item.modelName}"`);
    console.log(`  modelSku: "${item.modelSku}"`);
    
    // Try to find matching product in productGroups
    const matchingGroups = await db.select({
      id: productGroups.id,
      name: productGroups.name,
      shopeeItemId: productGroups.shopeeItemId
    })
    .from(productGroups)
    .where(eq(productGroups.name, item.itemName));
    
    console.log(`\n  Matching product groups (by itemName): ${matchingGroups.length}`);
    matchingGroups.forEach(g => {
      console.log(`    - "${g.name}" (item_id: ${g.shopeeItemId})`);
    });
    
    // Try to find matching product variant
    if (matchingGroups.length > 0) {
      for (const group of matchingGroups) {
        const matchingProducts = await db.select({
          id: products.id,
          modelName: products.modelName,
          modelSku: products.modelSku,
          shopeeModelId: products.shopeeModelId
        })
        .from(products)
        .where(
          and(
            eq(products.groupId, group.id),
            eq(products.modelName, item.modelName || '')
          )
        );
        
        console.log(`\n  Matching variants in group "${group.name}": ${matchingProducts.length}`);
        matchingProducts.forEach(p => {
          console.log(`    - "${p.modelName}" → SKU: "${p.modelSku}" (model_id: ${p.shopeeModelId})`);
        });
      }
    }
  }
  
  process.exit(0);
}

debugUpdateMatch().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
