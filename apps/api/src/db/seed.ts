import { config } from "dotenv";

config();

import { db } from "./client";
import { env } from "../config/env";
import { shopeeCredentials } from "./schema";
import { encrypt } from "../utils/crypto";

/**
 * Seeds initial Shopee credentials from environment variables.
 * Safe to re-run.
 */
async function seed() {
  await db.delete(shopeeCredentials);
  
  const now = new Date();
  const pastExpiredDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
  
  await db.insert(shopeeCredentials).values({
    partnerId: env.shopeePartnerId,
    partnerKey: env.shopeePartnerKey,
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
