const COOKIE_NAME = 'wms_session';
const COOKIE_ATTRIBUTES = 'HttpOnly; Secure; SameSite=Lax; Path=/';
const SESSION_MAX_AGE = 28_800; // 8 hours in seconds

/**
 * Returns the Set-Cookie header value for issuing a session cookie.
 * Format: "wms_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800"
 */
export function buildSessionCookie(jwt: string): string {
  return `${COOKIE_NAME}=${jwt}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_MAX_AGE}`;
}

/**
 * Returns the Set-Cookie header value for clearing a session cookie.
 * Format: "wms_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
 */
export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}
