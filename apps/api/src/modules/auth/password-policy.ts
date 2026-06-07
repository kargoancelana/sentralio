/**
 * Password policy for NEW passwords (create user + change password).
 *
 * Rules:
 *  - minimum 8 characters
 *  - at least one uppercase letter (A–Z)
 *  - at least one special character (non-alphanumeric)
 *  - maximum 128 characters (storage/DoS guard)
 *
 * NOTE: This policy applies only to newly-set passwords. Existing passwords and
 * the login flow are unaffected.
 *
 * The returned message is a user-friendly Indonesian string suitable for direct
 * display in the UI. The plaintext password is never logged or echoed.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const UPPERCASE_RE = /[A-Z]/;
const SPECIAL_RE = /[^A-Za-z0-9]/;

export interface PasswordPolicyResult {
  ok: boolean;
  /** User-friendly message (Indonesian) when ok = false. */
  message?: string;
}

export function validatePasswordPolicy(password: unknown): PasswordPolicyResult {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, message: 'Password wajib diisi.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `Password maksimal ${PASSWORD_MAX_LENGTH} karakter.` };
  }
  if (!UPPERCASE_RE.test(password)) {
    return { ok: false, message: 'Password harus mengandung minimal satu huruf kapital.' };
  }
  if (!SPECIAL_RE.test(password)) {
    return { ok: false, message: 'Password harus mengandung minimal satu karakter khusus (mis. !@#$%).' };
  }
  return { ok: true };
}
