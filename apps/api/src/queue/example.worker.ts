import { Worker } from "bullmq";
import { connection } from "./connection";

export function startExampleWorker() {
  const worker = new Worker("example", async (job) => {
    console.log(`[queue:example] processing job ${job.id}`, job.data);
    return { ok: true };
  }, { connection, concurrency: 1 });

  worker.on("completed", (job) => console.log(`[queue:example] completed ${job.id}`));
  worker.on("failed", (job, err) => console.error(`[queue:example] failed ${job?.id}:`, err.message));
  
  return worker;
}
