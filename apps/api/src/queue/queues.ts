import { Queue } from "bullmq";
import { connection } from "./connection";

export const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export const exampleQueue = new Queue("example", { connection, defaultJobOptions });
export const allQueues = [exampleQueue];
