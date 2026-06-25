import { Worker } from "bullmq";
import { connection } from "./connection";
import { allQueues, productsSyncQueue } from "./queues";
import { startOnboardingWorker } from "./onboarding.worker";
import { startGapSyncWorker } from "./gap-sync.worker";
import { startProductsSyncWorker } from "./products-sync.worker";
import { startPushSyncWorker } from "./push-sync.worker";

let workers: Worker[] = [];

export async function startQueues() {
  console.log("[queue] Starting workers...");
  workers = [startOnboardingWorker(), startGapSyncWorker(), startProductsSyncWorker(), startPushSyncWorker()];
  console.log(`[queue] ${workers.length} worker(s) started`);

  console.log("[queue] Scheduling recurring jobs...");
  await productsSyncQueue.upsertJobScheduler(
    "products-sync-scheduler",
    { every: 8 * 60 * 60 * 1000 },
    { name: "products-sync-all", opts: { removeOnComplete: 50, removeOnFail: 100 } }
  );
}

export async function stopQueues() {
  console.log("[queue] Stopping workers & queues...");
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(allQueues.map((q) => q.close()));
  await connection.quit();
  console.log("[queue] Stopped");
}

export { onboardingQueue, gapSyncQueue, productsSyncQueue, pushSyncQueue } from "./queues";
