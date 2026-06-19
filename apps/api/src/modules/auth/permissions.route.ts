/**
 * Staff permissions routes — admin-only configuration of staff feature access.
 *
 *   GET /auth/permissions  → list configurable features with current enabled state
 *   PUT /auth/permissions  → update toggles (admin only)
 *
 * Both require the `user_management` feature (admin only), reusing the existing
 * authorization so only admins can change what staff can see/do.
 */

import { Elysia } from 'elysia';
import { authMiddleware } from './auth.middleware';
import {
  getStaffPermissions,
  setStaffPermissions,
  CONFIGURABLE_STAFF_FEATURES,
} from './permissions.service';

export const permissionsRoutes = new Elysia({ prefix: '/auth' })
  .use(authMiddleware)

  .get('/permissions', async ({ user, requireFeature, set }) => {
    requireFeature('user_management');
    const permissions = await getStaffPermissions(user.companyId);
    set.status = 200;
    return { ok: true, permissions };
  })

  .put('/permissions', async ({ user, body, requireFeature, set }) => {
    requireFeature('user_management');

    const b = (body ?? {}) as { permissions?: unknown };
    if (!Array.isArray(b.permissions)) {
      set.status = 400;
      return { ok: false, error: 'invalid_body', message: 'permissions array required' };
    }

    // Sanitize: accept only known configurable features with boolean enabled.
    const updates = b.permissions
      .filter(
        (p): p is { feature: string; enabled: boolean } =>
          !!p &&
          typeof (p as any).feature === 'string' &&
          typeof (p as any).enabled === 'boolean' &&
          (CONFIGURABLE_STAFF_FEATURES as readonly string[]).includes((p as any).feature),
      )
      .map((p) => ({ feature: p.feature, enabled: p.enabled }));

    await setStaffPermissions(user.companyId, updates);
    const permissions = await getStaffPermissions(user.companyId);
    set.status = 200;
    return { ok: true, permissions };
  });
