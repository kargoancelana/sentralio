/**
 * Feature: user-authentication, Property 13: Failed-credential attempts are logged with normalized email, IP, and UTC time
 *
 * Validates: Requirements 8.6
 *
 * For any login attempt rejected due to invalid credentials (excluding
 * Lockout-blocked rejections), `recordFailure` SHALL emit exactly one log
 * record containing the (already normalized) email, the source IP, and a UTC
 * timestamp at second resolution or finer.
 *
 * `recordFailure(email, ip, { db, now })` writes to the DB. To exercise the
 * logging behavior in isolation we inject a minimal fake `db` that satisfies
 * the drizzle-orm call chain used by `recordFailure`:
 *   1. await db.insert(failedLoginAttempts).values({...})
 *   2. await db.select({ count: count() }).from(...).where(...)  -> [{ count }]
 *   3. (only when count >= 5) db.insert(accountLockouts).values({...}).onDuplicateKeyUpdate({...})
 *
 * The fake returns a low count (1) so `lockedOut` stays false and the lockout
 * upsert branch is not taken — keeping the test focused on the single
 * failure-log emission.
 */

import * as fc from "fast-check";
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { recordFailure, type LockoutDeps } from "../lockout";

// ---------------------------------------------------------------------------
// Minimal fake Drizzle db that satisfies the chain used by recordFailure.
//
// recordFailure performs:
//   await db.insert(table).values({...})                      // INSERT failure row
//   await db.select({count}).from(table).where(cond)          // -> [{ count }]
//   db.insert(table).values({...}).onDuplicateKeyUpdate({...}) // only if locked
//
// We return a fixed low count so `lockedOut` is false. Both `.values()` (the
// insert terminal) and the select chain are awaitable (thenable) so that
// `await` resolves them. The select chain resolves to an array of count rows.
// ---------------------------------------------------------------------------

/** A thenable that resolves to `value` — emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

/** Build a fake db whose failure-count query returns `countValue`. */
function makeMockDb(countValue: number) {
  const insertCalls: unknown[] = [];

  const db = {
    insert(_table: unknown) {
      return {
        values(row: unknown) {
          insertCalls.push(row);
          // The terminal `.values()` is awaited directly by the failure insert,
          // and is also the base for the lockout upsert which chains
          // `.onDuplicateKeyUpdate(...)`. Make it both awaitable and chainable.
          return {
            ...awaitableResult(undefined),
            onDuplicateKeyUpdate(_args: unknown) {
              return awaitableResult(undefined);
            },
          };
        },
      };
    },
    select(_cols: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(_cond: unknown) {
              // recordFailure destructures `const [result] = await ...`
              return awaitableResult([{ count: countValue }]);
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as LockoutDeps["db"], insertCalls };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Normalized email strings. The caller of recordFailure passes an
 * already-normalized email key; we generate plausible such keys plus arbitrary
 * strings to stress the logging path. recordFailure logs the value verbatim.
 */
const emailArb = fc.oneof(
  fc
    .tuple(
      fc.stringMatching(/^[a-z0-9._-]{1,30}$/),
      fc.stringMatching(/^[a-z0-9-]{1,20}\.[a-z]{2,6}$/),
    )
    .map(([local, domain]) => `${local}@${domain}`),
  fc.string(),
);

/** IP strings: IPv4-ish, IPv6-ish, and arbitrary strings. */
const ipArb = fc.oneof(
  fc
    .tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    )
    .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
  fc.constantFrom("::1", "2001:db8::1", "fe80::1ff:fe23:4567:890a"),
  fc.string(),
);

/** Arbitrary Date within a wide, valid range. */
const dateArb = fc
  .integer({ min: 0, max: 4_102_444_800_000 }) // 1970 .. ~2100
  .map((ms) => new Date(ms));

// ---------------------------------------------------------------------------
// console.log spy
// ---------------------------------------------------------------------------

let logSpy: unknown[];
let originalLog: typeof console.log;

beforeEach(() => {
  logSpy = [];
  originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logSpy.push(args.length === 1 ? args[0] : args);
  };
});

afterEach(() => {
  console.log = originalLog;
});

// ---------------------------------------------------------------------------
// Property 13
// ---------------------------------------------------------------------------

describe("Property 13: Failed-credential attempts are logged with normalized email, IP, and UTC time", () => {
  test(
    "emits exactly one failed_login log record with the email, IP, and now.toISOString(), and no password/hash",
    async () => {
      await fc.assert(
        fc.asyncProperty(emailArb, ipArb, dateArb, async (email, ip, now) => {
          // Reset capture for this iteration (beforeEach only runs once per test).
          logSpy = [];

          const { db } = makeMockDb(1); // low count => lockedOut stays false

          const result = await recordFailure(email, ip, { db, now });

          // A low failure count must not trigger a lockout.
          expect(result.lockedOut).toBe(false);

          // Find all failed_login records emitted to console.log.
          const failedLoginRecords = logSpy
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => {
              try {
                return JSON.parse(entry) as Record<string, unknown>;
              } catch {
                return null;
              }
            })
            .filter(
              (obj): obj is Record<string, unknown> =>
                obj !== null && obj.event === "failed_login",
            );

          // Exactly one failure log record is emitted.
          expect(failedLoginRecords.length).toBe(1);

          const record = failedLoginRecords[0]!;

          // Contains the email (as passed) and the IP (as passed).
          expect(record.emailLower).toBe(email);
          expect(record.ip).toBe(ip);

          // Contains a UTC timestamp equal to now.toISOString().
          expect(record.timestamp).toBe(now.toISOString());
          // ISO 8601 UTC form ends with 'Z'.
          expect(typeof record.timestamp).toBe("string");
          expect((record.timestamp as string).endsWith("Z")).toBe(true);

          // No password/hash field appears anywhere in the log record.
          const keys = Object.keys(record).map((k) => k.toLowerCase());
          for (const forbidden of ["password", "passwordhash", "password_hash", "hash"]) {
            expect(keys).not.toContain(forbidden);
          }
          const serialized = JSON.stringify(record).toLowerCase();
          expect(serialized.includes("password")).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );
});
