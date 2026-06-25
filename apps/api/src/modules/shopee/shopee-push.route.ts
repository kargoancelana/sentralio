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
      // SELALU balas 2xx — Shopee butuh 2xx; non-2xx = Verify gagal + push di-disable.
      set.status = 200;

      // body DIJAMIN raw string karena custom `parse` hook di bawah.
      const rawBody = typeof body === "string" ? body : "";

      // ── Cek konfigurasi ──
      const partnerKey = env.shopeePushPartnerKey;
      const callbackUrl = env.shopeeWebhookCallbackUrl;
      if (!partnerKey || !callbackUrl) {
        console.warn("[shopee-push] config belum lengkap, ack 200 tanpa proses");
        return "";
      }

      // ── Verifikasi signature (cuma buat mutusin proses/enggak, BUKAN HTTP status) ──
      const authHeader = request.headers.get("Authorization") ?? undefined;

      // ===== TEMP DEBUG SIGNATURE — HAPUS SETELAH DIAGNOSA SELESAI =====
      {
        const hostHeader = request.headers.get("Host") ?? "";
        let reqPath = "";
        try { reqPath = new URL(request.url).pathname; } catch { reqPath = request.url; }

        // Kandidat KEY
        const keyVariants: Array<{ name: string; key: any }> = [
          { name: "envAsUtf8", key: partnerKey },
        ];
        if (/^[0-9a-fA-F]+$/.test(partnerKey) && partnerKey.length % 2 === 0) {
          keyVariants.push({ name: "envHexDecoded", key: Buffer.from(partnerKey, "hex") });
        }

        // Kandidat URL
        const noSlash = callbackUrl.replace(/\/+$/, "");
        const urlVariants: Array<{ name: string; url: string }> = [
          { name: "envCallbackUrl", url: callbackUrl },
          { name: "envNoTrailingSlash", url: noSlash },
          { name: "envWithTrailingSlash", url: noSlash + "/" },
          { name: "reconHttpsHostPath", url: "https://" + hostHeader + reqPath },
          { name: "reconHttpsHostApiPath", url: "https://" + hostHeader + "/api" + reqPath },
          { name: "reconHttpHostPath", url: "http://" + hostHeader + reqPath },
        ];

        const matches: Record<string, boolean> = {};
        for (const kv of keyVariants) {
          for (const uv of urlVariants) {
            const sig = createHmac("sha256", kv.key)
              .update(uv.url + "|" + rawBody, "utf8")
              .digest("hex");
            matches[kv.name + "__" + uv.name] = authHeader === sig;
          }
        }

        console.warn(
          "[shopee-push][DEBUG-SIG] " +
            JSON.stringify({
              callbackUrl,
              hostHeader,
              requestUrl: request.url,
              reqPath,
              partnerKeyLen: partnerKey.length,
              rawBodyLen: rawBody.length,
              rawBody,
              receivedAuth: authHeader ?? null,
              receivedAuthLen: authHeader ? authHeader.length : 0,
              matches,
            })
        );
      }
      // ===== END TEMP DEBUG =====

      if (!verifyPushSignature(rawBody, authHeader, callbackUrl, partnerKey)) {
        console.warn("[shopee-push] signature invalid -- ack 200 tanpa proses payload");
        return "";
      }

      // ── Parse payload ──
      let payload: any;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        console.warn("[shopee-push] body bukan JSON valid -- ack 200");
        return "";
      }

      const code: number = payload.code;
      const shopId: number = payload.shop_id ?? payload.shopid;
      const data: any = payload.data ?? {};

      console.log("[shopee-push] Push received:", { code, shopId, data });

      // ── Proses async (status sudah 200, tidak blocking response) ──
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
      // KUNCI: custom parser supaya body = RAW STRING, apa pun Content-Type-nya.
      // `type: "text"` saja TIDAK cukup (klien kirim application/json -> Elysia
      // parse jadi object -> request.text() throw -> 400). Pakai parser ini:
      parse: async ({ request }) => {
        return await request.text();
      },
    }
  );
