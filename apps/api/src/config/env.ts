import { config } from "dotenv";
import { resolve } from "path";

// Monorepo: load .env from project root (../../.env from apps/api/)
config({ path: resolve(import.meta.dir, "../../../..", ".env") });
// Fallback: also try local .env
config();

// Variables required just to BOOT the server (and to log in).
//
// Intentionally NOT required here: SHOP_ID, ACCESS_TOKEN, REFRESH_TOKEN.
// Those are per-shop values obtained AFTER authorizing a shop via Shopee OAuth
// in the web app (Settings → Integrasi Toko). At runtime they are read from and
// refreshed in the `shopee_credentials` table — never from env — so the server
// must start (and login must work) on a fresh install without them.
//
// PARTNER_ID / PARTNER_KEY are your Shopee partner-app identity (known up front)
// and are needed to start the OAuth flow, so they stay required. TOKEN_SECRET_KEY
// encrypts credentials at rest and is also required.
const requiredEnv = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "PARTNER_ID",
  "PARTNER_KEY",
  "TOKEN_SECRET_KEY",
] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// --- Auth env validation (fail-fast before any port binding) ---

// AUTH_JWT_SECRET: must be present and at least 32 UTF-8 bytes (Req 2.5)
const jwtSecret = process.env.AUTH_JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
  console.error(
    "[FATAL] AUTH_JWT_SECRET is missing or too short (must be >= 32 UTF-8 bytes). " +
      "Set a sufficiently long secret before starting the server."
  );
  process.exit(1);
}

// AUTH_ALLOWED_ORIGINS: must contain at least one valid http/https origin (Req 9.7)
function isValidOriginEntry(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const rawAllowedOrigins = process.env.AUTH_ALLOWED_ORIGINS ?? "";
const hasValidOrigin = rawAllowedOrigins
  .split(",")
  .some((entry) => isValidOriginEntry(entry));

if (!hasValidOrigin) {
  console.error(
    "[FATAL] AUTH_ALLOWED_ORIGINS is unset, empty, or contains no syntactically valid " +
      "http/https origin entries. Provide at least one valid origin (e.g. https://example.com) " +
      "before starting the server."
  );
  process.exit(1);
}

// --- End auth env validation ---

export const env = {
  appPort: Number(process.env.APP_PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "",
  dbHost: process.env.DB_HOST as string,
  dbPort: Number(process.env.DB_PORT),
  dbUser: process.env.DB_USER as string,
  dbPassword: process.env.DB_PASSWORD as string,
  dbName: process.env.DB_NAME as string,
  // Shopee API — partner-app identity (required)
  shopeePartnerId: Number(process.env.PARTNER_ID),
  shopeePartnerKey: process.env.PARTNER_KEY as string,
  // Per-shop Shopee values — optional; obtained via OAuth and stored in the DB.
  // Defaulted here so the server boots without them on a fresh install.
  shopeeShopId: Number(process.env.SHOP_ID ?? 0),
  shopeeAccessToken: process.env.ACCESS_TOKEN ?? "",
  shopeeRefreshToken: process.env.REFRESH_TOKEN ?? "",
  tokenSecretKey: process.env.TOKEN_SECRET_KEY as string,
  syncDelayMs: Number(process.env.SYNC_DELAY_MS ?? 300),
  syncTimeoutMs: Number(process.env.SYNC_TIMEOUT_MS ?? 10000),
  shopeeRedirectUrl: process.env.SHOPEE_REDIRECT_URL || "",
  // Shopee Push (webhook) — optional, beda dari PARTNER_KEY OAuth.
  // Ambil dari "Live Push Partner Key" di Shopee Console > Push Mechanism.
  // Kalau belum diset, webhook tetap bisa diverifikasi pakai PARTNER_KEY reguler.
  shopeePushPartnerKey: process.env.SHOPEE_PUSH_PARTNER_KEY || process.env.PARTNER_KEY || "",
  shopeeWebhookCallbackUrl: process.env.SHOPEE_WEBHOOK_CALLBACK_URL || "",
  // Auth
  authJwtSecret: jwtSecret,
  authAllowedOrigins: rawAllowedOrigins,
};
