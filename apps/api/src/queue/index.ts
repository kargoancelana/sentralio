import { Worker } from "bullmq";
import { connection } from "./connection";
import { allQueues } from "./queues";
import { startOnboardingWorker } from "./onboarding.worker";

let workers: Worker[] = [];

export async function startQueues() {
  console.log("[queue] Starting workers...");
  workers = [startOnboardingWorker()];
  console.log(`[queue] ${workers.length} worker(s) started`);
}

export async function stopQueues() {
  console.log("[queue] Stopping workers & queues...");
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(allQueues.map((q) => q.close()));
  await connection.quit();
  console.log("[queue] Stopped");
}

export { onboardingQueue } from "./queues";
