/**
 * Backfill model_sku from products table to shopee_order_items table
 * 
 * Problem: User has filled model_sku in Produk Channel (products table),
 * but shopee_order_items table still has NULL model_sku values.
 * 
 * Solution: Copy model_sku from products to shopee_order_items based on:
 * - Same shop_id
 * - Same shopee_item_id (product)
 * - Same model_name (variant name)
 */

import { db } from './src/db/client';
import { shopeeOrderItems, shopeeOrders, products } from './src/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

async function backfillModelSku() {
  console.log('Starting model_sku backfill...\n');

  // Get all order items that need model_sku
  const itemsNeedingSku = await db
    .select({
      id: shopeeOrderItems.id,
      orderSn: shopeeOrderItems.orderSn,
      itemName: shopeeOrderItems.itemName,
      modelName: shopeeOrderItems.modelName,
    })
    .from(shopeeOrderItems)
    .where(sql`model_sku IS NULL OR model_sku = ''`);

  console.log(`Found ${itemsNeedingSku.length} items needing model_sku\n`);

  if (itemsNeedingSku.length === 0) {
    console.log('No items need updating. Exiting.');
    process.exit(0);
  }

  let updated = 0;
  let notFound = 0;

  for (const item of itemsNeedingSku) {
    // Get order to find shop_id
    const orderResult = await db
      .select({ shopId: shopeeOrders.shopId })
      .from(shopeeOrders)
      .where(eq(shopeeOrders.orderSn, item.orderSn))
      .limit(1);

    if (orderResult.length === 0) {
      console.log(`⚠️  Order not found: ${item.orderSn}`);
      notFound++;
      continue;
    }

    const shopId = orderResult[0].shopId;

    // Find matching product variant by shop_id and model_name
    const productResult = await db
      .select({ modelSku: products.modelSku })
      .from(products)
      .where(
        and(
          eq(products.shopId, shopId),
          eq(products.modelName, item.modelName || ''),
          isNotNull(products.modelSku),
          sql`${products.modelSku} != ''`
        )
      )
      .limit(1);

    if (productResult.length === 0) {
      // No matching product found
      notFound++;
      continue;
    }

    const modelSku = productResult[0].modelSku;

    // Update order item with model_sku
    await db
      .update(shopeeOrderItems)
      .set({ modelSku })
      .where(eq(shopeeOrderItems.id, item.id));

    updated++;
    
    if (updated % 50 === 0) {
      console.log(`Progress: ${updated} items updated...`);
    }
  }

  console.log('\n✅ Backfill completed!');
  console.log(`   Updated: ${updated}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Total processed: ${itemsNeedingSku.length}`);

  process.exit(0);
}

backfillModelSku().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
