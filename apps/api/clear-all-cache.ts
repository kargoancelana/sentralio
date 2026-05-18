/**
 * Clear ALL label cache (not just SPX)
 */
import { db } from './src/db/client';
import { labelCacheTable } from './src/db/schema';

async function clearAllCache() {
  console.log('🗑️  Clearing ALL label cache...\n');

  const result = await db.delete(labelCacheTable);

  console.log(`✅ Cleared ALL label cache from database`);
  console.log('\nNow try printing any label - it will fetch fresh from Shopee API');
}

clearAllCache()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
