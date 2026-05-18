/**
 * Fix products table where model_sku is string "null" instead of NULL
 */

import { db } from './src/db/client';
import { products } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function fixNullStringSku() {
  console.log('Fixing products with model_sku = "null"...\n');

  // Find products with string "null"
  const nullStringProducts = await db
    .select({
      id: products.id,
      shopeeItemId: products.shopeeItemId,
      shopeeModelId: products.shopeeModelId,
      modelName: products.modelName,
      modelSku: products.modelSku
    })
    .from(products)
    .where(sql`model_sku = 'null'`);

  console.log(`Found ${nullStringProducts.length} products with model_sku = "null"\n`);

  if (nullStringProducts.length === 0) {
    console.log('No products to fix.');
    process.exit(0);
  }

  // Show samples
  console.log('Sample products:');
  nullStringProducts.slice(0, 5).forEach(p => {
    console.log(`  - ${p.modelName} (item_id: ${p.shopeeItemId}, model_id: ${p.shopeeModelId})`);
  });

  console.log('\nFixing...');

  // Update to NULL
  const result = await db
    .update(products)
    .set({ modelSku: null })
    .where(sql`model_sku = 'null'`);

  console.log(`\n✅ Fixed ${nullStringProducts.length} products`);

  process.exit(0);
}

fixNullStringSku().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
