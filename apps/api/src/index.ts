import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit";
import { and, eq, lt, sql } from "drizzle-orm";
import { env } from "./config/env";
import { productRoutes } from "./modules/product/product.route";
import { shopeeRoutes } from "./modules/shopee/shopee.route";
import { shopeeAuthRoutes } from "./modules/shopee/shopee-auth.route";
import { masterRoutes } from "./modules/master/master.route";
import { orderRoutes } from "./modules/order/order.route";
import { labelRoutes } from "./modules/order/label.route";
import { orderDetailRoutes } from "./modules/order/order-detail.route";
import { healthRoutes } from "./routes/health";
import { hppRoutes } from "./modules/hpp/hpp.route";
import { masterPackingCostRoutes } from "./modules/master/packing-cost/master-packing-cost.route";
import { packingCostRoutes } from "./modules/packing-cost/packing-cost.route";
import { profitRoutes } from "./modules/profit/profit.route";
import { db } from "./db/client";
import { shopeeCredentials, revokedSessions, failedLoginAttempts } from "./db/schema";
import { ensureAllTokensFresh } from "./services/shopee-auth";
import { backgroundSyncService } from "./services/background-sync.service";
import { EscrowSyncService } from "./services/escrow-sync.service";
import { authPublicRoutes, authProtectedRoutes } from "./modules/auth/auth.route";
import { passwordResetPublicRoutes } from "./modules/auth/password-reset.route";
import { authMiddleware } from "./modules/auth/auth.middleware";
import { featureGuardMiddleware } from "./modules/auth/feature-guard.middleware";
import { permissionsRoutes } from "./modules/auth/permissions.route";
import { ensureStaffPermissionsLoaded } from "./modules/auth/permissions.service";
import { originMiddleware } from "./modules/auth/origin.middleware";
import { platformAuthPublicRoutes, platformAuthProtectedRoutes } from "./modules/platform/platform-auth.route";
import { platformCompaniesRoutes } from "./modules/platform/platform-companies.route";
import { platformUsersRoutes } from "./modules/platform/platform-users.route";
import { usersRoutes } from "./modules/users/users.route";
import { autoBoostRoutes } from "./modules/auto-boost/auto-boost.route";
import { startQueues, stopQueues } from "./queue";
// Fail-fast: di production FRONTEND_URL wajib diset (dipakai untuk CORS allowlist).
if (env.nodeEnv === 'production' && !env.frontendUrl) {
  throw new Error(
    "[CONFIG] FRONTEND_URL wajib diset di production untuk CORS allowlist. " +
    "Set FRONTEND_URL ke origin frontend, contoh: https://sentralio.my.id"
  );
}

const corsOrigins = env.nodeEnv === 'production'
  ? [env.frontendUrl as string]
  : ["http://localhost:5173", "http://localhost:3000", "http://localhost:5175"];

