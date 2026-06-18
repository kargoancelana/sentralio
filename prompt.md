Kerjakan GitHub Issue #47 di repo kargoancelana/sentralio (branch baru dari `main`, PASTIKAN sudah pull #46 yang merged).
Judul: [Sync] Issue 1 — Pasang infra Redis + BullMQ (fondasi queue)

TUJUAN
Siapkan fondasi job queue pakai Redis + BullMQ. JANGAN tambah logika sync apa pun — cuma infra
dasar: koneksi Redis reusable + 1 queue contoh + worker + graceful shutdown. Ini dipakai issue
berikutnya (onboarding, gap-sync, products-sync, rate limiter).

FILES
Baru:
- apps/api/src/queue/connection.ts
- apps/api/src/queue/queues.ts
- apps/api/src/queue/index.ts
- apps/api/src/queue/example.worker.ts
Diubah:
- apps/api/package.json  (tambah dependency)
- apps/api/src/index.ts  (panggil startQueues saat boot, stopQueues saat shutdown)
- .env.example           (tambah REDIS_URL)

LANGKAH
1. cd apps/api && bun add bullmq ioredis
2. Pastikan Redis ada (VPS: redis-server). Tambah REDIS_URL=redis://127.0.0.1:6379 ke .env & .env.example.

3. apps/api/src/queue/connection.ts
   import { Redis } from "ioredis";
   const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
   export const connection = new Redis(REDIS_URL, {
     maxRetriesPerRequest: null,   // WAJIB buat BullMQ
     enableReadyCheck: false,
   });
   connection.on("error", (e) => console.error("[queue] Redis error:", e.message));
   connection.on("connect", () => console.log("[queue] Redis connected"));

4. apps/api/src/queue/queues.ts
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

5. apps/api/src/queue/example.worker.ts
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

6. apps/api/src/queue/index.ts
   import { Worker } from "bullmq";
   import { connection } from "./connection";
   import { allQueues } from "./queues";
   import { startExampleWorker } from "./example.worker";
   let workers: Worker[] = [];
   export async function startQueues() {
     console.log("[queue] Starting workers...");
     workers = [startExampleWorker()];
     console.log(`[queue] ${workers.length} worker(s) started`);
   }
   export async function stopQueues() {
     console.log("[queue] Stopping workers & queues...");
     await Promise.all(workers.map((w) => w.close()));
     await Promise.all(allQueues.map((q) => q.close()));
     await connection.quit();
     console.log("[queue] Stopped");
   }
   export { exampleQueue } from "./queues";

7. apps/api/src/index.ts
   - import { startQueues, stopQueues } from "./queue";
   - Saat boot, setelah startBackgroundSync(): await startQueues();
   - Di handler SIGTERM/SIGINT, urutan: stopBackgroundSync() → await stopQueues() → exit.

BATASAN / GOTCHA
- WAJIB maxRetriesPerRequest: null di koneksi ioredis (kalau tidak, Worker error "blocking command").
- Share SATU instance `connection` untuk Queue + Worker. Jangan bikin koneksi per queue.
- Worker harus dibungkus fungsi & cuma dipanggil dari startQueues() (jangan auto-start saat import).
- JANGAN ubah perilaku background-sync existing.
- `example` queue/worker sifatnya sementara — diganti queue `onboarding` di Issue 4.

ACCEPTANCE CRITERIA
- bun add bullmq ioredis masuk ke package.json.
- REDIS_URL ada di .env.example.
- Saat boot muncul log "[queue] Redis connected" + "[queue] 1 worker(s) started".
- exampleQueue.add("ping", { hello: "world" }) → worker log processing lalu completed.
- SIGTERM/SIGINT → close rapi tanpa error ("[queue] Stopped").
- bun run build / typecheck lolos.

OUTPUT
- Buat branch (mis. feat/queue-infra-bullmq), commit, buka PR ke `main` dengan deskripsi singkat
  dan tulis "Closes #47". Tunjukkan diff lengkap sebelum commit.