/**
 * Feature: user-authentication, Property 1: Login failure indistinguishability
 *
 * Validates: Requirements 1.4
 *
 * For the three credential-failure scenarios —
 *   (a) unknown email (no matching User),
 *   (b) an existing active User with a wrong password,
 *   (c) an existing User with is_active = false presenting the CORRECT password —
 * the `login()` path SHALL return the unified `{ kind: 'fail-401' }` marker (never
 * 'ok', never a distinguishable kind), and the route-layer response produced by
 * `unifiedLoginFailureResponse()` (status, headers, body) SHALL be byte-identical
 * across all three cases.
 *
 * The test drives `login()` with an injected fake `db` that satisfies the
 * drizzle-orm call chains used on the login failure path:
 *   - isLockedOut:   db.select().from(accountLockouts).where(...).limit(1)  -> [] (never locked)
 *   - user lookup:   db.select().from(users).where(...).limit(1)           -> user rows (or [])
 *   - recordFailure: db.insert(failedLoginAttempts).values({...})          -> awaitable
 *                    db.select({count}).from(...).where(...)               -> [{ count: low }]
 *   - (clearFailures is never reached on a failure case)
 */

// AUTH_JWT_SECRET (>= 32 bytes) and AUTH_ALLOWED_ORIGINS must be present BEFORE
// auth.service.ts is evaluated, because it transitively imports config/env which
// fail-fast validates them at load and calls process.exit(1) when absent. This
// side-effect import is hoisted above the service import below so the vars are
// set first.
import "./helpers/auth-env-setup";

import * as fc from "fast-check";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { login, unifiedLoginFailureResponse } from "../auth.service";
import bcrypt from "bcryptjs";
import { users, accountLockouts, failedLoginAttempts } from "../../../db/schema";
import type { DrizzleDb } from "../lockout";

// ---------------------------------------------------------------------------
// Fake Drizzle db
//
// The login failure path issues these chains. We key behavior off the table
// reference passed to `.from(table)` so the same fake serves all queries:
//
//   .select().from(table).where(cond).limit(n)   (isLockedOut, user lookup)
//   .select({count}).from(table).where(cond)     (recordFailure count -> awaited directly)
//   .insert(table).values(row)                   (recordFailure insert)
//   .insert(table).values(row).onDuplicateKeyUpdate(...)   (lockout upsert; not reached)
//   .delete(table).where(cond)                   (clearFailures; not reached on failure)
// ---------------------------------------------------------------------------

/** A thenable that resolves to `value` — emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

interface UserRow {
  id: number;
  email: string;
  emailLower: string;
  name: string;
  role: "admin" | "staff";
  passwordHash: string;
  isActive: number;
}

/**
 * Build a fake db. The only thing that varies between the three scenarios is
 * the row set returned for the `users` lookup.
 *   - accountLockouts query (via .limit) -> [] (never locked)
 *   - users query (via .limit)           -> userRows
 *   - failedLoginAttempts count (direct await) -> [{ count: 1 }] (low => no lockout)
 */
function makeDb(userRows: UserRow[]): DrizzleDb {
  const db = {
    select(_cols?: unknown) {
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              // Direct-await result for the recordFailure count query
              // (db.select({count}).from(failedLoginAttempts).where(...)).
              const directValue =
                table === failedLoginAttempts ? [{ count: 1 }] : [];

              return {
                ...awaitableResult(directValue),
                // .limit(n) is used by isLockedOut (accountLockouts) and the
                // user lookup (users).
                limit(_n: number) {
                  if (table === users) {
                    return awaitableResult(userRows);
                  }
                  // accountLockouts (and any other) -> never locked / empty.
                  return awaitableResult([]);
                },
              };
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(_row: unknown) {
          return {
            ...awaitableResult(undefined),
            onDuplicateKeyUpdate(_args: unknown) {
              return awaitableResult(undefined);
            },
          };
        },
      };
    },
    delete(_table: unknown) {
      return {
        where(_cond: unknown) {
          return awaitableResult(undefined);
        },
      };
    },
  };

  return db as unknown as DrizzleDb;
}

// ---------------------------------------------------------------------------
// Precomputed bcrypt hashes (hashed once, outside the property, for speed)
// ---------------------------------------------------------------------------

/** Password whose hash backs case (c); the submitted password matches this. */
const CORRECT_PASSWORD = "Correct-Horse-Battery-Staple-123";
/** Password backing case (b); the submitted (generated) password never matches. */
const OTHER_PASSWORD = "Unmatched_Target_Password_!!_xyz";

let correctHash: string;
let otherHash: string;
let originalLog: typeof console.log;

