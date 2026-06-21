import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { createResetToken } from '../auth/password-reset.service';

/** Tenant session cookie name — mirror of auth.middleware's local constant. */
const TENANT_COOKIE_NAME = 'wms_session';

export const platformUsersRoutes = new Elysia({ prefix: '/api/platform' })
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
  .post('/companies/:companyId/users/:userId/reset-password', async ({ params, platformAdmin, set }) => {
    const companyId = Number(params.companyId);
    const userId = Number(params.userId);

    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(userId) || userId <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const result = await createResetToken({
      userId,
      companyId,
      adminId: platformAdmin.id,
      now: Date.now(),
    });

    switch (result.kind) {
      case 'not-found':
        set.status = 404;
        return { ok: false, error: 'not_found' };
      case 'ok':
        set.status = 200;
        return {
          ok: true,
          resetUrl: result.resetUrl,
          expiresAt: result.expiresAt,
        };
    }
  });
