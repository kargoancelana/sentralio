/**
 * Auth routes — thin HTTP shim over Auth_Service.
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.9, 3.3, 3.5, 8.3, 10.4, 10.5
 *
 * Route → Service mapping:
 *   POST /auth/login   (public)          → authService.login
 *   POST /auth/logout  (requires session) → authService.logout
 *   GET  /auth/me      (requires session) → authService.me
 *   POST /auth/renew   (requires session) → authService.renew
 *
 * The route layer is intentionally thin: all business logic, lockout
 * enforcement, and session validation live in Auth_Service. This file only
 * maps LoginResult variants (and logout/me/renew results) to the correct HTTP
 * status codes, response bodies, and Set-Cookie headers.
 */

import { Elysia } from 'elysia';
import {
  login,
  logout,
  renew,
  changePassword,
  validateSession,
  type LoginResult,
} from './auth.service';
import { authMiddleware } from './auth.middleware';
import { buildClearCookie } from './cookie';
import { FEATURES } from './matrix';
import { decide } from './matrix';
import { registerCompany } from './register.service';

const COOKIE_NAME = 'wms_session';

/** Extract the best available client IP from an Elysia request context. */
function extractIp(request: Request, server: { requestIP?: (req: Request) => { address: string } | null } | null): string {
  // 1. X-Forwarded-For (first entry when behind a trusted proxy)
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }

  // 2. X-Real-IP
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  // 3. Bun server socket
  if (server?.requestIP) {
    const addr = server.requestIP(request);
    if (addr?.address) return addr.address;
  }

  return '0.0.0.0';
}

// ───────────────────────────────────────────────────────────────────────────
// Public routes (no auth middleware)
// ───────────────────────────────────────────────────────────────────────────

export const authPublicRoutes = new Elysia({ prefix: '/auth' })
  /**
   * POST /auth/login
   *
   * Public — no auth middleware. Accepts any body; Auth_Service handles all
   * structural validation. Returns 200/400/401/429/500 per the LoginResult
   * variant. On 200 sets the session cookie. On any failure no cookie is set
   * and the response is constructed via the service's unified builder to
   * guarantee byte-identical 401s across the three failure cases (Req 1.4).
   */
  .post('/login', async ({ request, body, set, server }) => {
    const ip = extractIp(request, server as Parameters<typeof extractIp>[1]);

    const result: LoginResult = await login({
      rawBody: body,
      ip,
      now: new Date(),
    });

    switch (result.kind) {
      case 'ok':
        // 200 + Set-Cookie (Req 1.3)
        set.status = 200;
        set.headers['Set-Cookie'] = result.cookie;
        return {
          ok: true,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
            features: FEATURES.filter((f) => decide(result.user.role, f, result.user.companyId)),
          },
        };

      case 'fail-401':
        // Unified 401: byte-identical across unknown-email / wrong-password /
        // inactive-user cases. No Set-Cookie (Req 1.4).
        set.status = 401;
        return { ok: false, error: 'invalid_credentials' };

      case 'fail-429':
        // Account locked (Req 8.3)
        set.status = 429;
        return { ok: false, error: 'account_locked' };

      case 'fail-400':
        // Pre-credential structural validation failure (Req 1.5, 1.6)
        set.status = 400;
        return { ok: false, error: result.reason };

      case 'fail-500':
        // Internal error during session issuance — NO cookie (Req 1.9)
        set.status = 500;
        return { ok: false, error: 'internal_error' };
    }
  })

  /**
   * POST /auth/register
   *
   * Public self-service registration (Fase 4.2a). Bikin 1 company status
   * 'pending' + 1 admin user (is_active = 1). TIDAK auto-login dan TIDAK bikin
   * order/subscription — user login dulu, lalu submit order + upload bukti via
   * /subscription/orders*.
   * Body: { companyName, name, email, username?, password }.
   */
  .post('/register', async ({ body, set }) => {
    const b = (body ?? {}) as {
      companyName?: unknown;
      name?: unknown;
      email?: unknown;
      username?: unknown;
      password?: unknown;
    };

    const result = await registerCompany({
      companyName: b.companyName,
      name: b.name,
      email: b.email,
      username: b.username,
      password: b.password,
    });

    switch (result.kind) {
      case 'ok':
        set.status = 201;
        return { ok: true, companyId: result.companyId, slug: result.slug };
      case 'fail-validation':
        set.status = 400;
        return { ok: false, error: 'validation', field: result.field, message: result.message };
      case 'fail-email-taken':
        set.status = 409;
        return { ok: false, error: 'email_taken' };
      case 'fail-username-taken':
        set.status = 409;
        return { ok: false, error: 'username_taken' };
      case 'fail-500':
        set.status = 500;
        return { ok: false, error: 'internal_error' };
    }
  });

