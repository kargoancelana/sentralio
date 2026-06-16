import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit";
import { lt, sql } from "drizzle-orm";
import { env } from "./config/env";
import { productRoutes } from "./modules/product/product.route";
import { shopeeRoutes } from "./modules/shopee/shopee.route";
import { shopeeAuthRoutes } from "./modules/shopee/shopee-auth.route";
import { syncRoutes } from "./modules/sync/sync.route";
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
import { revokedSessions, failedLoginAttempts } from "./db/schema";
import { ensureAllTokensFresh } from "./services/shopee-auth";
import { backgroundSyncService } from "./services/background-sync.service";
import { authPublicRoutes, authProtectedRoutes } from "./modules/auth/auth.route";
import { authMiddleware } from "./modules/auth/auth.middleware";
import { featureGuardMiddleware } from "./modules/auth/feature-guard.middleware";
import { permissionsRoutes } from "./modules/auth/permissions.route";
import { ensureStaffPermissionsLoaded } from "./modules/auth/permissions.service";
import { originMiddleware } from "./modules/auth/origin.middleware";
import { usersRoutes } from "./modules/users/users.route";

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

  // Sync control (background-sync status & escrow) — no feature guard, internal only
  .use(syncRoutes)

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
  } catch (err: any) {
    console.error(`[STARTUP] Failed to start background sync: ${err.message}`);
  }
}, 5000); // Wait 5 seconds after server start

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log("\n[SHUTDOWN] Received SIGINT, shutting down gracefully...");
  backgroundSyncService.stopBackgroundSync();
  try {
    const { closeBrowser } = await import('./services/pdf-generator.service');
    await closeBrowser();
  } catch (_) { /* ignore if not initialized */ }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("\n[SHUTDOWN] Received SIGTERM, shutting down gracefully...");
  backgroundSyncService.stopBackgroundSync();
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
