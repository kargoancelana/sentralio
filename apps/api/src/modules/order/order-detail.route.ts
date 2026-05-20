import { Elysia } from "elysia";
import { getOrderDetail } from "../../services/order-detail.service";

/**
 * Validates Shopee order SN format.
 *
 * Shopee order SNs are alphanumeric strings, typically 15–20 characters.
 * We accept 5–30 chars, alphanumeric only (no spaces or special characters).
 *
 * **Validates: Requirements 8.1**
 */
export function isValidOrderSn(orderSn: string): boolean {
  if (typeof orderSn !== "string") return false;
  return /^[A-Za-z0-9]{5,30}$/.test(orderSn);
}

/**
 * Order Detail route.
 *
 * GET /orders/:orderSn/detail
 *   - Validates orderSn format (400 on invalid)
 *   - Parses ?refresh=1 or ?refresh=true to bypass cache
 *   - Maps OrderDetailResult kinds to HTTP status codes:
 *       ok                    → 200
 *       not_found             → 404
 *       marketplace_unsupported → 501
 *       timeout               → 504
 *       upstream_error        → 502
 *
 * **Validates: Requirements 8.1, 8.6, 8.7, 8.8, 8.9, 11.2**
 */
export const orderDetailRoutes = new Elysia({ prefix: "/orders" }).get(
  "/:orderSn/detail",
  async ({ params, query, set }) => {
    if (!isValidOrderSn(params.orderSn)) {
      set.status = 400;
      return { success: false, error: "Order SN tidak valid" };
    }

    const refresh = query.refresh === "1" || query.refresh === "true";
    const result = await getOrderDetail(params.orderSn, { refresh });

    switch (result.kind) {
      case "ok":
        return { success: true, data: result.data };

      case "not_found":
        set.status = 404;
        return { success: false, error: "Order tidak ditemukan" };

      case "marketplace_unsupported":
        set.status = 501;
        return { success: false, error: "Marketplace belum didukung" };

      case "timeout":
        set.status = 504;
        return { success: false, error: "Permintaan ke Shopee timeout" };

      case "upstream_error":
        set.status = 502;
        return { success: false, error: result.message };
    }
  }
);
