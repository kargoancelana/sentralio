/**
 * HPP (Harga Pokok Penjualan) Routes
 *
 * Defines Elysia routes for HPP entry management:
 *   POST   /hpp/entries                          → createHppEntry
 *   PUT    /hpp/entries/:id                      → updateHppEntry
 *   DELETE /hpp/entries/:id                      → deleteHppEntry
 *   GET    /hpp/variants/:variantId/history      → getHppHistory
 *   GET    /hpp/variants/:variantId/resolve      → resolveHpp
 *
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1
 */

import { Elysia, t } from "elysia";
import {
  createHppEntry,
  deleteHppEntry,
  getHppHistory,
  resolveHpp,
  updateHppEntry,
} from "./hpp.service";

// ─── Helper: map ServiceResult errors to HTTP status codes ────────────────────

function mapErrorStatus(message: string): number {
  if (message.includes("not found")) return 404;
  if (message.includes("overlaps") || message.includes("start date must be after")) return 409;
  return 400;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const hppRoutes = new Elysia({ prefix: "/hpp" })

  // ─── POST /hpp/entries ─────────────────────────────────────────────────────
  .post(
    "/entries",
    async ({ body, headers, set }) => {
      const userId = (headers["x-user-id"] as string | undefined) ?? "system";

      const result = await createHppEntry({
        variantId: body.variantId,
        hppValue: body.hppValue,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        note: body.note ?? null,
        userId,
      });

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      set.status = 201;
      return result;
    },
    {
      body: t.Object({
        variantId: t.Number({ minimum: 1 }),
        hppValue: t.Number({ minimum: 1, maximum: 999_999_999 }),
        startDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
        endDate: t.Optional(t.Nullable(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  )

  // ─── PUT /hpp/entries/:id ──────────────────────────────────────────────────
  .put(
    "/entries/:id",
    async ({ params, body, headers, set }) => {
      const id = Number(params.id);
      if (!Number.isFinite(id) || id <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid entry id" };
      }

      const userId = (headers["x-user-id"] as string | undefined) ?? "system";

      const result = await updateHppEntry({
        id,
        hppValue: body.hppValue,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        note: body.note ?? null,
        userId,
      });

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      return result;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        hppValue: t.Number({ minimum: 1, maximum: 999_999_999 }),
        startDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
        endDate: t.Optional(t.Nullable(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  )

  // ─── DELETE /hpp/entries/:id ───────────────────────────────────────────────
  .delete(
    "/entries/:id",
    async ({ params, headers, set }) => {
      const id = Number(params.id);
      if (!Number.isFinite(id) || id <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid entry id" };
      }

      const userId = (headers["x-user-id"] as string | undefined) ?? "system";

      const result = await deleteHppEntry(id, userId);

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      return result;
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  // ─── GET /hpp/variants/:variantId/history ──────────────────────────────────
  .get(
    "/variants/:variantId/history",
    async ({ params, set }) => {
      const variantId = Number(params.variantId);
      if (!Number.isFinite(variantId) || variantId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid variant id" };
      }

      const result = await getHppHistory(variantId);

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      return result;
    },
    {
      params: t.Object({ variantId: t.String() }),
    },
  )

  // ─── GET /hpp/variants/:variantId/resolve ──────────────────────────────────
  .get(
    "/variants/:variantId/resolve",
    async ({ params, query, set }) => {
      const variantId = Number(params.variantId);
      if (!Number.isFinite(variantId) || variantId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid variant id" };
      }

      // Default to today if no date provided
      const targetDate = query.date ?? new Date().toISOString().slice(0, 10);

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        set.status = 400;
        return { success: false, message: "Date must be in YYYY-MM-DD format", field: "date" };
      }

      const result = await resolveHpp(variantId, targetDate);

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      return result;
    },
    {
      params: t.Object({ variantId: t.String() }),
      query: t.Object({
        date: t.Optional(t.String()),
      }),
    },
  );
