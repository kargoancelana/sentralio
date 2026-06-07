/**
 * Unit test for the 500 issuance-failure path of Auth_Service.login.
 *
 * Requirement 1.9: IF credentials are valid but Session issuance fails for an
 * internal reason (signing failure or persistence error), THEN the Auth_Service
 * SHALL respond with HTTP 500 and a generic error, SHALL NOT set a wms_session
 * cookie, and SHALL NOT persist any partial Session state.
 *
 * The login success path (step 9) runs, in order:
 *   clearFailures(emailLower, deps)  →  signJwt(...)  →  buildSessionCookie(...)
 * all wrapped in try/catch; ANY throw collapses to { kind: 'fail-500' } with no
 * cookie and no partial state.
 *
 * This test forces two independent issuance failures and asserts the fail-500
 * contract for each:
 *   (1) a persistence failure — clearFailures' db.delete(...).where(...) throws.
 *   (2) a signing failure — AUTH_JWT_SECRET is unset right before login so
 *       signJwt throws on its missing-secret path.
 */

// Sets AUTH_JWT_SECRET (>= 32 UTF-8 bytes, Req 2.5) and AUTH_ALLOWED_ORIGINS
// BEFORE `config/env.ts` evaluates. This import MUST come first: ESM hoists
// imports above top-level statements, and `config/env.ts` calls process.exit(1)
// at load time when those vars are missing.
import './helpers/auth-env-setup';

import { test, expect, describe, beforeAll } from 'bun:test';
import { login } from '../auth.service';
import { hashPassword } from '../password';
import { users } from '../../../db/schema';
import type { DrizzleDb } from '../lockout';

// A valid active user whose credentials verify against the submitted password,
// so login reaches the success/issuance block (step 9).
const VALID_PASSWORD = 'Correct-Horse-Battery-Staple-123';
const TEST_EMAIL = 'issuance@example.com';

interface UserRow {
  id: number;
  email: string;
  emailLower: string;
  name: string;
  role: 'admin' | 'staff';
  passwordHash: string;
  isActive: number;
}

/** A thenable that resolves to `value` — emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

/**
 * Build a fake Drizzle-shaped db that drives login to the issuance block.
 *
 * Reads:
 *  - isLockedOut: select().from(accountLockouts).where().limit(1)  → [] (not locked)
 *  - user lookup: select().from(users).where().limit(1)            → [user] (valid creds)
 *
 * Writes:
 *  - clearFailures: delete(...).where(...)
 *      • onDelete='throw' → throws to simulate a persistence failure
 *      • onDelete='noop'  → resolves so clearFailures succeeds (isolates signJwt)
 *
 * `counters.deleteCalls` records how many delete chains were initiated, so the
 * test can assert no further persistence happened after the forced failure.
 */
function makeFakeDb(
  userRows: UserRow[],
  onDelete: 'throw' | 'noop',
): { db: DrizzleDb; counters: { deleteCalls: number } } {
  const counters = { deleteCalls: 0 };

  const db = {
    select(_cols?: unknown) {
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                limit(_n: number) {
                  if (table === users) {
                    return awaitableResult(userRows);
                  }
                  // accountLockouts (and any other) → never locked / empty.
                  return awaitableResult([]);
                },
              };
            },
          };
        },
      };
    },
    delete(_table: unknown) {
      counters.deleteCalls += 1;
      return {
        where(_cond: unknown) {
          if (onDelete === 'throw') {
            throw new Error('simulated persistence failure during issuance');
          }
          return awaitableResult(undefined);
        },
      };
    },
  };

  return { db: db as unknown as DrizzleDb, counters };
}

// Precompute the bcrypt hash once (outside the tests) for speed.
let validHash: string;
beforeAll(async () => {
  validHash = await hashPassword(VALID_PASSWORD);
});

describe('Auth_Service.login — 500 issuance-failure path (Req 1.9)', () => {
  test('persistence failure in clearFailures yields fail-500 with no cookie', async () => {
    const user: UserRow = {
      id: 42,
      email: TEST_EMAIL,
      emailLower: TEST_EMAIL,
      name: 'Issuance Tester',
      role: 'admin',
      passwordHash: validHash,
      isActive: 1,
    };

    const fake = makeFakeDb([user], 'throw');

    const result = await login({
      rawBody: JSON.stringify({ email: TEST_EMAIL, password: VALID_PASSWORD }),
      ip: '203.0.113.10',
      now: new Date('2024-01-01T00:00:00Z'),
      db: fake.db,
    });

    // 1. The result is the internal-failure variant (maps to HTTP 500).
    expect(result.kind).toBe('fail-500');

    // 2. No cookie / no jwt: the fail-500 variant carries neither field.
    expect(result).not.toHaveProperty('cookie');
    expect(result).not.toHaveProperty('jwt');

    // 3. No persisted session state: the delete threw before any cookie/jwt was
    //    produced, so there is no Set-Cookie and no revoked/session row written.
    expect(fake.counters.deleteCalls).toBe(1);
  });

  test('signing failure (missing AUTH_JWT_SECRET) yields fail-500 with no cookie', async () => {
    const user: UserRow = {
      id: 7,
      email: TEST_EMAIL,
      emailLower: TEST_EMAIL,
      name: 'Issuance Tester',
      role: 'staff',
      passwordHash: validHash,
      isActive: 1,
    };

    // clearFailures must succeed here so the throw originates from signJwt's
    // missing-secret path.
    const fake = makeFakeDb([user], 'noop');

    const savedSecret = process.env.AUTH_JWT_SECRET;
    try {
      delete process.env.AUTH_JWT_SECRET;

      const result = await login({
        rawBody: JSON.stringify({ email: TEST_EMAIL, password: VALID_PASSWORD }),
        ip: '203.0.113.11',
        now: new Date('2024-01-01T00:00:00Z'),
        db: fake.db,
      });

      expect(result.kind).toBe('fail-500');
      expect(result).not.toHaveProperty('cookie');
      expect(result).not.toHaveProperty('jwt');
    } finally {
      // Always restore the secret so other tests are unaffected.
      process.env.AUTH_JWT_SECRET = savedSecret;
    }
  });
});
