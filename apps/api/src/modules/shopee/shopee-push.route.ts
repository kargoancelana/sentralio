/**
 * Shopee Push (Webhook) Route
 *
 * Endpoint publik — di-mount SEBELUM auth middleware.
 * Shopee mengirim push notification ke endpoint ini untuk update order status
 * dan tracking number secara realtime.
 *
 * Ref: https://open.shopee.com/developer-guide/18
 */

import Elysia from "elysia";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { shopeeCredentials, shopeeOrders } from "../../db/schema";
import { env } from "../../config/env";
import { pushSyncQueue } from "../../queue";

// Push code definitions (Shopee Open Platform)
const PUSH_CODE_ORDER_STATUS = 3;
const PUSH_CODE_TRACKING    = 4;

/**
 * Verify Shopee Push signature (HMAC-SHA256).
 *
 * base_string = <callback_url> + "|" + <raw_request_body>
 * signature   = HMAC_SHA256(base_string, PUSH_PARTNER_KEY)
 *
 * Returns true if the Authorization header matches, false otherwise.
 */
function verifyPushSignature(
  rawBody: string,
  authHeader: string | undefined,
  callbackUrl: string,
  partnerKey: string
): boolean {
  if (!authHeader) return false;
  const baseString = `${callbackUrl}|${rawBody}`;
  const expected = createHmac("sha256", partnerKey)
    .update(baseString, "utf8")
    .digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(authHeader, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

export const shopeePushRoutes = new Elysia()
  .post(
    "/shopee/webhook",
    async ({ body, request, set }) => {
      // ── 1. Ambil raw body ──
      // Elysia dengan type:'text' menaruh body mentah sebagai string di `body`.
      // Fallback ke request.text() untuk jaga-jaga.
      let rawBody: string;
      if (typeof body === "string") {
        rawBody = body;
      } else {
        try {
          rawBody = await request.text();
        } catch {
          set.status = 400;
          return "";
        }
      }

      // ── 2. Cek konfigurasi ──
      const partnerKey = env.shopeePushPartnerKey;
      const callbackUrl = env.shopeeWebhookCallbackUrl;

      if (!partnerKey || !callbackUrl) {
        // Config belum lengkap — balas 200 agar Shopee Console bisa verifikasi
        // endpoint, TAPI jangan proses / sentuh DB sama sekali.
        console.warn(
          "[shopee-push] Konfigurasi belum lengkap " +
          `(partnerKey=${!!partnerKey}, callbackUrl=${!!callbackUrl}), ` +
          "balas 200 tanpa proses payload"
        );
        set.status = 200;
        return "";
      }

      // ── 3. Verifikasi signature ──
      const authHeader = request.headers.get("Authorization") ?? undefined;
      if (!verifyPushSignature(rawBody, authHeader, callbackUrl, partnerKey)) {
        console.warn("[shopee-push] Invalid signature — request ditolak");
        set.status = 401;
        return "";
      }

      // ── 4. Parse payload ──
      let payload: any;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        set.status = 400;
        return "";
      }

      const code: number = payload.code;
      const shopId: number = payload.shop_id ?? payload.shopid;
      const data: any = payload.data ?? {};

      console.log("[shopee-push] Push received:", { code, shopId, data });

      // ── 5. Balas 200 DULU, proses async ──
      set.status = 200;

      // ── 6. Proses async (setImmediate agar tidak blocking response) ──
    setImmediate(async () => {
      try {
        // Validasi shop — harus ada di credentials dan status connected
        const credRows = await db
          .select({ companyId: shopeeCredentials.companyId, status: shopeeCredentials.status })
          .from(shopeeCredentials)
          .where(eq(shopeeCredentials.shopId, shopId))
          .limit(1);

        const cred = credRows[0];
        if (!cred) {
          console.warn(`[shopee-push] shop_id=${shopId} tidak ditemukan di credentials, skip`);
          return;
        }
        if (cred.status !== "connected") {
          console.warn(`[shopee-push] shop_id=${shopId} status=${cred.status}, skip`);
          return;
        }
        const companyId = cred.companyId;

        if (code === PUSH_CODE_ORDER_STATUS) {
          // code 3: Order Status Push
          const orderSn: string = data.ordersn ?? data.order_sn;
          const newStatus: string = data.status;
          if (!orderSn) {
            console.warn("[shopee-push] code=3 tanpa ordersn, skip");
            return;
          }
          console.log(`[shopee-push] code=3 order_sn=${orderSn} status=${newStatus} shopId=${shopId}`);

          // Enqueue targeted sync supaya semua field ter-update lengkap
          await pushSyncQueue.add(
            `push-order-${orderSn}`,
            { shopId, orderSn, companyId, type: "order_status" },
            { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 100, removeOnFail: 200, jobId: `order-status-${orderSn}` }
          );

        } else if (code === PUSH_CODE_TRACKING) {
          // code 4: TrackingNo Push
          const orderSn: string = data.ordersn ?? data.order_sn;
          const trackingNumber: string | undefined = data.tracking_no ?? data.tracking_number;
          const packageNumber: string | undefined = data.package_number;

          if (!orderSn) {
            console.warn("[shopee-push] code=4 tanpa ordersn, skip");
            return;
          }
          console.log(`[shopee-push] code=4 order_sn=${orderSn} tracking=${trackingNumber} pkg=${packageNumber} shopId=${shopId}`);

          // Update tracking + package_number langsung (tidak perlu full sync)
          const updatePayload: Record<string, any> = { updatedAt: new Date() };
          if (trackingNumber) updatePayload.trackingNumber = trackingNumber;
          if (packageNumber)  updatePayload.packageNumber  = packageNumber;

          await db.update(shopeeOrders)
            .set(updatePayload)
            .where(eq(shopeeOrders.orderSn, orderSn));

          console.log(`[shopee-push] tracking updated for ${orderSn}`);

        } else {
          // code lain (product push 8/11/13/16/22/27, dll) — abaikan
          console.log(`[shopee-push] code=${code} diabaikan (out of scope)`);
        }
      } catch (err: any) {
        console.error("[shopee-push] Error saat proses async:", err.message);
      }
    });

    return "";
  },
  {
    // Paksa Elysia agar tidak parse body sebagai JSON — simpan sebagai string
    // mentah supaya signature HMAC-SHA256 bisa diverifikasi atas raw bytes.
    type: "text",
  }
);
