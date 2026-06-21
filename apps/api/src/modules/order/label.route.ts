import { Elysia } from "elysia";
import { getSingleLabel, getBatchLabels, getBatchLabelsOptimized } from "../../services/label.service";
import { authMiddleware } from "../auth/auth.middleware";
import { isOrderOwnedByCompany, filterOrderSnsOwnedByCompany } from "./order-ownership";

// Order SN validation regex (alphanumeric, max 100 chars)
const ORDER_SN_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

// ─── In-memory PDF cache for batch downloads ─────────────────────
// Key: sorted order_sns joined with comma, Value: merged PDF data URL + timestamp
const pdfBatchCache = new Map<string, { url: string; timestamp: number }>();
const PDF_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function cleanExpiredPdfCache(): void {
  const now = Date.now();
  for (const [key, entry] of pdfBatchCache) {
    if (now - entry.timestamp > PDF_CACHE_TTL) {
      pdfBatchCache.delete(key);
    }
  }
}

function getPdfCacheKey(orderSns: string[]): string {
  return [...orderSns].sort().join(',');
}

function validateOrderSn(orderSn: string): boolean {
  return ORDER_SN_REGEX.test(orderSn);
}

function getErrorStatusCode(error: string): number {
  if (error.includes('tidak ditemukan')) return 404;
  if (error.includes('tidak dapat dicetak labelnya')) return 422;
  if (error.includes('belum tersedia')) return 404;
  if (error.includes('Autentikasi gagal') || error.includes('kredensial')) return 401;
  if (error.includes('Terlalu banyak permintaan')) return 429;
  return 500;
}

/**
 * Label printing routes
 */
