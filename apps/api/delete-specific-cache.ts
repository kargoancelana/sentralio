/**
 * Delete cache for specific order
 */

import { db } from './src/db/client';
import { labelCacheTable } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function deleteCache() {
  const orderSn = '260506NUK30QYR';
  
  console.log(`🗑️  Deleting cache for order: ${orderSn}`);
  
  await db
    .delete(labelCacheTable)
    .where(eq(labelCacheTable.orderSn, orderSn));
  
  console.log('✅ Cache deleted');
}

deleteCache()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
