import { Elysia, t } from 'elysia';
import { verifyResetToken, completeReset } from './password-reset.service';

export const passwordResetPublicRoutes = new Elysia({ prefix: '/auth' })
  .post(
    '/reset-password/verify',
    async ({ body, set }) => {
      const result = await verifyResetToken({
        token: body.token,
        now: Date.now(),
      });
      set.status = 200;
      return { ok: true, valid: result.valid };
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  )
  .post(
    '/reset-password/complete',
    async ({ body, set }) => {
      const result = await completeReset({
        token: body.token,
        newPassword: body.newPassword,
        now: Date.now(),
      });

      switch (result.kind) {
        case 'ok':
          set.status = 200;
          return { ok: true };
        case 'invalid-token':
          set.status = 400;
          return { ok: false, error: 'invalid_or_expired_token' };
        case 'validation':
          set.status = 400;
          return { ok: false, error: 'validation', message: result.message };
      }
    },
    {
      body: t.Object({
        token: t.String(),
        newPassword: t.String(),
      }),
    },
  );
