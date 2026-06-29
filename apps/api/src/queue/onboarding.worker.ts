import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { db } from "../db/client";
import { shopeeCredentials } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  syncProductsForShop,
  syncOrdersForShop,
  refreshOrderStatusesForShop,
  syncEscrowForShop,
  syncAdsForShop
} from "../services/sync-tasks";
import { lastNDaysWIB } from "../utils/wib-date";

interface OnboardingJobData {
  shopId: number;
}

export function startOnboardingWorker(): Worker {
  const worker = new Worker<OnboardingJobData>(
    "onboarding",
    async (job: Job<OnboardingJobData>) => {
      const { shopId } = job.data;
      
      console.log(`[onboarding-worker] Starting onboarding for shop ${shopId}`);
      
      // Update DB to mark as started
      await db.update(shopeeCredentials)
        .set({
          initialSyncStatus: "syncing",
          initialSyncStartedAt: new Date(),
          initialSyncError: null,
          initialSyncStep: "products",
          updatedAt: new Date()
        })
        .where(eq(shopeeCredentials.shopId, shopId));

      await job.updateProgress(5);

      // Step 1: Products
      console.log(`[onboarding-worker] Shop ${shopId} - syncing products...`);
      await syncProductsForShop(shopId);

      await job.updateProgress(30);

      // Step 2: Orders (30 days) + Refresh Status
      await db.update(shopeeCredentials)
        .set({ initialSyncStep: "orders", updatedAt: new Date() })
        .where(eq(shopeeCredentials.shopId, shopId));
      
      console.log(`[onboarding-worker] Shop ${shopId} - syncing orders (30 days)...`);
      await syncOrdersForShop(shopId, 30);
      console.log(`[onboarding-worker] Shop ${shopId} - refreshing order statuses...`);
      await refreshOrderStatusesForShop(shopId);

      await job.updateProgress(60);

      // Step 3: Escrow (180 days)
      await db.update(shopeeCredentials)
        .set({ initialSyncStep: "escrow", updatedAt: new Date() })
        .where(eq(shopeeCredentials.shopId, shopId));

      console.log(`[onboarding-worker] Shop ${shopId} - syncing escrow (180 days)...`);
      await syncEscrowForShop(180, `escrow_onboarding_${shopId}`, shopId);

      await job.updateProgress(85);

      // Step 4: Ads (180 days)
      await db.update(shopeeCredentials)
        .set({ initialSyncStep: "ads", updatedAt: new Date() })
        .where(eq(shopeeCredentials.shopId, shopId));

      console.log(`[onboarding-worker] Shop ${shopId} - syncing ads (180 days)...`);
      const { startDate, endDate } = lastNDaysWIB(180);
      await syncAdsForShop(shopId, startDate, endDate);

      // Complete
      console.log(`[onboarding-worker] Shop ${shopId} onboarding complete!`);
      await db.update(shopeeCredentials)
        .set({
          initialSyncStatus: "done",
          initialSyncStep: null,
          initialSyncAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(shopeeCredentials.shopId, shopId));

      await job.updateProgress(100);
      return { success: true, shopId };
    },
    { 
      connection,
      concurrency: 2,
      limiter: { max: 1, duration: 1500 }
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(`[onboarding-worker] Job ${job.id} failed: ${err.message}`);
    
    if (job.attemptsMade >= (job.opts.attempts || 5)) {
      console.error(`[onboarding-worker] Job ${job.id} completely failed after ${job.attemptsMade} attempts.`);
      await db.update(shopeeCredentials)
        .set({
          initialSyncStatus: "error",
          initialSyncError: err.message,
          updatedAt: new Date()
        })
        .where(eq(shopeeCredentials.shopId, job.data.shopId));
    }
  });

  return worker;
}
