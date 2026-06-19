import Elysia, { t } from 'elysia';
import { getStaffPermissions, setStaffPermissions } from './permissions.service';
import { authMiddleware } from './auth.middleware';
import { featureGuardMiddleware } from './feature-guard.middleware';

export const permissionsRoute = new Elysia({ prefix: '/auth' })
  .use(authMiddleware)
  .use(featureGuardMiddleware)
  .get(
    '/permissions',
    async ({ user, requireFeature, set }) => {
      requireFeature('user_management');
      const permissions = await getStaffPermissions(user.companyId);
      set.status = 200;
      return { ok: true, permissions };
    },
    {
      detail: { summary: "Get staff permissions for the caller's company" },
    },
  )
  .put(
    '/permissions',
    async ({ user, body, requireFeature, set }) => {
      requireFeature('user_management');
      const updates = body.permissions;
      await setStaffPermissions(user.companyId, updates);
      const permissions = await getStaffPermissions(user.companyId);
      set.status = 200;
      return { ok: true, permissions };
    },
    {
      body: t.Object({
        permissions: t.Array(
          t.Object({
            feature: t.String({ minLength: 1 }),
            enabled: t.Boolean(),
          }),
        ),
      }),
      detail: { summary: "Update staff permissions for the caller's company" },
    },
  );