export const labelRoutes = new Elysia({ prefix: "/orders" })
  .use(authMiddleware)

  // ─── Shopee Default Labels ──────────────────────────────────────────────

  // Optimized batch endpoint — uses batch APIs (6-8 calls for 50 orders)
  // Returns a single merged PDF for all orders
  .post("/shipping-labels/batch-download", async ({ body, set, user }) => {
    const startTime = Date.now();
    try {
      if (!body || typeof body !== 'object') {
        set.status = 400;
        return { success: false, error: "Request body tidak valid." };
      }

      const { order_sns } = body as { order_sns?: unknown };

      if (!order_sns || !Array.isArray(order_sns)) {
        set.status = 400;
        return { success: false, error: "Field order_sns harus berupa array." };
      }

      if (order_sns.length === 0) {
        set.status = 422;
        return { success: false, error: "Array order_sns tidak boleh kosong." };
      }

      if (order_sns.length > 50) {
        set.status = 422;
        return { success: false, error: `Maksimal 50 order per batch. Diterima ${order_sns.length}.` };
      }

      // Task 5.1: String type validation (before format validation)
      const nonStringItems = order_sns.filter(item => typeof item !== 'string');
      if (nonStringItems.length > 0) {
        set.status = 400;
        return { success: false, error: "Semua item dalam order_sns harus berupa string." };
      }

      // Task 5.2: Alphanumeric format validation
      const invalidOrderSns = (order_sns as string[]).filter(sn => !ORDER_SN_REGEX.test(sn));
      if (invalidOrderSns.length > 0) {
        set.status = 422;
        return {
          success: false,
          error: `Format order_sn tidak valid untuk: ${invalidOrderSns.slice(0, 5).join(', ')}`
        };
      }

      const ownedSet = await filterOrderSnsOwnedByCompany(order_sns as string[], user.companyId);
      if (ownedSet.size !== new Set(order_sns as string[]).size) {
        set.status = 404;
        return { success: false, error: "Order tidak ditemukan" };
      }

      // Task 5.3: Call service and return proper response structure
      // Check PDF cache first
      cleanExpiredPdfCache();
      const cacheKey = getPdfCacheKey(order_sns as string[]);
      const cachedEntry = pdfBatchCache.get(cacheKey);
      if (cachedEntry && (Date.now() - cachedEntry.timestamp) < PDF_CACHE_TTL) {
        console.log('[label-routes] PDF batch cache HIT for', (order_sns as string[]).length, 'orders');
        set.status = 200;
        return {
          success: true,
          data: {
            url: cachedEntry.url,
            format: 'pdf',
            successCount: (order_sns as string[]).length,
            failedOrders: [],
            cached: true
          }
        };
      }

      const result = await getBatchLabelsOptimized(order_sns as string[]);
      const elapsed = Date.now() - startTime;

      if (result.success && (result.pdfUrl || result.pdfUrls)) {
        // Store in cache if we have a single merged PDF URL
        if (result.pdfUrl) {
          pdfBatchCache.set(cacheKey, { url: result.pdfUrl, timestamp: Date.now() });
          console.log(`[label-routes] ✅ PDF batch (${(order_sns as string[]).length} orders) completed in ${elapsed}ms — cached`);
        } else {
          console.log(`[label-routes] ✅ PDF batch (${(order_sns as string[]).length} orders) completed in ${elapsed}ms`);
        }

        set.status = 200;
        return {
          success: true,
          data: {
            url: result.pdfUrl || undefined,
            urls: result.pdfUrls || undefined,
            format: 'pdf',
            successCount: result.successCount,
            failedOrders: result.failedOrders
          }
        };
      } else {
        // Total failure from service — include error details and failedOrders
        const elapsed2 = Date.now() - startTime;
        console.error(`[label-routes] ❌ PDF batch (${(order_sns as string[]).length} orders) FAILED in ${elapsed2}ms`);
        set.status = 500;
        return {
          success: false,
          error: result.failedOrders.length > 0
            ? result.failedOrders[0]?.error
            : "Gagal mengambil label batch",
          failedOrders: result.failedOrders
        };
      }
    } catch (error: any) {
      // Unexpected internal error — no system internals exposed
      console.error('[label-routes] Batch optimized label error:', { error: error.message });
      set.status = 500;
      return { success: false, error: "Terjadi kesalahan internal saat memproses batch label" };
    }
  })

  .post("/shipping-labels/batch", async ({ body, set, user }) => {
    try {
      if (!body || typeof body !== 'object') {
        set.status = 400;
        return { success: false, error: "Request body tidak valid." };
      }

      const { order_sns } = body as { order_sns?: unknown };

      if (!order_sns || !Array.isArray(order_sns)) {
        set.status = 400;
        return { success: false, error: "Field order_sns harus berupa array." };
      }

      if (order_sns.length === 0) {
        set.status = 422;
        return { success: false, error: "Array order_sns tidak boleh kosong." };
      }

      const MAX_BATCH_SIZE = 50;
      if (order_sns.length > MAX_BATCH_SIZE) {
        set.status = 422;
        return {
          success: false,
          error: `Jumlah order melebihi batas maksimal ${MAX_BATCH_SIZE}. Diterima ${order_sns.length} order.`
        };
      }

      const invalidItems = order_sns.filter(item => typeof item !== 'string');
      if (invalidItems.length > 0) {
        set.status = 400;
        return { success: false, error: "Semua item dalam order_sns harus berupa string." };
      }

      const invalidOrderSns = order_sns.filter(sn => !validateOrderSn(sn));
      if (invalidOrderSns.length > 0) {
        set.status = 422;
        return {
          success: false,
          error: `Format order_sn tidak valid untuk: ${invalidOrderSns.slice(0, 5).join(', ')}`
        };
      }

      const ownedSet = await filterOrderSnsOwnedByCompany(order_sns as string[], user.companyId);
      if (ownedSet.size !== new Set(order_sns as string[]).size) {
        set.status = 404;
        return { success: false, error: "Order tidak ditemukan" };
      }

      const results = await getBatchLabels(order_sns as string[]);
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      set.status = 200;
      return {
        success: true,
        data: {
          total: order_sns.length,
          successful,
          failed,
          results: results.map(result => ({
            orderSn: result.orderSn,
            success: result.success,
            url: result.label?.url,
            format: result.label?.format,
            trackingNumber: result.label?.trackingNumber,
            error: result.error
          }))
        }
      };
    } catch (error: any) {
      console.error('[label-routes] Batch label error:', { error: error.message });
      set.status = 500;
      return { success: false, error: "Terjadi kesalahan internal saat memproses permintaan batch label." };
    }
  })

  .get("/:orderSn/shipping-label", async ({ params, set, user }) => {
    const { orderSn } = params;
    const startTime = Date.now();

    if (!validateOrderSn(orderSn)) {
      set.status = 422;
      return { success: false, error: "Format order_sn tidak valid." };
    }

    try {
      if (!(await isOrderOwnedByCompany(orderSn, user.companyId))) {
        set.status = 404;
        return { success: false, error: "Order tidak ditemukan" };
      }
      const result = await getSingleLabel(orderSn);
      const elapsed = Date.now() - startTime;

      if (result.success && result.label) {
        console.log(`[label-routes] ✅ Single label ${orderSn} completed in ${elapsed}ms`);
        set.status = 200;
        return {
          success: true,
          data: {
            orderSn: result.label.orderSn,
            url: result.label.url,
            format: result.label.format,
            trackingNumber: result.label.trackingNumber,
            retrievedAt: result.label.retrievedAt
          }
        };
      } else {
        const elapsed2 = Date.now() - startTime;
        console.log(`[label-routes] ⚠️ Single label ${orderSn} failed in ${elapsed2}ms: ${result.error}`);
        const statusCode = getErrorStatusCode(result.error || '');
        set.status = statusCode;
        return { success: false, error: result.error || 'Gagal mengambil label pengiriman' };
      }
    } catch (error: any) {
      console.error('[label-routes] Get single label error:', { orderSn, error: error.message });
      set.status = 500;
      return { success: false, error: "Terjadi kesalahan internal saat memproses permintaan label." };
    }
  })

  // ─── Custom Label Data (Frontend Rendering) ─────────────────────────────
  // Returns JSON — frontend renders the label in browser + window.print()

  .get("/:orderSn/label-data", async ({ params, set, user }) => {
    const { orderSn } = params;
    const startTime = Date.now();

    if (!validateOrderSn(orderSn)) {
      set.status = 422;
      return { success: false, error: "Format order_sn tidak valid." };
    }

    try {
      if (!(await isOrderOwnedByCompany(orderSn, user.companyId))) {
        set.status = 404;
        return { success: false, error: "Order tidak ditemukan" };
      }
      const { getLabelData } = await import("../../services/label-data.service");
      const result = await getLabelData(orderSn);
      const elapsed = Date.now() - startTime;

      if (result.success) {
        console.log(`[label-routes] ✅ Custom label-data ${orderSn} completed in ${elapsed}ms`);
        set.status = 200;
        return { success: true, data: result.data };
      } else {
        set.status = 500;
        return { success: false, error: result.error || "Gagal mengambil data label" };
      }
    } catch (error: any) {
      console.error('[label-routes] label-data error:', { orderSn, error: error.message });
      set.status = 500;
      return { success: false, error: "Terjadi kesalahan saat mengambil data label." };
    }
  })

  .post("/label-data/batch", async ({ body, set, user }) => {
    const startTime = Date.now();
    try {
      if (!body || typeof body !== 'object') {
        set.status = 400;
        return { success: false, error: "Request body tidak valid." };
      }

      const { order_sns } = body as { order_sns?: unknown };

      if (!order_sns || !Array.isArray(order_sns)) {
        set.status = 400;
        return { success: false, error: "Field order_sns harus berupa array." };
      }

      if (order_sns.length === 0) {
        set.status = 422;
        return { success: false, error: "Array order_sns tidak boleh kosong." };
      }

      const MAX_BATCH_SIZE = 50;
      if (order_sns.length > MAX_BATCH_SIZE) {
        set.status = 422;
        return {
          success: false,
          error: `Melebihi batas maksimal ${MAX_BATCH_SIZE} order. Diterima ${order_sns.length}.`
        };
      }

      const invalidSns = order_sns.filter((sn: any) => typeof sn !== 'string' || !validateOrderSn(sn));
      if (invalidSns.length > 0) {
        set.status = 422;
        return { success: false, error: `Format order_sn tidak valid: ${invalidSns.slice(0, 3).join(', ')}` };
      }

      const ownedSet = await filterOrderSnsOwnedByCompany(order_sns as string[], user.companyId);
      if (ownedSet.size !== new Set(order_sns as string[]).size) {
        set.status = 404;
        return { success: false, error: "Order tidak ditemukan" };
      }

      const { getBatchLabelData } = await import("../../services/label-data.service");
      const result = await getBatchLabelData(order_sns);
      const elapsed = Date.now() - startTime;
      console.log(`[label-routes] ✅ Custom label-data batch (${order_sns.length} orders) completed in ${elapsed}ms`);

      set.status = 200;
      return { success: true, data: result };
    } catch (error: any) {
      console.error('[label-routes] label-data batch error:', { error: error.message });
      set.status = 500;
      return { success: false, error: "Terjadi kesalahan saat mengambil data label batch." };
    }
  });
