import * as crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { shopeeCredentials } from "../db/schema";

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
 * Gets the first credentials row from the DB.
 * If expired, triggers a refresh automatically.
 */
export async function getValidToken(): Promise<TokenRow> {
  const rows = await db.select().from(shopeeCredentials).limit(1);
  const row = rows[0];

  if (!row) {
    throw new Error("No shopee credentials found in the database. Please seed the database first.");
  }

  // Token expires early grace period? No, let's just check if it's strictly expired.
  if (Date.now() > row.expiresAt.getTime()) {
    console.warn(`[shopee-auth] Token expired at ${row.expiresAt.toISOString()}, triggering refresh`);
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

  // Sign API requires: partner_id + path + timestamp
  const baseString = `${row.partnerId}${path}${timestamp}`;
  const sign = crypto.createHmac("sha256", row.partnerKey).update(baseString).digest("hex");

  const url = `https://partner.shopeemobile.com${path}?partner_id=${row.partnerId}&timestamp=${timestamp}&sign=${sign}`;

  console.log(`[shopee-auth] Requesting new token with refresh_token=${row.refreshToken}`);

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
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: newExpiresAt,
    updatedAt: new Date(),
  };

  await db.update(shopeeCredentials).set(updatePayload).where(eq(shopeeCredentials.id, row.id));

  return {
    ...row,
    ...updatePayload,
  };
}
