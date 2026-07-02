/**
 * Platform_Impersonation_Routes (Fase 7.1) — Super Admin impersonation endpoints.
 *
 * POST /platform/companies/:id/users/:userId/impersonate → mulai impersonation
 * POST /platform/impersonation/stop                      → balik ke portal
 *
 * Guard: platform_session (PERSIS sama dengan platform-users.route.ts).
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { logAudit, extractAuditIp } from './audit-log.service';
import { startImpersonation, stopImpersonation } from './impersonation.service';

/** Tenant session cookie name — mirror dari auth.middleware's constant. */
const TENANT_COOKIE_NAME = 'wms_session';

export const platformImpersonationRoutes = new Elysia({ prefix: '/platform' })
  .derive(async ({ cookie, set }) => {
    const sessionCookie = cookie[PLATFORM_COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const admin = await platformMe({ cookieValue, now: new Date() });

    if (!admin) {
      // Cek apakah ada tenant session (wrong scope = 403, otherwise 401).
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
      return {
        ok: false,
        error: 'unauthorized',
        message: 'A valid platform session is required.',
      };
    }
  })
  .post(
    '/companies/:id/users/:userId/impersonate',
    async ({ params, platformAdmin, set, request, server }) => {
      const companyId = Number(params.id);
      const userId = Number(params.userId);

      if (
        !Number.isInteger(companyId) ||
        companyId <= 0 ||
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        set.status = 400;
        return { ok: false, error: 'invalid_id' };
      }

      const r = await startImpersonation({
        adminId: platformAdmin.id,
        companyId,
        userId,
        now: new Date(),
      });

      if (r.kind === 'not-found') {
        set.status = 404;
        return { ok: false, error: 'not_found' };
      }

      // Set tenant session cookie (impersonation token).
      set.headers['Set-Cookie'] = r.cookie;

      // Audit log: mulai impersonation.
      await logAudit({
        actorType: 'platform',
        actorId: platformAdmin.id,
        companyId,
        action: 'platform.user.impersonate.start',
        targetType: 'user',
        targetId: userId,
        ip: extractAuditIp(request, server as Parameters<typeof extractAuditIp>[1]),
      });

      return { ok: true };
    },
  )
  .post('/impersonation/stop', async ({ platformAdmin, cookie, set, request, server }) => {
    const c = cookie[TENANT_COOKIE_NAME];
    const cookieValue =
      c && typeof c.value === 'string' && c.value !== '' ? c.value : undefined;

    const r = await stopImpersonation({ cookieValue, now: new Date() });

    // Clear tenant session cookie.
    set.headers['Set-Cookie'] = r.clearCookie;

    // Audit log: stop impersonation (hanya jika token valid + ber-imp).
    if (r.stopped) {
      await logAudit({
        actorType: 'platform',
        actorId: platformAdmin.id,
        action: 'platform.user.impersonate.stop',
        targetType: 'user',
        targetId: r.stopped.userId,
        ip: extractAuditIp(request, server as Parameters<typeof extractAuditIp>[1]),
      });
    }

    return { ok: true };
  });
