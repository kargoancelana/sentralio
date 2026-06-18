import { Queue } from "bullmq";
import { connection } from "./connection";
import { defaultJobOptions } from "./job-options";

export const onboardingQueue = new Queue("onboarding", { connection, defaultJobOptions });