const app = new Elysia()
  .use(cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }))
  .use(rateLimit({
    duration: 60000, // 1 minute window
    max: 300, // 300 requests per minute per IP
    errorResponse: {
      success: false,
      message: "Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.",
      error: "RATE_LIMIT_EXCEEDED"
    },
    generator: (req, server) => {
      // Use IP address as identifier
      return server?.requestIP(req)?.address || 'unknown';
    },
    skip: (req) => {
      // Skip rate limit hanya untuk health check & endpoint resolve (HPP/packing-cost).
      // Cocokkan pada pathname (tanpa query) supaya tidak bisa di-bypass via substring.
      let pathname: string;
      try {
        pathname = new URL(req.url).pathname;
      } catch {
        pathname = req.url;
      }
      return pathname.endsWith('/health') || pathname.endsWith('/resolve');
    }
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
    message: "Sentralio API is running",
  }))

  // ─── Public routes: no auth required ─────────────────────────────────────
  // Must be mounted BEFORE originMiddleware + authMiddleware so they are
  // accessible without a session (Req 4.3, 5.4).
  .use(healthRoutes)

  // Dedicated rate-limiter for login — tighter than the global limit to defend
  // against password spraying across multiple accounts from one IP.
  // Skips all non-login paths so the global limiter handles the rest.
  .use(rateLimit({
    duration: 60000,
    max: 10, // maksimal 10 percobaan login per menit per IP
    scoping: 'global',
    errorResponse: {
      success: false,
      message: "Terlalu banyak percobaan login. Coba lagi sebentar lagi.",
      error: "LOGIN_RATE_LIMIT_EXCEEDED",
    },
    generator: (req, server) => server?.requestIP(req)?.address || 'unknown',
    skip: (req) => {
      let pathname: string;
      try { pathname = new URL(req.url).pathname; } catch { pathname = req.url; }
      // Limiter ini HANYA berlaku untuk login; selain itu di-skip.
      return !(pathname.endsWith('/auth/login') && req.method === 'POST');
    },
  }))

  .use(authPublicRoutes)   // POST /auth/login
  .use(passwordResetPublicRoutes)

  // ─── Platform portal auth (Super Admin) ──────────────────────────────────
  // Dimount SEBELUM origin/auth middleware tenant supaya login portal publik
  // dan route portal dijaga oleh middleware sesi platform-nya sendiri
  // (scope:'platform'), bukan sesi tenant.
  .use(platformAuthPublicRoutes)      // POST /platform/auth/login
  .use(platformAuthProtectedRoutes)   // GET /platform/auth/me, POST /platform/auth/logout
  .use(platformCompaniesRoutes)       // GET /platform/companies, /companies/:id
  .use(platformUsersRoutes)

  // ─── Protected routes: require valid session ──────────────────────────────
  // Apply Origin_Middleware then Auth_Middleware to all routes below.
  .use(originMiddleware)
  .use(authMiddleware)

  // Auth protected routes (logout, me, renew) — Req 5.5
  .use(authProtectedRoutes)

  // Staff permission configuration (admin only)
  .use(permissionsRoutes)

  // Centralized feature authorization (path-based) — enforces configurable
  // staff permissions on the backend (403) for all feature routes below.
  .use(featureGuardMiddleware)

  // User management — Req 5.9 (user_management feature, admin only)
  .use(usersRoutes)

  // Order management — orders / cetak_label features (staff + admin)
  .use(orderRoutes)
  .use(labelRoutes)
  .use(orderDetailRoutes)

  // Master data / products — master_produk / produk_channel features (admin only)
  .use(masterRoutes)
  .use(productRoutes)

  // Cost management (HPP / packing costs) — master_produk feature (admin only)
  .use(hppRoutes)
  .use(masterPackingCostRoutes)
  .use(packingCostRoutes)

  // Financial reports — laporan_keuangan feature (admin only)
  .use(profitRoutes)

  // Shopee integration — integrasi_toko feature (admin only)
  .use(shopeeRoutes)
  .use(shopeeAuthRoutes)
  .use(autoBoostRoutes)

  // ─── Background Sync Status & Control ────────────────────────
  .get("/sync/status", () => {
    const stats = backgroundSyncService.getSyncStats();
    return {
      success: true,
      data: stats
    };
  })

  .post("/sync/force", async ({ body }) => {
    const { order_status, days_back } = body as { order_status?: string, days_back?: number };
    try {
      const result = await backgroundSyncService.forceSyncOrders(order_status, days_back || 15);
      return {
        success: true,
        message: `Force sync completed, synced ${result.totalSynced} orders`,
        data: result
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message
      };
    }
  })

  // ─── Escrow Sync: Manual trigger ─────────────────────────────
  .post("/sync/escrow", async ({ body, set }) => {
    const { days_back } = (body ?? {}) as { days_back?: number };
    const daysBack = days_back ?? 30;

    try {
      const service = new EscrowSyncService();
      const result = await service.startEscrowSync(daysBack);
      return result;
    } catch (err: any) {
      if (err.message === "SYNC_IN_PROGRESS") {
        set.status = 409;
        return {
          success: false,
          message: "Sinkronisasi escrow sedang berjalan",
        };
      }
      set.status = 500;
      return {
        success: false,
        message: err.message,
      };
    }
  })

  // ─── Multi-Seller: List all connected shops ─────────────────
  .get("/shopee/credentials/list", async ({ user }) => {
    try {
      // Smart-refresh: proactively refresh any expired/near-expired tokens
      await ensureAllTokensFresh();

      // Only list connected shops for the caller's company — disconnected shops
      // are hidden everywhere, and other companies' shops must never appear.
      const rows = await db.select().from(shopeeCredentials)
        .where(and(
          eq(shopeeCredentials.companyId, user.companyId),
          eq(shopeeCredentials.status, "connected"),
        ));
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
  .get("/shopee/credentials/status", async ({ query, user }) => {
    try {
      const shopId = query.shop_id ? parseInt(query.shop_id as string) : undefined;
      let rows;
      if (shopId) {
        rows = await db.select().from(shopeeCredentials)
          .where(and(
            eq(shopeeCredentials.companyId, user.companyId),
            eq(shopeeCredentials.shopId, shopId),
          )).limit(1);
      } else {
        rows = await db.select().from(shopeeCredentials)
          .where(eq(shopeeCredentials.companyId, user.companyId)).limit(1);
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

  // ─── Multi-Seller: Disconnect a shop (soft) ─────────────────
  // Soft-disconnect: keep the credentials row (so shop name + historical data
  // survive) but mark it disconnected and clear tokens. All of the shop's data
  // is then hidden across the app and sync skips it, until it's reconnected via
  // OAuth re-auth (which flips status back to 'connected').
  .delete("/shopee/credentials/:shopId", async ({ params, set, user }) => {
    const shopId = parseInt(params.shopId);
    if (!Number.isFinite(shopId)) {
      set.status = 400;
      return { success: false, message: "Invalid shop ID" };
    }
    try {
      const existing = await db.select().from(shopeeCredentials)
        .where(and(
          eq(shopeeCredentials.companyId, user.companyId),
          eq(shopeeCredentials.shopId, shopId),
        )).limit(1);
      if (existing.length === 0) {
        set.status = 404;
        return { success: false, message: `Shop ${shopId} not found` };
      }
      await db.update(shopeeCredentials)
        .set({
          status: "disconnected",
          // Clear tokens — we never keep credentials for a disconnected shop.
          accessToken: "",
          refreshToken: "",
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(shopeeCredentials.companyId, user.companyId),
          eq(shopeeCredentials.shopId, shopId),
        ));
      console.log(`[shopee-cred] Soft-disconnected shop_id=${shopId} (data hidden, sync skipped)`);
      return { success: true, message: `Shop ${shopId} disconnected` };
    } catch (err: any) {
      set.status = 500;
      return { success: false, message: err.message };
    }
  })

  .listen(env.appPort);

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port}`);

// Warm the staff-permissions cache so decide('staff', ...) is accurate from the
// first request (otherwise the first reads fall back to compiled defaults).
ensureStaffPermissionsLoaded()
  .then(() => console.log("[STARTUP] Staff permissions cache loaded"))
  .catch((err) => console.error(`[STARTUP] Failed to load staff permissions: ${err.message}`));

// ─── Background Sync: Auto-sync orders from Shopee ───────────
// Start background sync service after server is ready
setTimeout(async () => {
  try {
    console.log("[STARTUP] Initializing background sync service...");
    await backgroundSyncService.startBackgroundSync();
    console.log("[STARTUP] Background sync service started successfully");
    
    await startQueues();
    
    const { startApiMonitorLogger } = await import("./services/api-monitor");
    startApiMonitorLogger();
    
    // Auto Boost Scheduler
    const { autoBoostScheduler } = await import('./services/auto-boost.scheduler');
    autoBoostScheduler.start();
  } catch (err: any) {
    console.error(`[STARTUP] Failed to start background sync: ${err.message}`);
  }
}, 5000); // Wait 5 seconds after server start

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log("\n[SHUTDOWN] Received SIGINT, shutting down gracefully...");
  backgroundSyncService.stopBackgroundSync();
  await stopQueues();
  import('./services/auto-boost.scheduler').then(m => m.autoBoostScheduler.stop());
  try {
    const { closeBrowser } = await import('./services/pdf-generator.service');
    await closeBrowser();
  } catch (_) { /* ignore if not initialized */ }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("\n[SHUTDOWN] Received SIGTERM, shutting down gracefully...");
  backgroundSyncService.stopBackgroundSync();
  await stopQueues();
  import('./services/auto-boost.scheduler').then(m => m.autoBoostScheduler.stop());
  try {
    const { closeBrowser } = await import('./services/pdf-generator.service');
    await closeBrowser();
  } catch (_) { /* ignore if not initialized */ }
  process.exit(0);
});

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

  // ─── Session cleanup (Req 5.10, 11.4) ────────────────────────────────
  // Delete expired revoked_sessions rows (jti rows whose JWT has already
  // expired — no longer needed in the denylist).
  // Delete old failed_login_attempts rows (> 24h old — no longer relevant
  // for the 15-minute sliding window lockout check).
  try {
    const now = new Date();

    const [deletedSessions] = await db
      .delete(revokedSessions)
      .where(lt(revokedSessions.expiresAt, now));

    const [deletedAttempts] = await db
      .delete(failedLoginAttempts)
      .where(lt(failedLoginAttempts.attemptedAt, sql`NOW() - INTERVAL 24 HOUR`));

    console.log(
      `[CRON] Session cleanup: removed ${(deletedSessions as any)?.affectedRows ?? 0} expired revoked_sessions, ` +
      `${(deletedAttempts as any)?.affectedRows ?? 0} old failed_login_attempts`,
    );
  } catch (err: any) {
    console.error(`[CRON] Session cleanup error: ${err.message}`);
  }
}, TOKEN_REFRESH_INTERVAL);
console.log(`[CRON] Token auto-refresh scheduled every ${TOKEN_REFRESH_INTERVAL / 3600000}h`);
