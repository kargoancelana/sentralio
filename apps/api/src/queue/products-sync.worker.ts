import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { syncProductsForShop } from "../services/sync-tasks";
import { getConnectedShopIds } from "../services/active-shops";

export function startProductsSyncWorker(): Worker {
  const worker = new Worker(
    "products-sync",
    async (job: Job) => {
      console.log(`[products-sync-worker] Starting products recurring sync...`);
      
      const shopIds = await getConnectedShopIds();
      console.log(`[products-sync-worker] Found ${shopIds.length} connected shops to sync.`);
      
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < shopIds.length; i++) {
        const shopId = shopIds[i];
        try {
          console.log(`[products-sync-worker] Syncing products for shop ${shopId}...`);
          await syncProductsForShop(shopId);
          successCount++;
        } catch (err: any) {
          console.error(`[products-sync-worker] Failed syncing products for shop ${shopId}:`, err.message);
          failCount++;
        }
        
        // Jeda 1 detik antar toko
        if (i < shopIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(`[products-sync-worker] Completed products sync. Success: ${successCount}, Fail: ${failCount}`);
      return { successCount, failCount };
    },
    { 
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 2000 }
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[products-sync-worker] Job ${job?.id} failed unexpectedly: ${err.message}`);
  });

  return worker;
}
