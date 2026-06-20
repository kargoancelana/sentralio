const COOKIE_NAME = 'platform_session';
const COOKIE_ATTRIBUTES = 'HttpOnly; Secure; SameSite=Lax; Path=/';
const SESSION_MAX_AGE = 28_800; // 8 hours in seconds

export const PLATFORM_COOKIE_NAME = COOKIE_NAME;

/**
 * Set-Cookie value untuk menerbitkan sesi portal platform.
 * Format: "platform_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800"
 */
export function buildPlatformSessionCookie(jwt: string): string {
  return `${COOKIE_NAME}=${jwt}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_MAX_AGE}`;
}

/**
 * Set-Cookie value untuk menghapus sesi portal platform.
 * Format: "platform_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
 */
export function buildPlatformClearCookie(): string {
  return `${COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}
