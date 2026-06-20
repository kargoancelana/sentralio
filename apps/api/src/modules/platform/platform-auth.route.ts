/**
 * Platform portal auth routes (Super Admin) — prefix /api/platform/auth.
 *
 *   POST /api/platform/auth/login   (public)
 *   GET  /api/platform/auth/me      (butuh platform_session)
 *   POST /api/platform/auth/logout  (butuh platform_session; stateless clear)
 *
 * Routes terlindungi pakai derive + onBeforeHandle LOCAL-scope (default) di
 * instance ini sendiri, jadi TIDAK bocor ke route tenant. Mount kedua instance
 * SEBELUM origin/auth middleware tenant di index.ts.
 */

import { Elysia } from 'elysia';
import { platformLogin, platformMe, type PlatformLoginResult } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';

/** Ambil IP client terbaik dari context Elysia (sama dgn auth tenant). */
function extractIp(request: Request, server: { requestIP?: (req: Request) => { address: string } | null } | null): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  if (server?.requestIP) {
    const addr = server.requestIP(request);
    if (addr?.address) return addr.address;
  }

  return '0.0.0.0';
}

// ── Public (tanpa middleware) ─────────────────────────────────
export const platformAuthPublicRoutes = new Elysia({ prefix: '/api/platform/auth' })
  .post('/login', async ({ request, body, set, server }) => {
    const ip = extractIp(request, server as Parameters<typeof extractIp>[1]);

    const result: PlatformLoginResult = await platformLogin({
      rawBody: body,
      ip,
      now: new Date(),
    });

    switch (result.kind) {
      case 'ok':
        set.status = 200;
        set.headers['Set-Cookie'] = result.cookie;
        return {
          ok: true,
          admin: {
            id: result.admin.id,
            email: result.admin.email,
            name: result.admin.name,
          },
        };
      case 'fail-401':
        set.status = 401;
        return { ok: false, error: 'invalid_credentials' };
      case 'fail-429':
        set.status = 429;
        return { ok: false, error: 'account_locked' };
      case 'fail-400':
        set.status = 400;
        return { ok: false, error: result.reason };
      case 'fail-500':
        set.status = 500;
        return { ok: false, error: 'internal_error' };
    }
  });

// ── Protected (butuh platform_session) ────────────────────────
export const platformAuthProtectedRoutes = new Elysia({ prefix: '/api/platform/auth' })
  .derive(async ({ cookie, set }) => {
    const sessionCookie = cookie[PLATFORM_COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const admin = await platformMe({ cookieValue, now: new Date() });

    if (!admin) {
      set.headers['Set-Cookie'] = buildPlatformClearCookie();
      set.status = 401;
      return { platformAdmin: null as unknown as { id: number; email: string; name: string } };
    }

    return { platformAdmin: admin };
  })
  .onBeforeHandle(({ platformAdmin, set }) => {
    if (!platformAdmin) {
      if (!set.status || set.status === 200) {
        set.status = 401;
      }
      return { ok: false, error: 'unauthorized', message: 'A valid platform session is required.' };
    }
  })
  .get('/me', ({ platformAdmin, set }) => {
    set.status = 200;
    return {
      id: platformAdmin.id,
      email: platformAdmin.email,
      name: platformAdmin.name,
    };
  })
  .post('/logout', ({ set }) => {
    set.status = 200;
    set.headers['Set-Cookie'] = buildPlatformClearCookie();
    return { ok: true };
  });
