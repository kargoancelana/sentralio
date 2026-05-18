/**
 * Clear all label cache entries
 * Run: bun run clear-label-cache.ts
 */
import { db } from "./src/db/client";
import { labelCacheTable } from "./src/db/schema";

async function main() {
  console.log("=== Clear Label Cache ===\n");

  // Count current entries
  const entries = await db.select().from(labelCacheTable);
  console.log(`Found ${entries.length} cache entries`);

  if (entries.length > 0) {
    // Show entries
    for (const entry of entries) {
      console.log(`  - ${entry.orderSn} (format: ${entry.format}, tracking: ${entry.trackingNumber || 'none'}, expires: ${entry.expiresAt.toISOString()})`);
    }

    // Delete all
    await db.delete(labelCacheTable);
    console.log(`\n✅ Deleted ${entries.length} cache entries`);
  } else {
    console.log("Cache is already empty");
  }
}

main().catch(console.error);
