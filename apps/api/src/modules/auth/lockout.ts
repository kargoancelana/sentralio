/**
 * Brute-force lockout subsystem.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 *
 * Reads/writes `failed_login_attempts` and `account_lockouts` tables.
 * Accepts an injected `now: Date` parameter so tests can control time.
 *
 * Business rules:
 *  - isLockedOut: returns true iff an account_lockouts row exists with locked_until > now
 *  - recordFailure: inserts a failed attempt, counts attempts in the 15-min sliding window,
 *    upserts a lockout on the 5th failure, emits a failure log, returns { lockedOut }
 *  - clearFailures: deletes all failed_login_attempts and removes any account_lockouts row
 *    for the email (call on successful login)
 *
 * Lockout-blocked (429) attempts are NOT inserted and NOT counted (Req 8.1c).
 * The lockout auto-expires based on server time — no external trigger needed (Req 8.5).
 *
 * This module also exports a PURE reference state machine (LockoutState,
 * pureIsLocked, pureRecordFailure, pureResetOnSuccess) that encodes the same
 * rules without a database, for model-based property testing (Property 12).
 */

import { and, count, eq, gt } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { accountLockouts, failedLoginAttempts } from '../../db/schema';

/** The sliding window duration in milliseconds (15 minutes) */
export const WINDOW_MS = 15 * 60 * 1000;

/** The lockout duration in milliseconds (15 minutes) */
export const LOCK_MS = 15 * 60 * 1000;

/** Number of failures in the sliding window that triggers a lockout */
export const THRESHOLD = 5;

/**
 * @deprecated Use {@link LOCK_MS}. Kept as an alias for backwards compatibility.
 */
const LOCKOUT_DURATION_MS = LOCK_MS;

/**
 * @deprecated Use {@link THRESHOLD}. Kept as an alias for backwards compatibility.
 */
const FAILURE_THRESHOLD = THRESHOLD;

// ───────────────────────────────────────────────────────────────────────────
// Pure reference state machine (Property 12, task 7.2)
//
// These functions encode the lockout business rules WITHOUT touching the
// database, operating on an in-memory state object keyed by epoch-milliseconds.
// They are the canonical specification of the lockout behavior; the DB-backed
// functions below mirror this exact same logic against the SQL tables. The pure
// model is used by the model-based property test so the state machine can be
// exercised across many inputs without a database.
// ───────────────────────────────────────────────────────────────────────────

/**
 * In-memory lockout state for a single email key.
 *  - `failures` is an array of attempt timestamps (epoch ms) for COUNTED failures.
 *  - `lockedUntil` is the epoch-ms instant the lockout expires, or null when not locked.
 */
export interface LockoutState {
  failures: number[];
  lockedUntil: number | null;
}

/** Create a fresh, empty lockout state. */
export function emptyLockoutState(): LockoutState {
  return { failures: [], lockedUntil: null };
}

/**
 * Pure predicate: is the account locked at `nowMs`?
 *
 * Returns true iff `lockedUntil` is set and strictly greater than `nowMs`.
 * Auto-clear semantics: once `lockedUntil <= nowMs` this returns false with no
 * external trigger needed (Req 8.5).
 */
export function pureIsLocked(state: LockoutState, nowMs: number): boolean {
  return state.lockedUntil !== null && state.lockedUntil > nowMs;
}

/**
 * Pure transition for a COUNTED invalid-credential failure at `nowMs`.
 *
 * Returns a NEW state (does not mutate the input):
 *  - If the account is currently locked, the attempt is lockout-blocked (429)
 *    and is NOT counted — the state is returned unchanged (Req 8.1c).
 *  - Otherwise the failure timestamp is appended, failures outside the sliding
 *    window `(nowMs - WINDOW_MS, nowMs]` are pruned (they age out naturally),
 *    and if the remaining count reaches THRESHOLD the account is locked until
 *    `nowMs + LOCK_MS` (Req 8.1, 8.2).
 */
