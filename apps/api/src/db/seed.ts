import { config } from "dotenv";

config();

import { db } from "./client";
import { env } from "../config/env";
import { shopeeCredentials } from "./schema";
import { encrypt } from "../utils/crypto";

/**
 * Seeds initial Shopee credentials from environment variables.
 * Safe to re-run.
 *
 * SHOP_ID / ACCESS_TOKEN / REFRESH_TOKEN are optional: normally you obtain them
 * by authorizing a shop via Shopee OAuth in the web app (Settings → Integrasi
 * Toko), which writes straight to `shopee_credentials`. If any of them is unset
 * we skip seeding instead of inserting a broken row (shopId NaN / empty tokens).
 */
async function seed() {
  if (!env.shopeeShopId || !env.shopeeAccessToken || !env.shopeeRefreshToken) {
    console.log(
      "Seed skipped: SHOP_ID / ACCESS_TOKEN / REFRESH_TOKEN are not set. " +
        "Connect a shop via the web app (Settings → Integrasi Toko) to populate " +
        "shopee_credentials, or fill those values in .env to seed manually."
    );
    return;
  }

  await db.delete(shopeeCredentials);

  const now = new Date();
  const pastExpiredDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

  await db.insert(shopeeCredentials).values({
    partnerId: env.shopeePartnerId,
    partnerKey: encrypt(env.shopeePartnerKey), // ✅ Encrypt partner key
    shopId: env.shopeeShopId,
    accessToken: encrypt(env.shopeeAccessToken),
    refreshToken: encrypt(env.shopeeRefreshToken),
    expiresAt: pastExpiredDate,
  });

  console.log("Seed OK: shopee_credentials inserted");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
