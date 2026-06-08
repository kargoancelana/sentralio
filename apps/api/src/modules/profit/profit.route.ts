/**
 * Profit Analytics Routes
 *
 * Defines Elysia routes for profit analytics:
 *   GET /profit/summary    → getProfitSummary
 *   GET /profit/orders     → getOrderProfitList
 *   GET /profit/products   → getProductPerformance
 *   GET /profit/deductions → getShopeeDeductions
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { Elysia, t } from "elysia";
import {
  getProfitSummary,
  getOrderProfitList,
  getProductPerformance,
  getShopeeDeductions,
} from "./profit.service";

// ─── Validation Helpers ───────────────────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates common date range params (start_date, end_date).
 * Returns an error message string if invalid, or null if valid.
 */
function validateDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
): string | null {
  if (!startDate || !endDate) {
    return "Parameter start_date dan end_date wajib diisi";
  }
  if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
    return "Format tanggal tidak valid. Gunakan YYYY-MM-DD";
  }
  if (startDate > endDate) {
    return "Tanggal mulai tidak boleh setelah tanggal akhir";
  }
  return null;
}

/**
 * Validates an optional shop_id query param.
 * Returns an error message string if invalid, or null if valid.
 * Returns the parsed numeric value via out-param.
 */
function validateShopId(
  shopIdStr: string | undefined,
): { error: string | null; value: number | undefined } {
  if (!shopIdStr) return { error: null, value: undefined };
  const num = Number(shopIdStr);
  if (!Number.isInteger(num) || num <= 0 || !/^\d+$/.test(shopIdStr)) {
    return { error: "Shop ID tidak valid", value: undefined };
  }
  return { error: null, value: num };
}

/**
 * Validates optional pagination params (page, limit).
 * Returns an error message string if invalid, or null if valid.
 */
function validatePagination(
  pageStr: string | undefined,
  limitStr: string | undefined,
): { error: string | null; page: number; limit: number } {
  const page = pageStr !== undefined ? Number(pageStr) : 1;
  const limit = limitStr !== undefined ? Number(limitStr) : 20;

  if (
    !Number.isInteger(page) || page < 1 ||
    !Number.isInteger(limit) || limit < 1
  ) {
    return { error: "Parameter pagination tidak valid", page: 1, limit: 20 };
  }
  return { error: null, page, limit };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const profitRoutes = new Elysia({ prefix: "/profit" })

  // ─── GET /profit/summary ──────────────────────────────────────────────────
  .get(
    "/summary",
    async ({ query, set }) => {
      console.log("[profit/summary] Handler called");
      try {
        const dateError = validateDateRange(query.start_date, query.end_date);
        if (dateError) {
          set.status = 400;
          return { success: false, message: dateError };
        }

        const { error: shopError, value: shopId } = validateShopId(query.shop_id);
        if (shopError) {
          set.status = 400;
          return { success: false, message: shopError };
        }

        return await getProfitSummary({
          startDate: query.start_date!,
          endDate: query.end_date!,
          shopId,
        });
      } catch (err: any) {
        console.error("[profit/summary] Error:", err?.message || err);
        set.status = 500;
        return { success: false, message: "Terjadi kesalahan pada server" };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        shop_id: t.Optional(t.String()),
      }),
    },
  )

  // ─── GET /profit/orders ───────────────────────────────────────────────────
  .get(
    "/orders",
    async ({ query, set }) => {
      try {
        const dateError = validateDateRange(query.start_date, query.end_date);
        if (dateError) {
          set.status = 400;
          return { success: false, message: dateError };
        }

        const { error: shopError, value: shopId } = validateShopId(query.shop_id);
        if (shopError) {
          set.status = 400;
          return { success: false, message: shopError };
        }

        const { error: pageError, page, limit } = validatePagination(query.page, query.limit);
        if (pageError) {
          set.status = 400;
          return { success: false, message: pageError };
        }

        return await getOrderProfitList({
          startDate: query.start_date!,
          endDate: query.end_date!,
          shopId,
          page,
          limit,
        });
      } catch (err) {
        set.status = 500;
        return { success: false, message: "Terjadi kesalahan pada server" };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        shop_id: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )

  // ─── GET /profit/products ─────────────────────────────────────────────────
  .get(
    "/products",
    async ({ query, set }) => {
      try {
        const dateError = validateDateRange(query.start_date, query.end_date);
        if (dateError) {
          set.status = 400;
          return { success: false, message: dateError };
        }

        const { error: shopError, value: shopId } = validateShopId(query.shop_id);
        if (shopError) {
          set.status = 400;
          return { success: false, message: shopError };
        }

        const validGroupBy = ["msku", "product_group", "variation"] as const;
        if (query.group_by !== undefined && !validGroupBy.includes(query.group_by as typeof validGroupBy[number])) {
          set.status = 400;
          return { success: false, message: "Parameter group_by tidak valid" };
        }

        const validSortBy = ["netProfit", "profitMarginPercent", "qtySold"] as const;
        if (query.sort_by !== undefined && !validSortBy.includes(query.sort_by as typeof validSortBy[number])) {
          set.status = 400;
          return { success: false, message: "Parameter sort_by tidak valid" };
        }

        return await getProductPerformance({
          startDate: query.start_date!,
          endDate: query.end_date!,
          shopId,
          groupBy: (query.group_by as typeof validGroupBy[number]) ?? "msku",
          sortBy: query.sort_by,
        });
      } catch (err) {
        set.status = 500;
        return { success: false, message: "Terjadi kesalahan pada server" };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        shop_id: t.Optional(t.String()),
        group_by: t.Optional(t.String()),
        sort_by: t.Optional(t.String()),
      }),
    },
  )

  // ─── GET /profit/deductions ───────────────────────────────────────────────
  .get(
    "/deductions",
    async ({ query, set }) => {
      try {
        const dateError = validateDateRange(query.start_date, query.end_date);
        if (dateError) {
          set.status = 400;
          return { success: false, message: dateError };
        }

        const { error: shopError, value: shopId } = validateShopId(query.shop_id);
        if (shopError) {
          set.status = 400;
          return { success: false, message: shopError };
        }

        return await getShopeeDeductions({
          startDate: query.start_date!,
          endDate: query.end_date!,
          shopId,
        });
      } catch (err) {
        set.status = 500;
        return { success: false, message: "Terjadi kesalahan pada server" };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        shop_id: t.Optional(t.String()),
      }),
    },
  );
