/**
 * Master Packing Cost Routes
 *
 * Defines Elysia routes for Master Packing Cost entry management:
 *   POST   /master-packing-cost/master-products/:masterProductId/entries  → createMasterPackingCost
 *   PUT    /master-packing-cost/entries/:id                               → updateMasterPackingCost
 *   DELETE /master-packing-cost/entries/:id                               → deleteMasterPackingCost
 *   GET    /master-packing-cost/master-products/:masterProductId/history  → getMasterPackingCostHistory
 *   GET    /master-packing-cost/master-products/:masterProductId/resolve  → resolveMasterPackingCost
 *
 * Auth: the editor recorded in the audit log is derived from the authenticated
 * session (ctx.user, populated by the global auth middleware) via
 * resolveAuditActor(). We store a human-readable label (name -> email -> id) so
 * the history answers "who edited". The legacy x-user-id header is kept only as
 * a secondary fallback for non-browser callers, and "system" is the last
 * resort. The userId field in the request body is ignored.
 *
 * Requirements: 14.1–14.12
 */

import { Elysia, t } from "elysia";
import {
  createMasterPackingCost,
  deleteMasterPackingCost,
  getMasterPackingCostHistory,
  resolveMasterPackingCost,
  updateMasterPackingCost,
} from "./master-packing-cost.service";
import { resolveAuditActor, type AuditActor } from "../../../utils/audit-actor";
import { authMiddleware } from "../../auth/auth.middleware";

// ─── Helper: map ServiceResult errors to HTTP status codes ────────────────

function mapErrorStatus(message: string): number {
  if (message.includes("not found")) return 404;
  // Req 14.7: validation errors and overlap failures → 400
  return 400;
}

// ─── Routes ────────────────────────────────────────────────

export const masterPackingCostRoutes = new Elysia({ prefix: "/master-packing-cost" })
  .use(authMiddleware)

  // ─── POST /master-packing-cost/master-products/:masterProductId/entries ───
  .post(
    "/master-products/:masterProductId/entries",
    async (ctx) => {
      const { params, body, headers, set, user } = ctx;
      const userId = resolveAuditActor(
        user,
        headers as Record<string, string | undefined>,
      );

      const masterProductId = Number(params.masterProductId);
      if (!Number.isFinite(masterProductId) || masterProductId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid masterProductId" };
      }

      // Req 14.11: userId derived from the authenticated session, body.userId ignored
      const result = await createMasterPackingCost({
        companyId: user.companyId,
        masterProductId,
        packingCost: body.packingCost,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        note: body.note ?? null,
        userId,
      });

      if (!result.success) {
        // Req 14.7: validation/overlap → 400
        set.status = mapErrorStatus(result.message);
        return result;
      }

      // Req 14.9: create success → 201
      set.status = 201;
      return result;
    },
    {
      params: t.Object({ masterProductId: t.String() }),
      body: t.Object({
        packingCost: t.Number({ minimum: 0, maximum: 999_999_999 }),
        startDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
        endDate: t.Optional(t.Nullable(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))),
        note: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  )

  // ─── PUT /master-packing-cost/entries/:id ─────────────────────────
  .put(
    "/entries/:id",
    async (ctx) => {
      const { params, body, headers, set, user } = ctx;
      const userId = resolveAuditActor(
        user,
        headers as Record<string, string | undefined>,
      );

      const id = Number(params.id);
      if (!Number.isFinite(id) || id <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid entry id" };
      }

      // Req 14.11: userId derived from the authenticated session, body.userId ignored
      const result = await updateMasterPackingCost({
        id,
        companyId: user.companyId,
        packingCost: body.packingCost,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        note: body.note ?? null,
        userId,
      });

      if (!result.success) {
        // Req 14.7: validation/overlap → 400; Req 14.8: not-found → 404
        set.status = mapErrorStatus(result.message);
        return result;
      }

      // Req 14.10: update success → 200
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

  // ─── DELETE /master-packing-cost/entries/:id ───────────────────────
  .delete(
    "/entries/:id",
    async (ctx) => {
      const { params, headers, set, user } = ctx;
      const userId = resolveAuditActor(
        user,
        headers as Record<string, string | undefined>,
      );

      const id = Number(params.id);
      if (!Number.isFinite(id) || id <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid entry id" };
      }

      const result = await deleteMasterPackingCost(id, userId, user.companyId);

      if (!result.success) {
        // Req 14.8: not-found → 404
        set.status = mapErrorStatus(result.message);
        return result;
      }

      // Req 14.10: delete success → 200
      return result;
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  // ─── GET /master-packing-cost/master-products/:masterProductId/history ────
  .get(
    "/master-products/:masterProductId/history",
    async (ctx) => {
      const { params, set, user } = ctx;
      const masterProductId = Number(params.masterProductId);
      if (!Number.isFinite(masterProductId) || masterProductId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid masterProductId" };
      }

      const result = await getMasterPackingCostHistory(masterProductId, user.companyId);

      if (!result.success) {
        // Req 14.8: not-found → 404
        set.status = mapErrorStatus(result.message);
        return result;
      }

      // Req 14.10: history success → 200
      return result;
    },
    {
      params: t.Object({ masterProductId: t.String() }),
    },
  )

  // ─── GET /master-packing-cost/master-products/:masterProductId/resolve ────
  .get(
    "/master-products/:masterProductId/resolve",
    async (ctx) => {
      const { params, query, set, user } = ctx;
      const masterProductId = Number(params.masterProductId);
      if (!Number.isFinite(masterProductId) || masterProductId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid masterProductId" };
      }

      // Req 14.6: query date missing or invalid format → 400 before calling service
      const dateParam = query.date;
      if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        set.status = 400;
        return {
          success: false,
          message: "Query parameter 'date' is required and must be in YYYY-MM-DD format",
        };
      }

      const result = await resolveMasterPackingCost(masterProductId, dateParam, user.companyId);

      if (!result.success) {
        set.status = mapErrorStatus(result.message);
        return result;
      }

      // Req 14.10: resolve success → 200
      return result;
    },
    {
      params: t.Object({ masterProductId: t.String() }),
      query: t.Object({
        date: t.Optional(t.String()),
      }),
    },
  );
