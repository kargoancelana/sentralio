import * as crypto from "crypto";
import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { shopeeCredentials } from "../../db/schema";
import { encrypt } from "../../utils/crypto";
import { onboardingQueue, gapSyncQueue } from "../../queue";

const SHOPEE_BASE = "https://partner.shopeemobile.com";

/**
 * Membuat signature HMAC-SHA256 untuk API Shopee.
 */
function makeSign(partnerId: number, partnerKey: string, path: string, timestamp: number): string {
  const baseString = `${partnerId}${path}${timestamp}`;
  return crypto.createHmac("sha256", partnerKey).update(baseString).digest("hex");
}

export const shopeeAuthRoutes = new Elysia({ prefix: "/shopee" })

  // ─── Dapatkan URL otorisasi sebagai JSON (untuk redirect frontend) ───────────
  .get("/auth/url", () => {
    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = makeSign(env.shopeePartnerId, env.shopeePartnerKey, path, timestamp);
    const redirectUrl = env.shopeeRedirectUrl;
    const authUrl = `${SHOPEE_BASE}${path}?partner_id=${env.shopeePartnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${redirectUrl}`;

    console.log(`[shopee-oauth] Auth URL generated, redirect=${redirectUrl}`);
    return { auth_url: authUrl };
  })

  // ─── Halaman otorisasi HTML lawas (dipertahankan untuk kompatibilitas) ─
  .get("/auth", ({ set }) => {
    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = makeSign(env.shopeePartnerId, env.shopeePartnerKey, path, timestamp);
    const redirectUrl = env.shopeeRedirectUrl;
    const authUrl = `${SHOPEE_BASE}${path}?partner_id=${env.shopeePartnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${redirectUrl}`;

    set.headers["Content-Type"] = "text/html";
    return `<!DOCTYPE html>
<html><head><title>Redirecting to Shopee...</title></head>
<body><script>window.location.href="${authUrl}";</script>
<p>Redirecting to Shopee authorization...</p></body></html>`;
  })

  // ─── Tukarkan kode otorisasi dengan token (upsert multi-seller) ────
  .post(
    "/auth/exchange",
    async ({ body, set }) => {
      const { code, shop_id } = body;
      const shopIdNum = parseInt(shop_id);

      console.log(`[shopee-oauth] Exchanging code for tokens, shop_id=${shopIdNum}, code=****${code.slice(-4)}`);

      const path = "/api/v2/auth/token/get";
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = makeSign(env.shopeePartnerId, env.shopeePartnerKey, path, timestamp);

      const url = `${SHOPEE_BASE}${path}?partner_id=${env.shopeePartnerId}&timestamp=${timestamp}&sign=${sign}`;

      let data: any;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            shop_id: shopIdNum,
            partner_id: env.shopeePartnerId,
          }),
        });
        data = await res.json();
      } catch (err: any) {
        set.status = 502;
        return {
          success: false,
          message: `Failed to exchange code with Shopee: ${err.message}`,
        };
      }

      if (data.error || !data.access_token || !data.refresh_token) {
        set.status = 400;
        return {
          success: false,
          message: `Shopee token exchange failed: ${data.message || data.error || "Unknown error"}`,
          shopee_response: data,
        };
      }

      console.log(`[shopee-oauth] Token exchange successful, saving to DB for shop_id=${shopIdNum}...`);

      const expiresAt = new Date(Date.now() + data.expire_in * 1000);

      // Coba untuk mendapatkan nama toko dari API Shopee
      let shopName: string | null = null;
      try {
        const shopInfoPath = "/api/v2/shop/get_shop_info";
        const shopInfoTs = Math.floor(Date.now() / 1000);
        const shopInfoBase = `${env.shopeePartnerId}${shopInfoPath}${shopInfoTs}${data.access_token}${shopIdNum}`;
        const shopInfoSign = crypto.createHmac("sha256", env.shopeePartnerKey).update(shopInfoBase).digest("hex");
        const shopInfoUrl = `${SHOPEE_BASE}${shopInfoPath}?partner_id=${env.shopeePartnerId}&timestamp=${shopInfoTs}&access_token=${data.access_token}&shop_id=${shopIdNum}&sign=${shopInfoSign}`;

        const shopInfoRes = await fetch(shopInfoUrl);
        const shopInfoData = await shopInfoRes.json();
        shopName = shopInfoData?.response?.shop_name || shopInfoData?.shop_name || null;
        if (shopName) console.log(`[shopee-oauth] Shop name: ${shopName}`);
      } catch {
        console.warn("[shopee-oauth] Could not fetch shop name, skipping");
      }

      const credentialPayload = {
        partnerId: env.shopeePartnerId,
        partnerKey: encrypt(env.shopeePartnerKey), // ✅ Encrypt partner key
        shopId: shopIdNum,
        shopName,
        accessToken: encrypt(data.access_token),
        refreshToken: encrypt(data.refresh_token),
        expiresAt,
        // (Re)connecting always marks the shop active again — this is what
        // restores a previously soft-disconnected shop's data and sync.
        status: "connected",
        updatedAt: new Date(),
      };

      // Upsert multi-seller: periksa berdasarkan shop_id
      const existing = await db.select().from(shopeeCredentials)
        .where(eq(shopeeCredentials.shopId, shopIdNum)).limit(1);

      let prevSyncStatus = null;
      if (existing.length > 0) {
        prevSyncStatus = existing[0].initialSyncStatus;
        await db.update(shopeeCredentials)
          .set(credentialPayload)
          .where(eq(shopeeCredentials.shopId, shopIdNum));
        console.log(`[shopee-oauth] Updated existing credentials for shop_id=${shopIdNum}`);
      } else {
        await db.insert(shopeeCredentials).values(credentialPayload);
        console.log(`[shopee-oauth] Inserted new credentials for shop_id=${shopIdNum}`);
      }

      const isNewShop = existing.length === 0 || prevSyncStatus === "error";
      if (isNewShop && prevSyncStatus !== "syncing" && prevSyncStatus !== "done" && prevSyncStatus !== "pending") {
        console.log(`[shopee-oauth] Enqueueing onboarding job for shop_id=${shopIdNum}...`);
        try {
          await onboardingQueue.add(
            `onboarding-${shopIdNum}`, 
            { shopId: shopIdNum },
            { attempts: 3, backoff: { type: "exponential", delay: 60000 }, removeOnComplete: 100, removeOnFail: 500 }
          );
        } catch (qErr: any) {
          console.error(`[shopee-oauth] Failed to enqueue onboarding job for shop_id=${shopIdNum}:`, qErr.message);
        }
      } else if (existing.length > 0 && existing[0].status === "disconnected" && prevSyncStatus === "done") {
        console.log(`[shopee-oauth] Enqueueing gap-sync job for reconnecting shop_id=${shopIdNum}...`);
        try {
          const disconnectedAt = existing[0].disconnectedAt;
          const fromMs = disconnectedAt ? new Date(disconnectedAt).getTime() : Date.now() - 7 * 24 * 3600 * 1000;
          await gapSyncQueue.add(
            `gap-${shopIdNum}`,
            { shopId: shopIdNum, fromMs, toMs: Date.now() },
            { attempts: 3, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 100, removeOnFail: 500 }
          );
        } catch (qErr: any) {
          console.error(`[shopee-oauth] Failed to enqueue gap-sync job for shop_id=${shopIdNum}:`, qErr.message);
        }
      }

      console.log(`[shopee-oauth] Token saved. Valid until ${expiresAt.toISOString()}`);

      return {
        success: true,
        message: "Token berhasil disimpan! Toko sudah terhubung ke WMS.",
        shop_id: shopIdNum,
        shop_name: shopName,
        expires_at: expiresAt.toISOString(),
      };
    },
    {
      body: t.Object({
        code: t.String(),
        shop_id: t.String(),
      }),
    }
  );
