/**
 * Platform portal audit routes (Super Admin) — prefix /platform.
 *
 *   GET  /platform/audit          -> list audit log (filter + pagination)
 *   GET  /platform/audit/actions  -> list distinct action buat dropdown
 *
 * READ-ONLY: gak ada POST/PUT/DELETE (audit_log append-only).
 * Guard di-copy persis dari platform-coupons.route.ts.
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { listAuditLogs, listAuditActions } from './platform-audit.service';

/** Tenant session cookie name — mirror dari auth.middleware. */
const TENANT_COOKIE_NAME = 'wms_session';

// ── helpers ───────────────────────────────────────────────────────

function parseIntOpt(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDateOpt(val: string | undefined): Date | undefined {
  if (!val) return undefined;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

// ── routes ────────────────────────────────────────────────────────

export const platformAuditRoutes = new Elysia({ prefix: '/platform' })
  .derive(async ({ cookie, set }) => {
    const sessionCookie = cookie[PLATFORM_COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const admin = await platformMe({ cookieValue, now: new Date() });

    if (!admin) {
      const tenantCookie = cookie[TENANT_COOKIE_NAME];
      const tenantCookieValue =
        tenantCookie && typeof tenantCookie.value === 'string' && tenantCookie.value !== ''
          ? tenantCookie.value
          : undefined;
      const wrongScope = await hasValidTenantScope(tenantCookieValue);

      set.headers['Set-Cookie'] = buildPlatformClearCookie();
      set.status = wrongScope ? 403 : 401;
      return {
        platformAdmin: null as unknown as { id: number; email: string; name: string },
        platformAuthError: (wrongScope ? 'wrong_scope' : 'unauthorized') as
          | 'wrong_scope'
          | 'unauthorized',
      };
    }

    return { platformAdmin: admin, platformAuthError: undefined };
  })
  .onBeforeHandle(({ platformAdmin, platformAuthError, set }) => {
    if (!platformAdmin) {
      if (!set.status || set.status === 200) {
        set.status = 401;
      }
      if (platformAuthError === 'wrong_scope') {
        return {
          ok: false,
          error: 'wrong_scope',
          message:
            'This session belongs to the app and cannot access the Super Admin portal.',
        };
      }
      return { ok: false, error: 'unauthorized', message: 'A valid platform session is required.' };
    }
  })

  // GET /platform/audit — list audit log
  .get('/audit', async ({ query, set }) => {

    const page = parseIntOpt(query.page);
    const companyId = parseIntOpt(query.company_id);
    const action = query.action?.trim() || undefined;

    // Parse & validate dates
    const dateFromRaw = query.date_from;
    const dateToRaw = query.date_to;

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (dateFromRaw) {
      dateFrom = parseDateOpt(dateFromRaw);
      if (!dateFrom) {
        set.status = 400;
        return { ok: false, error: 'invalid_date', message: 'date_from tidak valid.' };
      }
    }

    if (dateToRaw) {
      dateTo = parseDateOpt(dateToRaw);
      if (!dateTo) {
        set.status = 400;
        return { ok: false, error: 'invalid_date', message: 'date_to tidak valid.' };
      }
      // Set ke akhir hari (23:59:59.999) biar inklusif
      dateTo.setHours(23, 59, 59, 999);
    }

    const result = await listAuditLogs({
      page,
      companyId,
      action,
      dateFrom,
      dateTo,
    });

    return {
      ok: true,
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  })

  // GET /platform/audit/actions — distinct action
  .get('/audit/actions', async ({ set }) => {

    const actions = await listAuditActions();

    return {
      ok: true,
      actions,
    };
  });
