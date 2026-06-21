/**
 * Platform portal companies routes (Super Admin) — prefix /platform.
 *
 *   GET /platform/companies       -> list semua company + ringkasan
 *   GET /platform/companies/:id   -> detail company + user & toko (read-only)
 *
 * Guard (derive + onBeforeHandle LOCAL-scope) di-mirror dari
 * platform-auth.route.ts: hanya sesi platform (scope:'platform') yang boleh;
 * token tenant -> 403; tanpa sesi -> 401. Mount SEBELUM origin/auth middleware
 * tenant di index.ts.
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { listCompanies, getCompanyDetail } from './platform-companies.service';

/** Tenant session cookie name — mirror of auth.middleware's local constant. */
const TENANT_COOKIE_NAME = 'wms_session';

export const platformCompaniesRoutes = new Elysia({ prefix: '/platform' })
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
  .get('/companies', async ({ set }) => {
    const data = await listCompanies();
    set.status = 200;
    return { ok: true, companies: data };
  })
  .get('/companies/:id', async ({ params, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const detail = await getCompanyDetail(id);
    if (!detail) {
      set.status = 404;
      return { ok: false, error: 'not_found' };
    }

    set.status = 200;
    return { ok: true, company: detail };
  });
