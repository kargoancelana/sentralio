/**
 * Origin_Middleware — CSRF/origin enforcement for state-changing requests.
 * Requirements: 9.2, 9.3, 9.4, 9.6
 *
 * Mounted before Auth_Middleware. Logic:
 *  - GET, HEAD, OPTIONS are always skipped (Req 9.6).
 *  - State-changing requests (POST, PUT, PATCH, DELETE) without a wms_session
 *    cookie are also skipped — the auth middleware will reject them as 401
 *    (Req 9.4).
 *  - For state-changing requests WITH a wms_session cookie:
 *      1. Check the Origin header first; if present, call matchesAllowList.
 *      2. If Origin is absent, check the Referer header and call matchesAllowList.
 *      3. If BOTH are absent → 403.
 *      4. If present but not matching → 403.
 *      5. If matching → continue to next handler.
 */

import { Elysia } from 'elysia';
import { matchesAllowList, isStateChanging } from './origin';

const COOKIE_NAME = 'wms_session';

export const originMiddleware = new Elysia({ name: 'origin-middleware' })
  .onBeforeHandle({ as: 'global' }, ({ request, cookie, set }) => {
    const method = request.method;

    // Req 9.6: GET, HEAD, OPTIONS are exempt from origin enforcement.
    if (!isStateChanging(method)) {
      return;
    }

    // Req 9.4: State-changing request without wms_session cookie → skip origin
    // enforcement. The auth middleware will handle this as a 401.
    const sessionCookie = cookie[COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    if (!cookieValue) {
      return;
    }

    // State-changing request WITH wms_session cookie — enforce origin/referer.
    const originHeader = request.headers.get('origin');
    const refererHeader = request.headers.get('referer');

    // Prefer Origin header; fall back to Referer.
    const headerToCheck = originHeader ?? refererHeader;

    if (!headerToCheck) {
      // Both absent → 403 (Req 9.3).
      set.status = 403;
      return {
        ok: false,
        error: 'forbidden_origin',
        message: 'Origin or Referer header is required for state-changing requests.',
      };
    }

    if (!matchesAllowList(headerToCheck)) {
      // Present but not in the allow-list → 403 (Req 9.3).
      set.status = 403;
      return {
        ok: false,
        error: 'forbidden_origin',
        message: 'Request origin is not in the allowed list.',
      };
    }

    // Origin matched — allow the request to continue.
  });