export function pureRecordFailure(state: LockoutState, nowMs: number): LockoutState {
  // Lockout-blocked attempts are not counted.
  if (pureIsLocked(state, nowMs)) {
    return { failures: [...state.failures], lockedUntil: state.lockedUntil };
  }

  const windowStart = nowMs - WINDOW_MS;
  // Keep only in-window failures (sliding window), then add the current one.
  const failures = [...state.failures.filter((t) => t > windowStart), nowMs];

  if (failures.length >= THRESHOLD) {
    return { failures, lockedUntil: nowMs + LOCK_MS };
  }

  return { failures, lockedUntil: null };
}

/**
 * Pure transition for a successful login: clears the failure counter and any
 * active lockout (Req 8.4).
 */
export function pureResetOnSuccess(_state: LockoutState): LockoutState {
  return emptyLockoutState();
}

export type DrizzleDb = typeof defaultDb;

export interface LockoutDeps {
  db: DrizzleDb;
  now: Date;
}

/**
 * Check if email is currently locked out.
 * Returns true iff an active lockout row exists (locked_until > now).
 * Lockouts auto-expire by time comparison — no row deletion needed (Req 8.5).
 */
export async function isLockedOut(email: string, deps: LockoutDeps): Promise<boolean> {
  const { db, now } = deps;

  const rows = await db
    .select()
    .from(accountLockouts)
    .where(
      and(
        eq(accountLockouts.emailLower, email),
        gt(accountLockouts.lockedUntil, now),
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Record a failed login attempt for `email` from `ip`.
 *
 * Steps:
 *  1. INSERT into failed_login_attempts (email_lower, ip, attempted_at = now)
 *  2. COUNT rows in the 15-minute sliding window for this email
 *  3. If count >= 5, UPSERT account_lockouts with locked_until = now + 15min
 *  4. Emit a failure log record (Req 8.6)
 *  5. Return { lockedOut: count >= 5 }
 *
 * This function is NOT called for lockout-blocked (429) attempts (Req 8.1c).
 */
export async function recordFailure(
  email: string,
  ip: string,
  deps: LockoutDeps,
): Promise<{ lockedOut: boolean }> {
  const { db, now } = deps;

  // Step 1: Insert the failure record
  await db.insert(failedLoginAttempts).values({
    emailLower: email,
    ip,
    attemptedAt: now,
  });

  // Step 2: Count failures in the sliding 15-minute window
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  const [result] = await db
    .select({ count: count() })
    .from(failedLoginAttempts)
    .where(
      and(
        eq(failedLoginAttempts.emailLower, email),
        gt(failedLoginAttempts.attemptedAt, windowStart),
      )
    );

  const failureCount = result?.count ?? 0;
  const lockedOut = failureCount >= FAILURE_THRESHOLD;

  // Step 3: Trigger lockout if threshold reached
  if (lockedOut) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);

    await db
      .insert(accountLockouts)
      .values({
        emailLower: email,
        lockedUntil,
        lockedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          lockedUntil,
          lockedAt: now,
        },
      });
  }

  // Step 4: Emit failure log record (Req 8.6)
  // Log only for counted invalid-credential failures (not lockout-blocked attempts)
  console.log(JSON.stringify({
    event: 'failed_login',
    emailLower: email,
    ip,
    timestamp: now.toISOString(),
  }));

  return { lockedOut };
}

/**
 * Clear all failed login attempts AND any active lockout for `email`.
 * Called on successful login to reset the failure counter (Req 8.4).
 * Mirrors {@link pureResetOnSuccess}.
 */
export async function clearFailures(email: string, deps: LockoutDeps): Promise<void> {
  const { db } = deps;

  await db
    .delete(failedLoginAttempts)
    .where(eq(failedLoginAttempts.emailLower, email));

  await db
    .delete(accountLockouts)
    .where(eq(accountLockouts.emailLower, email));
}