// ───────────────────────────────────────────────────────────────────────────
// Protected routes (require valid session via authMiddleware)
// ───────────────────────────────────────────────────────────────────────────

export const authProtectedRoutes = new Elysia({ prefix: '/auth' })
  .use(authMiddleware)
  /**
   * POST /auth/logout
   *
   * Requires a valid session (authMiddleware handles 401 when absent/invalid).
   * Calls authService.logout to insert the jti into revoked_sessions (Req 3.3).
   * On success clears the cookie. authMiddleware guarantees `user` is set here.
   */
  .post('/logout', async ({ cookie, set }) => {
    const sessionCookie = cookie[COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const result = await logout({ cookieValue, now: new Date() });

    if (result.ok) {
      // Success: clear the cookie (Req 3.5)
      set.status = 200;
      set.headers['Set-Cookie'] = buildClearCookie();
      return { ok: true };
    }

    // No valid session — authMiddleware should have caught this first, but
    // handle defensively (Req 3.5).
    set.status = 401;
    return { ok: false, error: 'unauthorized' };
  })

  /**
   * GET /auth/me
   *
   * Requires a valid session. Returns the public user profile.
   * authMiddleware already validated the session and set ctx.user; we re-call
   * authService.validateSession to get impersonatorId (Fase 7.1).
   */
  .get('/me', async ({ cookie, set }) => {
    const sessionCookie = cookie[COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const session = await validateSession({ cookieValue, now: new Date() });

    if (!session) {
      // authMiddleware guards this; this branch is purely defensive.
      set.status = 401;
      return { ok: false, error: 'unauthorized' };
    }

    set.status = 200;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      // Effective feature access for this user (admin = all; staff = configured).
      features: FEATURES.filter((f) => decide(session.user.role, f, session.user.companyId)),
      impersonating: session.impersonatorId != null,
      impersonatorId: session.impersonatorId ?? null,
    };
  })

  /**
   * POST /auth/renew
   *
   * Requires a valid session. Atomically rotates the JWT: revokes the old jti
   * and issues a new one with a fresh exp (Req 10.3, 10.4).
   * On null result (expired/invalid) authMiddleware already returned 401; this
   * branch is purely defensive (Req 10.5).
   */
  .post('/renew', async ({ cookie, set }) => {
    const sessionCookie = cookie[COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const result = await renew({ cookieValue, now: new Date() });

    if (!result) {
      // Expired or invalid session — authMiddleware should have blocked this,
      // but handle defensively (Req 10.5).
      set.status = 401;
      return { ok: false, error: 'unauthorized' };
    }

    // New session cookie replaces the old one (Req 10.4)
    set.status = 200;
    set.headers['Set-Cookie'] = result.cookie;
    return { ok: true };
  })

  /**
   * POST /auth/change-password
   *
   * Requires a valid session. Verifies the current password, updates to the new
   * password, revokes all OTHER sessions (bumps tokens_valid_from), and rotates
   * the current session so the caller stays logged in.
   */
  .post('/change-password', async ({ cookie, body, set }) => {
    const sessionCookie = cookie[COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const b = (body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };

    const result = await changePassword({
      cookieValue,
      currentPassword: b.currentPassword,
      newPassword: b.newPassword,
      now: new Date(),
    });

    switch (result.kind) {
      case 'ok':
        set.status = 200;
        set.headers['Set-Cookie'] = result.cookie;
        return { ok: true };
      case 'fail-401':
        set.status = 401;
        return { ok: false, error: 'unauthorized' };
      case 'fail-current':
        set.status = 400;
        return { ok: false, error: 'current_password_incorrect' };
      case 'fail-validation':
        set.status = 400;
        return { ok: false, error: 'validation', message: result.error };
      case 'fail-500':
        set.status = 500;
        return { ok: false, error: 'internal_error' };
    }
  });

/**
 * Combined export for convenience: callers that want both public and
 * protected auth routes can use this single plugin.
 *
 * Usage in index.ts:
 *   app.use(authRoutes)
 */
export const authRoutes = new Elysia()
  .use(authPublicRoutes)
  .use(authProtectedRoutes);
