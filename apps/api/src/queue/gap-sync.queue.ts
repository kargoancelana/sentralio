import { Queue } from "bullmq";
import { connection } from "./connection";
import { defaultJobOptions } from "./job-options";

export const gapSyncQueue = new Queue("gap-sync", { connection, defaultJobOptions });
