/**
 * Sync model_sku from products table to shopee_order_items table
 * 
 * This script updates shopee_order_items.model_sku based on the model_sku
 * stored in the products table (which is updated via Produk Channel UI).
 */

import { db } from './src/db/client';
import { shopeeOrderItems, products } from './src/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

async function syncSkuToOrderItems() {
  console.log('Starting SKU sync from products to shopee_order_items...\n');

  try {
    // Get all order items that need SKU update
    const itemsToUpdate = await db
      .select({
        orderItemId: shopeeOrderItems.id,
        orderSn: shopeeOrderItems.orderSn,
        itemName: shopeeOrderItems.itemName,
        modelName: shopeeOrderItems.modelName,
        currentSku: shopeeOrderItems.modelSku,
      })
      .from(shopeeOrderItems)
      .where(sql`model_sku IS NULL OR model_sku = ''`)
      .limit(1500);

    console.log(`Found ${itemsToUpdate.length} order items without SKU\n`);

    if (itemsToUpdate.length === 0) {
      console.log('All order items already have SKU. Nothing to update.');
      process.exit(0);
    }

    let updated = 0;
    let notFound = 0;

    // Process each item
    for (const item of itemsToUpdate) {
      if (!item.modelName) {
        notFound++;
        continue;
      }

      // Find matching product by model_name
      const matchingProducts = await db
        .select({
          modelSku: products.modelSku,
          modelName: products.modelName,
        })
        .from(products)
        .where(
          and(
            eq(products.modelName, item.modelName),
            isNotNull(products.modelSku),
            sql`${products.modelSku} != ''`
          )
        )
        .limit(1);

      if (matchingProducts.length > 0) {
        const newSku = matchingProducts[0].modelSku;
        
        // Update order item with SKU from products table
        await db
          .update(shopeeOrderItems)
          .set({ modelSku: newSku })
          .where(eq(shopeeOrderItems.id, item.orderItemId));

        updated++;
        
        if (updated % 50 === 0) {
          console.log(`Progress: ${updated} items updated...`);
        }
      } else {
        notFound++;
      }
    }

    console.log('\n=== Sync Complete ===');
    console.log(`✅ Updated: ${updated} items`);
    console.log(`⚠️  Not found in products: ${notFound} items`);
    console.log(`📊 Total processed: ${itemsToUpdate.length} items`);

  } catch (err: any) {
    console.error('Error during sync:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

syncSkuToOrderItems();
