/**
 * Password hashing and verification helpers.
 * Requirements: 7.1, 6.6
 *
 * Uses bcryptjs with a minimum cost factor of 12.
 * The plaintext password is NEVER logged or returned from any function here.
 */

import bcrypt from 'bcryptjs';

/** Minimum bcrypt cost factor, per Requirement 7.1 */
export const BCRYPT_COST = 12;

/**
 * Hash a plaintext password with bcrypt at BCRYPT_COST.
 * Returns the bcrypt hash string (≈60 chars).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Compare a plaintext password against a stored bcrypt hash.
 * Returns true iff the password matches the hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
