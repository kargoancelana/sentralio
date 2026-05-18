/**
 * Reset stuck sync locks
 * 
 * When background sync jobs get stuck (error, server restart, etc),
 * the lock in sync_state table remains set to 1 (in progress).
 * This prevents future sync jobs from running.
 * 
 * This script resets all locks to 0.
 */

import { db } from "./src/db/client";
import { syncState } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function resetSyncLocks() {
  console.log("=== Reset Sync Locks ===\n");

  try {
    // Get all sync states
    const allStates = await db.select().from(syncState);
    
    console.log(`Found ${allStates.length} sync state(s)\n`);
    
    if (allStates.length === 0) {
      console.log("No sync states found. This is normal for first run.");
      process.exit(0);
    }

    // Show current state
    console.log("Current sync states:");
    allStates.forEach(state => {
      const status = state.syncInProgress === 1 ? '🔒 LOCKED' : '✅ FREE';
      console.log(`  ${status} - Job: ${state.jobName}, Shop: ${state.shopId}, Last sync: ${state.lastSyncTime.toISOString()}`);
    });
    console.log();

    // Reset all locks
    const lockedStates = allStates.filter(s => s.syncInProgress === 1);
    
    if (lockedStates.length === 0) {
      console.log("✅ No stuck locks found. All jobs are free to run.");
      process.exit(0);
    }

    console.log(`Resetting ${lockedStates.length} stuck lock(s)...`);
    
    for (const state of lockedStates) {
      await db.update(syncState)
        .set({ syncInProgress: 0, updatedAt: new Date() })
        .where(eq(syncState.id, state.id));
      
      console.log(`  ✅ Reset lock for job "${state.jobName}" (shop ${state.shopId})`);
    }

    console.log("\n=== Reset Complete ===");
    console.log("Background sync jobs can now run normally.");
    console.log("Wait 2 minutes for the next sync cycle to start.");
    
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

resetSyncLocks();
