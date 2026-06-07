/**
 * Email utility helpers for the authentication module.
 * Requirements: 1.6, 1.7, 8.1
 */

/**
 * Trims surrounding whitespace and folds to ASCII lowercase.
 * Used as the canonical lookup key for all email comparisons.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Returns true iff the email string satisfies ALL of:
 *  - contains exactly one `@`
 *  - local part (before `@`) length is 1–64 characters
 *  - domain part (after `@`) contains at least one `.`
 *  - total length ≤ 254 characters
 *
 * This is a lightweight syntax gate; it is intentionally not a full RFC 5321
 * parser. Caller should normalizeEmail before display/storage but may call
 * isValidEmailSyntax on the raw (un-normalized) value — the constraints apply
 * to the raw input, matching Requirement 1.6.
 */
export function isValidEmailSyntax(email: string): boolean {
  if (email.length > 254) return false;

  const atCount = (email.match(/@/g) ?? []).length;
  if (atCount !== 1) return false;

  const atIndex = email.indexOf("@");
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length < 1 || local.length > 64) return false;
  if (!domain.includes(".")) return false;

  return true;
}
