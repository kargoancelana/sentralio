/**
 * Username utility helpers for the authentication module.
 * Fase 1.4: login accepts a username OR an email. A login identifier with no
 * '@' is treated as a username and validated/normalized here.
 */

/**
 * Trims surrounding whitespace and folds to ASCII lowercase.
 * Used as the canonical lookup key for all username comparisons (mirrors
 * normalizeEmail).
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Returns true iff the username satisfies ALL of:
 *  - length 3–32 characters
 *  - contains ONLY ASCII letters, digits, '_' and '.' (no spaces, no '@')
 *
 * Validation runs on the raw (un-normalized) value. This is a deliberately
 * conservative handle format; it guarantees a username can never contain '@'
 * and therefore never collides with the email branch of login detection.
 */
export function isValidUsernameSyntax(username: string): boolean {
  return /^[A-Za-z0-9._]{3,32}$/.test(username);
}
