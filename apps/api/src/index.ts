import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { eq } from "drizzle-orm";
import { env } from "./config/env";
import { productRoutes } from "./modules/product/product.route";
import { shopeeRoutes } from "./modules/shopee/shopee.route";
import { shopeeAuthRoutes } from "./modules/shopee/shopee-auth.route";
import { masterRoutes } from "./modules/master/master.route";
import { healthRoutes } from "./routes/health";
import { db } from "./db/client";
import { shopeeCredentials } from "./db/schema";
import { ensureAllTokensFresh } from "./services/shopee-auth";

const app = new Elysia()
  .use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5175"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }))
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Bad Request: Validation Error",
        errors: error.all,
      };
    }
  })
  .get("/", () => ({
    message: "wms-sync API is running",
  }))
  .use(healthRoutes)
  .use(productRoutes)
  .use(shopeeRoutes)
  .use(shopeeAuthRoutes)
  .use(masterRoutes)

  // ─── Multi-Seller: List all connected shops ─────────────────
  .get("/shopee/credentials/list", async () => {
    try {
      // Smart-refresh: proactively refresh any expired/near-expired tokens
      await ensureAllTokensFresh();

      const rows = await db.select().from(shopeeCredentials);
      return {
        success: true,
        data: rows.map(r => ({
          id: r.id,
          shop_id: r.shopId,
          shop_name: r.shopName || `Shop #${r.shopId}`,
          connected: new Date(r.expiresAt) > new Date(),
          is_expired: new Date(r.expiresAt) < new Date(),
          expires_at: r.expiresAt.toISOString(),
          updated_at: r.updatedAt.toISOString(),
        })),
      };
    } catch {
      return { success: false, data: [] };
    }
  })

  // ─── Multi-Seller: Status of specific shop ──────────────────
  .get("/shopee/credentials/status", async ({ query }) => {
    try {
      const shopId = query.shop_id ? parseInt(query.shop_id as string) : undefined;
      let rows;
      if (shopId) {
        rows = await db.select().from(shopeeCredentials)
          .where(eq(shopeeCredentials.shopId, shopId)).limit(1);
      } else {
        rows = await db.select().from(shopeeCredentials).limit(1);
      }
      if (rows.length === 0) {
        return { connected: false, message: "No credentials found" };
      }
      const cred = rows[0];
      const isExpired = new Date(cred.expiresAt) < new Date();
      return {
        connected: !isExpired,
        shop_id: cred.shopId,
        shop_name: cred.shopName || `Shop #${cred.shopId}`,
        expires_at: cred.expiresAt.toISOString(),
        is_expired: isExpired,
        updated_at: cred.updatedAt.toISOString(),
      };
    } catch {
      return { connected: false, message: "Failed to check credentials" };
    }
  })

  // ─── Multi-Seller: Disconnect a shop ────────────────────────
  .delete("/shopee/credentials/:shopId", async ({ params, set }) => {
    const shopId = parseInt(params.shopId);
    if (!Number.isFinite(shopId)) {
      set.status = 400;
      return { success: false, message: "Invalid shop ID" };
    }
    try {
      const existing = await db.select().from(shopeeCredentials)
        .where(eq(shopeeCredentials.shopId, shopId)).limit(1);
      if (existing.length === 0) {
        set.status = 404;
        return { success: false, message: `Shop ${shopId} not found` };
      }
      await db.delete(shopeeCredentials).where(eq(shopeeCredentials.shopId, shopId));
      console.log(`[shopee-cred] Disconnected shop_id=${shopId}`);
      return { success: true, message: `Shop ${shopId} disconnected` };
    } catch (err: any) {
      set.status = 500;
      return { success: false, message: err.message };
    }
  })

  .listen(env.appPort);

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);

// ─── Cron: Auto-refresh Shopee tokens every 3 hours ──────────
const TOKEN_REFRESH_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours
setInterval(async () => {
  console.log("[CRON] Running token refresh check...");
  try {
    const result = await ensureAllTokensFresh();
    if (result.refreshed > 0 || result.failed > 0) {
      console.log(`[CRON] Token refresh complete: ${result.refreshed} refreshed, ${result.failed} failed`);
    } else {
      console.log("[CRON] All tokens still valid, no refresh needed");
    }
  } catch (err: any) {
    console.error(`[CRON] Token refresh error: ${err.message}`);
  }
}, TOKEN_REFRESH_INTERVAL);
console.log(`[CRON] Token auto-refresh scheduled every ${TOKEN_REFRESH_INTERVAL / 3600000}h`);
