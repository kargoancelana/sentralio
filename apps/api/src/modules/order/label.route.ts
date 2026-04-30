import { Elysia, t } from "elysia";
import { getSingleLabel, getBatchLabels } from "../../services/label.service";

// Order SN validation regex (alphanumeric, max 100 chars)
const ORDER_SN_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Validate order SN format
 */
function validateOrderSn(orderSn: string): boolean {
  return ORDER_SN_REGEX.test(orderSn);
}

/**
 * Determine HTTP status code based on error message
 */
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
 * 
 * Provides endpoints for retrieving shipping labels for Shopee orders
 */
export const labelRoutes = new Elysia({ prefix: "/orders" })
  
  /**
   * Get batch order shipping labels
   * 
   * Retrieves shipping labels for multiple PROCESSED orders.
   * Processes up to 50 orders with max 5 concurrent requests.
   * Returns results array with success/failure for each order.
   * 
   * **Validates Requirements**: 11.2, 11.4, 11.5, 11.8
   * 
   * @param body - Request body with order_sns array
   * @returns Batch results with summary
   * 
   * Response codes:
   * - 200: Batch processed (check individual results for success/failure)
   * - 400: Invalid request body
   * - 422: Validation error (empty array or exceeds 50 items)
   * - 500: Internal server error
   */
  .post("/shipping-labels/batch", async ({ body, set }) => {
    try {
      // Validate request body structure
      if (!body || typeof body !== 'object') {
        set.status = 400;
        return {
          success: false,
          error: "Request body tidak valid. Harus berupa objek JSON dengan field order_sns."
        };
      }

      const { order_sns } = body as { order_sns?: unknown };

      // Validate order_sns field exists and is an array
      if (!order_sns || !Array.isArray(order_sns)) {
        set.status = 400;
        return {
          success: false,
          error: "Field order_sns harus berupa array."
        };
      }

      // Validate array is not empty
      if (order_sns.length === 0) {
        set.status = 422;
        return {
          success: false,
          error: "Array order_sns tidak boleh kosong. Minimal 1 order diperlukan."
        };
      }

      // Validate array does not exceed maximum size
      const MAX_BATCH_SIZE = 50;
      if (order_sns.length > MAX_BATCH_SIZE) {
        set.status = 422;
        return {
          success: false,
          error: `Jumlah order melebihi batas maksimal ${MAX_BATCH_SIZE}. Diterima ${order_sns.length} order.`
        };
      }

      // Validate all items are strings
      const invalidItems = order_sns.filter(item => typeof item !== 'string');
      if (invalidItems.length > 0) {
        set.status = 400;
        return {
          success: false,
          error: "Semua item dalam order_sns harus berupa string."
        };
      }

      // Validate order SN format for each item
      const invalidOrderSns = order_sns.filter(sn => !validateOrderSn(sn));
      if (invalidOrderSns.length > 0) {
        set.status = 422;
        return {
          success: false,
          error: `Format order_sn tidak valid untuk: ${invalidOrderSns.slice(0, 5).join(', ')}${invalidOrderSns.length > 5 ? '...' : ''}. Harus berupa alfanumerik dengan maksimal 100 karakter.`
        };
      }

      // Call batch label service
      const results = await getBatchLabels(order_sns);

      // Calculate summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // Transform results to match expected response format
      const transformedResults = results.map(result => ({
        orderSn: result.orderSn,
        success: result.success,
        url: result.label?.url,
        format: result.label?.format,
        trackingNumber: result.label?.trackingNumber,
        error: result.error
      }));

      // Return success response with results wrapped in data object
      set.status = 200;
      return {
        success: true,
        data: {
          total: order_sns.length,
          successful,
          failed,
          results: transformedResults
        }
      };

    } catch (error: any) {
      // Unexpected error - log and return 500
      console.error('[label-routes] Batch label error:', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });

      set.status = 500;
      return {
        success: false,
        error: "Terjadi kesalahan internal saat memproses permintaan batch label."
      };
    }
  })

  /**
   * Get single order shipping label
   * 
   * Retrieves shipping label for a single PROCESSED order.
   * Returns label document with URL/data and format information.
   * 
   * **Validates Requirements**: 11.1, 11.3, 11.6, 11.7
   * 
   * @param orderSn - Order serial number (path parameter)
   * @returns Label data with URL, format, and tracking number
   * 
   * Response codes:
   * - 200: Label retrieved successfully
   * - 404: Order not found or label not available
   * - 422: Order not in PROCESSED status
   * - 500: Internal server error
   */
  .get("/:orderSn/shipping-label", async ({ params, set }) => {
    const { orderSn } = params;

    // Validate order SN format
    if (!validateOrderSn(orderSn)) {
      set.status = 422;
      return {
        success: false,
        error: "Format order_sn tidak valid. Harus berupa alfanumerik dengan maksimal 100 karakter."
      };
    }

    try {
      // Call label service to retrieve label
      const result = await getSingleLabel(orderSn);

      if (result.success && result.label) {
        // Success - return label data
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
        // Error - determine appropriate status code and return error
        const statusCode = getErrorStatusCode(result.error || '');
        set.status = statusCode;
        return {
          success: false,
          error: result.error || 'Gagal mengambil label pengiriman'
        };
      }
    } catch (error: any) {
      // Unexpected error - log and return 500
      console.error('[label-routes] Get single label error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        error: error.message,
        stack: error.stack
      });

      set.status = 500;
      return {
        success: false,
        error: "Terjadi kesalahan internal saat memproses permintaan label."
      };
    }
  })

  // ─── Custom Label Endpoints ─────────────────────────────────
  // These use the custom HTML/CSS template rendered via Puppeteer
  // instead of Shopee's default label PDF.

  /**
   * Get single custom shipping label PDF
   * 
   * Renders a custom 4×6 thermal label using the HTML template
   * populated with real order data from Shopee API and local DB.
   * Returns base64-encoded PDF.
   * 
   * @param orderSn - Order serial number (path parameter)
   * @returns Custom label PDF as base64
   */
  .get("/:orderSn/custom-label", async ({ params, set }) => {
    const { orderSn } = params;

    if (!validateOrderSn(orderSn)) {
      set.status = 422;
      return {
        success: false,
        error: "Format order_sn tidak valid."
      };
    }

    try {
      const { getCustomLabel } = await import("../../services/custom-label.service");
      const result = await getCustomLabel(orderSn);

      if (result.success) {
        set.status = 200;
        return {
          success: true,
          data: {
            orderSn,
            pdf: result.pdf,
            format: 'pdf',
            trackingNumber: result.trackingNumber
          }
        };
      } else {
        set.status = 500;
        return {
          success: false,
          error: result.error || "Gagal membuat custom label"
        };
      }
    } catch (error: any) {
      console.error('[label-routes] Custom label error:', {
        timestamp: new Date().toISOString(),
        orderSn,
        error: error.message
      });

      set.status = 500;
      return {
        success: false,
        error: "Terjadi kesalahan saat membuat custom label."
      };
    }
  })

  /**
   * Get batch custom shipping labels as multi-page PDF
   * 
   * Renders custom labels for multiple orders, combined into
   * a single multi-page PDF. Max 50 orders per request.
   * 
   * @param body - Request body with order_sns array
   * @returns Multi-page PDF as base64 + per-order results
   */
  .post("/custom-labels/batch", async ({ body, set }) => {
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

      const invalidOrderSns = order_sns.filter((sn: any) =>
        typeof sn !== 'string' || !validateOrderSn(sn)
      );
      if (invalidOrderSns.length > 0) {
        set.status = 422;
        return {
          success: false,
          error: `Format order_sn tidak valid: ${invalidOrderSns.slice(0, 3).join(', ')}`
        };
      }

      const { getCustomBatchLabels } = await import("../../services/custom-label.service");
      const result = await getCustomBatchLabels(order_sns);

      const successful = result.results.filter(r => r.success).length;
      const failed = result.results.filter(r => !r.success).length;

      set.status = 200;
      return {
        success: result.success,
        data: {
          total: order_sns.length,
          successful,
          failed,
          pdf: result.pdf,
          format: 'pdf',
          results: result.results
        }
      };
    } catch (error: any) {
      console.error('[label-routes] Batch custom label error:', {
        timestamp: new Date().toISOString(),
        error: error.message
      });

      set.status = 500;
      return {
        success: false,
        error: "Terjadi kesalahan saat membuat batch custom labels."
      };
    }
  });
