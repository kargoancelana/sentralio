/**
 * Biaya Packing (Packing Cost) Routes
 *
 * Defines Elysia routes for Biaya Packing entry management:
 *   POST   /packing-cost/entries                              → createPackingCostEntry
 *   PUT    /packing-cost/entries/:id                         → updatePackingCostEntry
 *   DELETE /packing-cost/entries/:id                         → deletePackingCostEntry
 *   GET    /packing-cost/product-groups/:groupId/history     → getPackingCostHistory
 *   GET    /packing-cost/product-groups/:groupId/resolve     → resolvePackingCost
 *
 * Auth: the editor recorded in the audit log is derived from the authenticated
 * session (ctx.user, populated by the global auth middleware) via
 * resolveAuditActor(). The legacy x-user-id header is only a secondary fallback.
 *
 * Requirements: 6.1, 7.1, 8.1, 9.1, 10.1
 */

import { Elysia, t } from "elysia";
import {
  createPackingCostEntry,
  deletePackingCostEntry,
  getPackingCostHistory,
  resolvePackingCost,
  updatePackingCostEntry,
} from "./packing-cost.service";
import { resolveAuditActor, type AuditActor } from "../../utils/audit-actor";

// ─── Helper: map ServiceResult errors to HTTP status codes ────────────────

function mapErrorStatus(message: string): number {
  if (message.includes("not found")) return 404;
  if (message.includes("overlaps") || message.includes("start date must be after")) return 409;
  return 400;
}

// ─── Routes ────────────────────────────────────────────────

export const packingCostRoutes = new Elysia({ prefix: "/packing-cost" })

  // ─── POST /packing-cost/entries ────────────────────────────────
  .post(
    "/entries",
    async (ctx) => {
      const { body, headers, set } = ctx;
      const userId = resolveAuditActor(
        (ctx as { user?: AuditActor }).user,
        headers as Record<string, string | undefined>,
      );

      const result = await createPackingCostEntry({
        productGroupId: body.productGroupId,
        packingCost: body.packingCost,
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
        productGroupId: t.Number({ minimum: 1 }),
        packingCost: t.Number({ minimum: 0, maximum: 999_999_999 }),
        startDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
        endDate: t.Optional(t.Nullable(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  )

  // ─── PUT /packing-cost/entries/:id ──────────────────────────────
  .put(
    "/entries/:id",
    async (ctx) => {
      const { params, body, headers, set } = ctx;
      const id = Number(params.id);
      if (!Number.isFinite(id) || id <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid entry id" };
      }

      const userId = resolveAuditActor(
        (ctx as { user?: AuditActor }).user,
        headers as Record<string, string | undefined>,
      );

      const result = await updatePackingCostEntry({
        id,
        packingCost: body.packingCost,
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
        packingCost: t.Number({ minimum: 0, maximum: 999_999_999 }),
        startDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
        endDate: t.Optional(t.Nullable(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  )

  // ─── DELETE /packing-cost/entries/:id ────────────────────────────
  .delete(
    "/entries/:id",
    async (ctx) => {
      const { params, headers, set } = ctx;
      const id = Number(params.id);
      if (!Number.isFinite(id) || id <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid entry id" };
      }

      const userId = resolveAuditActor(
        (ctx as { user?: AuditActor }).user,
        headers as Record<string, string | undefined>,
      );

      const result = await deletePackingCostEntry(id, userId);

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

  // ─── GET /packing-cost/product-groups/:groupId/history ────────────────
  .get(
    "/product-groups/:groupId/history",
    async ({ params, set }) => {
      const groupId = Number(params.groupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid product group id" };
      }

      const result = await getPackingCostHistory(groupId);

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      return result;
    },
    {
      params: t.Object({ groupId: t.String() }),
    },
  )

  // ─── GET /packing-cost/product-groups/:groupId/resolve ────────────────
  .get(
    "/product-groups/:groupId/resolve",
    async ({ params, query, set }) => {
      const groupId = Number(params.groupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid product group id" };
      }

      // Default to today if no date provided
      const targetDate = query.date ?? new Date().toISOString().slice(0, 10);

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        set.status = 400;
        return { success: false, message: "Date must be in YYYY-MM-DD format", field: "date" };
      }

      const result = await resolvePackingCost(groupId, targetDate);

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      return result;
    },
    {
      params: t.Object({ groupId: t.String() }),
      query: t.Object({
        date: t.Optional(t.String()),
      }),
    },
  );
