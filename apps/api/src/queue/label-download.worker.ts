/**
 * Label Download Worker — memproses job dari labelDownloadQueue.
 *
 * Dipicu oleh Shopee Push code 15 (shipping_document_status_push) saat status READY.
 * Tujuan: pre-fetch + cache label PDF supaya pas user print, label sudah siap (instant).
 *
 * Reuse getSingleLabel() yang sudah handle: cache-check -> create_shipping_document
 * -> poll get_shipping_document_result -> download_shipping_document -> labelCache.set().
 */

import { Worker, Job } from "bullmq";
import { connection } from "./connection";
import { getSingleLabel } from "../services/label.service";

interface LabelDownloadJobData {
  shopId: number;
  orderSn: string;
  companyId: number;
  packageNumber?: string;
}

export function startLabelDownloadWorker(): Worker {
  const worker = new Worker<LabelDownloadJobData>(
    "label-download",
    async (job: Job<LabelDownloadJobData>) => {
      const { orderSn, shopId } = job.data;

      console.log(`[label-download-worker] Pre-fetching label for ${orderSn} (shop ${shopId})`);

      // getSingleLabel internal: cache-check -> create -> poll READY -> download -> cache.
      const result = await getSingleLabel(orderSn);

      if (!result.success) {
        // Throw supaya BullMQ retry (label bisa jadi masih generating walau push READY).
        throw new Error(`getSingleLabel gagal untuk ${orderSn}: ${result.error || "unknown"}`);
      }

      console.log(`[label-download-worker] Label tersimpan di cache untuk ${orderSn}`);
      return { success: true, orderSn };
    },
    { connection, concurrency: 3 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[label-download-worker] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
