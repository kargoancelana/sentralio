/**
 * Auth_Middleware — session validation and authorization enforcement.
 * Requirements: 2.6, 2.7, 4.3, 4.4, 5.3
 *
 * Implemented as an Elysia plugin using `.derive` to expose `ctx.user` and
 * `.beforeHandle` (via guard) to reject unauthenticated requests before
 * handlers are invoked.
 *
 * The plugin:
 *  1. Reads the `wms_session` cookie value.
 *  2. If missing → responds 401 + emits clear-cookie Set-Cookie header.
 *  3. Calls `validateSession({ cookieValue, now: new Date() })`.
 *  4. If null → responds 401 + emits clear-cookie Set-Cookie header.
 *  5. If valid → derives `ctx.user` = { id, role, name, email }.
 *  6. Exposes `requireFeature(feature: Feature): void` that throws/responds
 *     403 if `decide(ctx.user.role, feature)` is false.
 */

import { Elysia } from 'elysia';
import { validateSession, type PublicUser } from './auth.service';
import { decide, type Feature } from './matrix';
import { buildClearCookie } from './cookie';
import { hasValidPlatformScope } from './scope-guard';
import { PLATFORM_COOKIE_NAME } from '../platform/platform-cookie';

const COOKIE_NAME = 'wms_session';

/** Shape of the user object placed on the context by the auth middleware. */
export type AuthUser = PublicUser;

/**
 * Auth middleware plugin.
 *
 * Mount this AFTER public routes (login, health) and AFTER the origin middleware.
 * All routes that use `.use(authMiddleware)` (or are nested under it via
 * `.guard`) will have their requests validated.
 *
 * Usage in a route plugin:
 *   const protectedRoutes = new Elysia()
 *     .use(authMiddleware)
 *     .get('/me', ({ user }) => user)
 *
 * `requireFeature` usage inside a handler:
 *   .get('/admin', ({ user, requireFeature }) => {
 *     requireFeature('user_management');
 *     // ...
 *   })
 */
export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  // Derive adds user + requireFeature to the context; the beforeHandle guard
  // below ensures these are only reached when the session is valid.
  .derive({ as: 'global' }, async ({ request, cookie, set }) => {
    const sessionCookie = cookie[COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    // Validate the session (covers signature, exp, user existence, is_active,
    // and jti denylist per Req 2.6).
    const session = await validateSession({ cookieValue, now: new Date() });

    if (!session) {
      // Cross-scope guard (Fase 1.3): no valid tenant session, but the request
      // carries a correctly-signed PLATFORM token in the platform cookie → a
      // Super Admin hitting a tenant route. Respond 403 (authenticated, wrong
      // portal) instead of a generic 401. Pure crypto check — no DB lookup.
      const platformCookie = cookie[PLATFORM_COOKIE_NAME];
      const platformCookieValue =
        platformCookie && typeof platformCookie.value === 'string' && platformCookie.value !== ''
          ? platformCookie.value
          : undefined;
      const wrongScope = await hasValidPlatformScope(platformCookieValue);

      // Emit the clear-cookie header regardless of whether cookie was present
      // (Req 2.7).
      set.headers['Set-Cookie'] = buildClearCookie();
      set.status = wrongScope ? 403 : 401;
      // Return null-ish user; the beforeHandle hook below will short-circuit.
      return {
        user: null as unknown as AuthUser,
        authError: (wrongScope ? 'wrong_scope' : 'unauthorized') as
          | 'wrong_scope'
          | 'unauthorized',
        requireFeature: (_feature: Feature): void => {
          // no-op placeholder; beforeHandle stops execution before handlers run
        },
      };
    }

    const user: AuthUser = session.user;

    /**
     * Enforce the authorization matrix for a specific feature.
     *
     * Call this at the top of any route handler that requires a specific
     * feature-area permission. Responds 403 and throws to stop handler
     * execution if the user's role is denied.
     *
     * @param feature  The matrix feature key to check.
     * @throws         Throws an error so Elysia stops executing the handler.
     */
    function requireFeature(feature: Feature): void {
      if (!decide(user.role, feature, user.companyId)) {
        set.status = 403;
        throw new Error(
          `Forbidden: role '${user.role}' does not have access to feature '${feature}'.`,
        );
      }
    }

    return { user, authError: undefined, requireFeature };
  })
  // Guard: reject requests whose session failed validation before any handler
  // runs (Req 4.4). A correctly-signed platform token (wrong scope) yields 403.
  .onBeforeHandle({ as: 'global' }, ({ user, authError, set }) => {
    if (!user) {
      // Status and Set-Cookie were already set by the derive step above.
      if (!set.status || set.status === 200) {
        set.status = 401;
      }
      if (authError === 'wrong_scope') {
        return {
          ok: false,
          error: 'wrong_scope',
          message:
            'This session belongs to the Super Admin portal and cannot access the app.',
        };
      }
      return {
        ok: false,
        error: 'unauthorized',
        message: 'A valid session is required.',
      };
    }
  });