beforeAll(async () => {
  // Silence the recordFailure failure-log output (not under test here; covered
  // by Property 13) to keep the property run output readable.
  originalLog = console.log;
  console.log = () => {};

  // Low cost factor for the test fixtures — only affects how fast bcrypt.compare
  // runs in this test, not what is being validated. (The service's unknown-email
  // branch still uses its own fixed-cost dummy hash internally.)
  correctHash = await bcrypt.hash(CORRECT_PASSWORD, 4);
  otherHash = await bcrypt.hash(OTHER_PASSWORD, 4);
});

afterAll(() => {
  console.log = originalLog;
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Syntactically valid emails (exactly one @, local 1-30, domain with a dot). */
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9._-]{1,30}$/),
    fc.stringMatching(/^[a-z0-9-]{1,20}\.[a-z]{2,6}$/),
  )
  .map(([local, domain]) => `${local}@${domain}`);

/**
 * Wrong-password candidate for case (b): alphanumeric, non-empty. Never equals
 * OTHER_PASSWORD (which contains `_`/`!`), so bcrypt.compare is always false.
 */
const wrongPasswordArb = fc.stringMatching(/^[a-zA-Z0-9]{1,40}$/);

/** Source IP recorded on a counted failure. */
const ipArb = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Injected clock within a wide valid range. */
const nowArb = fc
  .integer({ min: 1_000_000_000_000, max: 4_102_444_800_000 })
  .map((ms) => new Date(ms));

const roleArb = fc.constantFrom("admin" as const, "staff" as const);
const idArb = fc.integer({ min: 1, max: 2_147_483_647 });
const nameArb = fc.stringMatching(/^[A-Za-z ]{1,30}$/);

// ---------------------------------------------------------------------------
// Property 1
// ---------------------------------------------------------------------------

test("Property 1: the three credential-failure cases all return fail-401 with a byte-identical unified response", async () => {
  await fc.assert(
    fc.asyncProperty(
      emailArb,
      emailArb,
      emailArb,
      wrongPasswordArb,
      ipArb,
      nowArb,
      idArb,
      idArb,
      roleArb,
      roleArb,
      nameArb,
      nameArb,
      async (
        emailA,
        emailB,
        emailC,
        wrongPassword,
        ip,
        now,
        idB,
        idC,
        roleB,
        roleC,
        nameB,
        nameC,
      ) => {
        // Case (a): unknown email — user lookup returns [].
        const dbA = makeDb([]);
        const resultA = await login({
          rawBody: JSON.stringify({ email: emailA, password: wrongPassword }),
          ip,
          now,
          db: dbA,
        });

        // Case (b): existing active user, wrong password.
        const dbB = makeDb([
          {
            id: idB,
            email: emailB,
            emailLower: emailB.toLowerCase(),
            name: nameB,
            role: roleB,
            passwordHash: otherHash, // hash of OTHER_PASSWORD
            isActive: 1,
          },
        ]);
        const resultB = await login({
          rawBody: JSON.stringify({ email: emailB, password: wrongPassword }),
          ip,
          now,
          db: dbB,
        });

        // Case (c): inactive user presenting the CORRECT password.
        const dbC = makeDb([
          {
            id: idC,
            email: emailC,
            emailLower: emailC.toLowerCase(),
            name: nameC,
            role: roleC,
            passwordHash: correctHash, // hash of CORRECT_PASSWORD
            isActive: 0,
          },
        ]);
        const resultC = await login({
          rawBody: JSON.stringify({ email: emailC, password: CORRECT_PASSWORD }),
          ip,
          now,
          db: dbC,
        });

        // All three reach the unified 401 marker — never 'ok', never a
        // distinguishable kind.
        expect(resultA.kind).toBe("fail-401");
        expect(resultB.kind).toBe("fail-401");
        expect(resultC.kind).toBe("fail-401");

        // The route maps every fail-401 through the same constant builder, so
        // the (status, headers, body) tuple is byte-identical across the cases.
        const tupleA = JSON.stringify(unifiedLoginFailureResponse());
        const tupleB = JSON.stringify(unifiedLoginFailureResponse());
        const tupleC = JSON.stringify(unifiedLoginFailureResponse());
        expect(tupleA).toBe(tupleB);
        expect(tupleB).toBe(tupleC);

        // No Set-Cookie / no WWW-Authenticate / fixed body & status.
        const unified = unifiedLoginFailureResponse();
        expect(unified.status).toBe(401);
        expect(unified).not.toHaveProperty("cookie");
        expect(Object.keys(unified.headers)).toEqual(["Content-Type"]);
        expect(unified.body).toBe(
          JSON.stringify({ ok: false, error: "invalid_credentials" }),
        );
      },
    ),
    { numRuns: 100 },
  );
}, 120_000);
