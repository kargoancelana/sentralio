import * as crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeCredentials } from "../db/schema";
import { encrypt, decrypt } from "../utils/crypto";

interface TokenRow {
  id: number;
  partnerId: number;
  partnerKey: string;
  shopId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  updatedAt: Date;
}

/**
 * Gets credentials for a specific shop from the DB.
 * If shopId is not provided, returns the first available shop.
 * If expired, triggers a refresh automatically.
 */
export async function getValidToken(shopId?: number): Promise<TokenRow> {
  let query = db.select().from(shopeeCredentials);
  
  if (shopId) {
    query = query.where(eq(shopeeCredentials.shopId, shopId)) as any;
  }
  
  const rows = await query.limit(1);
  const row = rows[0];

  if (!row) {
    const msg = shopId 
      ? `No shopee credentials found for shop ID ${shopId}.`
      : "No shopee credentials found. Please connect a shop first.";
    throw new Error(msg);
  }

  // Dekripsi token dan partner key sehingga bagian aplikasi lain tidak perlu tahu perihal enkripsi
  row.accessToken = decrypt(row.accessToken);
  row.refreshToken = decrypt(row.refreshToken);
  row.partnerKey = decrypt(row.partnerKey);

  // Refresh 60 detik sebelum masa berlaku habis untuk menghindari race condition
  if (Date.now() > row.expiresAt.getTime() - 60_000) {
    console.warn(`[shopee-auth] Token for shop ${row.shopId} expired at ${row.expiresAt.toISOString()}, triggering refresh`);
    return await refreshAccessToken(row);
  }

  return row;
}

/**
 * Requests a new access token from Shopee using the refresh token, and updates DB.
 */
export async function refreshAccessToken(row: TokenRow): Promise<TokenRow> {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);

  // Kalkulasi signature: SHA256(partner_id + path + timestamp + partner_key)
  const baseString = `${row.partnerId}${path}${timestamp}`;
  const sign = crypto.createHmac("sha256", row.partnerKey).update(baseString).digest("hex");

  const url = `https://partner.shopeemobile.com${path}?partner_id=${row.partnerId}&timestamp=${timestamp}&sign=${sign}`;

  console.log(`[shopee-auth] Requesting new token with refresh_token=****${row.refreshToken.slice(-4)}`);

  const body = {
    refresh_token: row.refreshToken,
    partner_id: row.partnerId,
    shop_id: row.shopId,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("[shopee-auth] Failed to fetch access_token:", err.message);
    throw new Error(`Auth request failed: ${err.message}`);
  }

  const data = await res.json();

  if (res.status >= 400 || data.error) {
    console.error(`[shopee-auth] Auth API error ${res.status}:`, JSON.stringify(data, null, 2));
    throw new Error(`Shopee Auth Error: ${data.message || data.error || res.statusText}`);
  }

  // Expected success body:
  // {
  //   "refresh_token": "...",
  //   "access_token": "...",
  //   "expire_in": 14400,
  //   "request_id": "...",
  //   "error": "",
  //   "message": ""
  // }
  
  if (!data.access_token || !data.refresh_token || !data.expire_in) {
    throw new Error(`Shopee Auth missing required fields in response: ${JSON.stringify(data)}`);
  }

  const expiresInMs = data.expire_in * 1000;
  const newExpiresAt = new Date(Date.now() + expiresInMs);

  console.log(`[shopee-auth] Token refreshed successfully. Valid until ${newExpiresAt.toISOString()}`);

  const updatePayload = {
    accessToken: encrypt(data.access_token),
    refreshToken: encrypt(data.refresh_token),
    expiresAt: newExpiresAt,
    updatedAt: new Date(),
  };

  await db.update(shopeeCredentials).set(updatePayload).where(eq(shopeeCredentials.id, row.id));

  return {
    ...row,
    ...updatePayload,
    // Pastikan kita mengembalikan plaintext untuk pemanggil fungsi
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    partnerKey: row.partnerKey, // Already decrypted
  };
}

/**
 * Proactively refresh all tokens that are expired or will expire within 30 minutes.
 * Called by cron job and smart-refresh endpoints.
 */
export async function ensureAllTokensFresh(): Promise<{ refreshed: number; failed: number }> {
  // Only refresh connected shops — disconnected ones have their tokens cleared
  // and must not be touched until reconnected.
  const rows = await db.select().from(shopeeCredentials)
    .where(eq(shopeeCredentials.status, "connected"));
  let refreshed = 0;
  let failed = 0;
  const margin = 30 * 60 * 1000; // 30 minutes before expiry

  for (const row of rows) {
    if (Date.now() > row.expiresAt.getTime() - margin) {
      try {
        const decrypted = {
          ...row,
          accessToken: decrypt(row.accessToken),
          refreshToken: decrypt(row.refreshToken),
          partnerKey: decrypt(row.partnerKey),
        };
        await refreshAccessToken(decrypted);
        refreshed++;
        console.log(`[CRON] Token refreshed for shop ${row.shopId}`);
      } catch (err: any) {
        failed++;
        console.error(`[CRON] Failed to refresh token for shop ${row.shopId}: ${err.message}`);
      }
    }
  }

  return { refreshed, failed };
}
