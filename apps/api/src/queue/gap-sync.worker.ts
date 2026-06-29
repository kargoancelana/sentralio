import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { db } from "../db/client";
import { shopeeCredentials } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  syncOrdersForShop,
  refreshOrderStatusesForShop,
  syncEscrowForShop,
  syncAdsForShop
} from "../services/sync-tasks";
import { lastNDaysWIB } from "../utils/wib-date";

interface GapSyncJobData {
  shopId: number;
  fromMs: number;
  toMs: number;
}

export function startGapSyncWorker(): Worker {
  const worker = new Worker<GapSyncJobData>(
    "gap-sync",
    async (job: Job<GapSyncJobData>) => {
      const { shopId, fromMs, toMs } = job.data;
      
      console.log(`[gap-sync-worker] Starting gap sync for shop ${shopId} from ${fromMs} to ${toMs}`);
      
      let daysBack = Math.ceil((toMs - fromMs) / (1000 * 60 * 60 * 24));
      if (daysBack < 1) daysBack = 1;
      if (daysBack > 180) daysBack = 180;

      await job.updateProgress(10);

      console.log(`[gap-sync-worker] Shop ${shopId} - syncing orders (${daysBack} days)...`);
      await syncOrdersForShop(shopId, daysBack);
      console.log(`[gap-sync-worker] Shop ${shopId} - refreshing order statuses...`);
      await refreshOrderStatusesForShop(shopId);

      await job.updateProgress(50);

      console.log(`[gap-sync-worker] Shop ${shopId} - syncing escrow (${daysBack} days)...`);
      await syncEscrowForShop(daysBack, `escrow_gap_${shopId}`, shopId);

      await job.updateProgress(80);

      console.log(`[gap-sync-worker] Shop ${shopId} - syncing ads (${daysBack} days)...`);
      const { startDate, endDate } = lastNDaysWIB(daysBack);
      await syncAdsForShop(shopId, startDate, endDate);

      // Complete
      console.log(`[gap-sync-worker] Shop ${shopId} gap sync complete!`);
      await db.update(shopeeCredentials)
        .set({
          disconnectedAt: null,
          updatedAt: new Date()
        })
        .where(eq(shopeeCredentials.shopId, shopId));

      await job.updateProgress(100);
      return { success: true, shopId, daysBack };
    },
    { 
      connection,
      concurrency: 2,
      limiter: { max: 1, duration: 1500 }
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(`[gap-sync-worker] Job ${job.id} failed: ${err.message}`);
  });

  return worker;
}
