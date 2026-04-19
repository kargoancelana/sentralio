import { config } from "dotenv";

config();

const requiredEnv = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "PARTNER_ID",
  "PARTNER_KEY",
  "SHOP_ID",
  "ACCESS_TOKEN",
  "REFRESH_TOKEN",
  "TOKEN_SECRET_KEY",
] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  appPort: Number(process.env.APP_PORT ?? 3000),
  dbHost: process.env.DB_HOST as string,
  dbPort: Number(process.env.DB_PORT),
  dbUser: process.env.DB_USER as string,
  dbPassword: process.env.DB_PASSWORD as string,
  dbName: process.env.DB_NAME as string,
  // Shopee API
  shopeePartnerId: Number(process.env.PARTNER_ID),
  shopeePartnerKey: process.env.PARTNER_KEY as string,
  shopeeShopId: Number(process.env.SHOP_ID),
  shopeeAccessToken: process.env.ACCESS_TOKEN as string,
  shopeeRefreshToken: process.env.REFRESH_TOKEN as string,
  tokenSecretKey: process.env.TOKEN_SECRET_KEY as string,
  syncDelayMs: Number(process.env.SYNC_DELAY_MS ?? 300),
  syncTimeoutMs: Number(process.env.SYNC_TIMEOUT_MS ?? 10000),
  mockShopeeApi: process.env.MOCK_SHOPEE_API === "true",
  shopeeRedirectUrl: process.env.SHOPEE_REDIRECT_URL || "",
};
