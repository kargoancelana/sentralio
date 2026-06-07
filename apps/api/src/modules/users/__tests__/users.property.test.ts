/**
 * Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
 * Validates: Requirements 6.4, 6.5, 6.7, 7.2
 *
 * For any Create User payload, `createUser` SHALL respond `{ ok: false, errors }` exactly
 * when any field violates its bound — invalid email syntax, trimmed name length outside
 * 1–100, role not 'admin'/'staff', password length outside 10–128 — and in ALL cases,
 * the returned object SHALL NEVER contain the plaintext `password` or `password_hash`
 * keys anywhere.
 *
 * A mock DB is used (no real database). The mock always reports no duplicate email so
 * uniqueness checks pass, allowing validation tests to focus on field-level rules.
 */

// Import auth-env-setup FIRST — users.service.ts transitively imports config/env.ts
// which calls process.exit(1) if AUTH_JWT_SECRET / AUTH_ALLOWED_ORIGINS are missing.
import "../../auth/__tests__/helpers/auth-env-setup";

import * as fc from "fast-check";
import { test, expect } from "bun:test";
import { createUser } from "../users.service";
import type { DrizzleDb } from "../users.service";
import { users } from "../../../db/schema";

// ---------------------------------------------------------------------------
// Mock DB — always reports no duplicate email (uniqueness check passes),
// and handles insert by returning a fake insertId.
// ---------------------------------------------------------------------------

/** A thenable that resolves to `value` — emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

let mockInsertId = 1;

function makeMockDb(): DrizzleDb {
  return {
    select(_cols?: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                limit(_n: number) {
                  // Always return [] — no existing user with this email.
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
          return awaitableResult([{ insertId: mockInsertId++ }]);
        },
      };
    },
    update(_table: unknown) {
      return {
        set(_data: unknown) {
          return {
            where(_cond: unknown) {
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
  } as unknown as DrizzleDb;
}

// ---------------------------------------------------------------------------
// Recursive helper: check that no key named 'password' or 'password_hash'
// exists anywhere in an object (deep check).
// ---------------------------------------------------------------------------

function containsSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key === "password" || key === "password_hash") return true;
    if (containsSecretKey((value as Record<string, unknown>)[key])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Characters safe for local parts of email addresses. */
const alphaNum = (min: number, max: number) =>
  fc
    .array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""),
      ),
      { minLength: min, maxLength: max },
    )
    .map((chars) => chars.join(""));

/**
 * Well-formed email: exactly one @, local 1–64, domain with a dot, total <= 254.
 */
const validEmailArb = fc
  .tuple(alphaNum(1, 30), alphaNum(1, 20), alphaNum(2, 10))
  .map(([local, pre, suf]) => `${local}@${pre}.${suf}`)
  .filter((e) => e.length <= 254);

/**
 * Invalid email: covers the most common invalid patterns.
 * - No @ character
 * - Multiple @
 * - Empty local part
 * - Local part > 64 chars
 * - Domain without a dot
 * - Total length > 254
 */
const invalidEmailArb = fc.oneof(
  // No @ symbol
  alphaNum(1, 50),
  // Multiple @
  fc
    .tuple(alphaNum(1, 20), alphaNum(1, 20), alphaNum(1, 20))
    .map(([a, b, c]) => `${a}@${b}@${c}`),
  // Empty local part: @domain.com
  fc
    .tuple(alphaNum(1, 20), alphaNum(2, 6))
    .map(([pre, suf]) => `@${pre}.${suf}`),
  // Local part > 64 chars
  fc
    .tuple(alphaNum(1, 20), alphaNum(2, 6))
    .map(([pre, suf]) => `${"a".repeat(65)}@${pre}.${suf}`),
  // Domain without a dot
  fc
    .tuple(alphaNum(1, 30), alphaNum(1, 30))
    .map(([local, domain]) => `${local}@${domain}`)
    .filter((e) => !e.split("@")[1]?.includes(".")),
  // Total length > 254
  fc
    .tuple(alphaNum(1, 30), alphaNum(1, 20), alphaNum(2, 6))
    .map(([local, pre, suf]) => `${"a".repeat(200)}${local}@${pre}.${suf}`)
    .filter((e) => e.length > 254),
);

/**
 * Valid name: trimmed length 1–100.
 * We produce strings that are already trimmed (no leading/trailing spaces)
 * with length in [1, 100].
 */
const validNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

/**
 * Invalid name: trimmed length 0 (empty / whitespace only) or > 100 chars.
 */
const invalidNameArb = fc.oneof(
  // Whitespace-only (trims to 0)
  fc
    .array(fc.constantFrom(" ", "\t", "\n"), { minLength: 1, maxLength: 10 })
    .map((chars) => chars.join("")),
  // Name that trims to > 100 chars
  fc
    .string({ minLength: 101, maxLength: 120 })
    .filter((s) => s.trim().length > 100),
);

/** Valid role: exactly 'admin' or 'staff'. */
const validRoleArb = fc.constantFrom("admin", "staff");

/**
 * Invalid role: any string that is not 'admin' or 'staff'.
 */
const invalidRoleArb = fc
  .string({ minLength: 0, maxLength: 30 })
  .filter((s) => s !== "admin" && s !== "staff");

/**
 * Valid password: length 10–128.
 */
const validPasswordArb = fc
  .string({ minLength: 10, maxLength: 128 })
  .filter((s) => s.length >= 10 && s.length <= 128);

/**
 * Invalid password: length < 10 or > 128.
 */
const invalidPasswordArb = fc.oneof(
  // Too short (0–9 chars)
  fc.string({ minLength: 0, maxLength: 9 }),
  // Too long (129–200 chars)
  fc.string({ minLength: 129, maxLength: 200 }),
);

// ---------------------------------------------------------------------------
// Property 16a: Invalid email → { ok: false, errors: { email: ... } }
// Validates: Requirements 6.4, 6.5
// ---------------------------------------------------------------------------

test("Property 16 [validation - invalid email]: createUser returns { ok: false, errors: { email } } for any invalid email", async () => {
  // Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
  await fc.assert(
    fc.asyncProperty(
      invalidEmailArb,
      validNameArb,
      validRoleArb,
      validPasswordArb,
      async (email, name, role, password) => {
        const db = makeMockDb();
        const result = await createUser({ email, name, role, password }, db);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toHaveProperty("email");
        }
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);

// ---------------------------------------------------------------------------
// Property 16b: Invalid name (trims to 0 or > 100) → { ok: false, errors: { name: ... } }
// Validates: Requirements 6.4, 6.5
// ---------------------------------------------------------------------------

test("Property 16 [validation - invalid name]: createUser returns { ok: false, errors: { name } } for valid email but name trimming to 0 or > 100 chars", async () => {
  // Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
  await fc.assert(
    fc.asyncProperty(
      validEmailArb,
      invalidNameArb,
      validRoleArb,
      validPasswordArb,
      async (email, name, role, password) => {
        const db = makeMockDb();
        const result = await createUser({ email, name, role, password }, db);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toHaveProperty("name");
        }
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);

// ---------------------------------------------------------------------------
// Property 16c: Invalid role → { ok: false, errors: { role: ... } }
// Validates: Requirements 6.4, 6.5
// ---------------------------------------------------------------------------

test("Property 16 [validation - invalid role]: createUser returns { ok: false, errors: { role } } for role not 'admin' or 'staff'", async () => {
  // Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
  await fc.assert(
    fc.asyncProperty(
      validEmailArb,
      validNameArb,
      invalidRoleArb,
      validPasswordArb,
      async (email, name, role, password) => {
        const db = makeMockDb();
        const result = await createUser({ email, name, role, password }, db);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toHaveProperty("role");
        }
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);

// ---------------------------------------------------------------------------
// Property 16d: Invalid password (< 10 or > 128 chars) → { ok: false, errors: { password: ... } }
// Validates: Requirements 6.4, 6.5
// ---------------------------------------------------------------------------

test("Property 16 [validation - invalid password]: createUser returns { ok: false, errors: { password } } for password length < 10 or > 128", async () => {
  // Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
  await fc.assert(
    fc.asyncProperty(
      validEmailArb,
      validNameArb,
      validRoleArb,
      invalidPasswordArb,
      async (email, name, role, password) => {
        const db = makeMockDb();
        const result = await createUser({ email, name, role, password }, db);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toHaveProperty("password");
        }
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);

// ---------------------------------------------------------------------------
// Property 16e: Success response NEVER contains 'password' or 'password_hash'
// Validates: Requirements 6.7, 7.2
// ---------------------------------------------------------------------------

test("Property 16 [no-secret-leak - success]: { ok: true, user } never contains 'password' or 'password_hash' keys", async () => {
  // Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
  await fc.assert(
    fc.asyncProperty(
      validEmailArb,
      validNameArb,
      validRoleArb,
      validPasswordArb,
      async (email, name, role, password) => {
        const db = makeMockDb();
        const result = await createUser({ email, name, role, password }, db);
        // When validation passes and mock DB inserts successfully, result.ok === true.
        // We assert no secret keys are present regardless of ok status.
        expect(containsSecretKey(result)).toBe(false);
        if (result.ok) {
          // Double-check: the user object specifically must not have these keys.
          expect(containsSecretKey(result.user)).toBe(false);
          expect(Object.keys(result.user)).not.toContain("password");
          expect(Object.keys(result.user)).not.toContain("password_hash");
        }
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);

// ---------------------------------------------------------------------------
// Property 16f: Failure response NEVER contains the actual password value in
//               any error message.
// Validates: Requirements 6.7, 7.2
// ---------------------------------------------------------------------------

test("Property 16 [no-secret-leak - failure]: { ok: false, errors } never contains the plaintext password value in error messages", async () => {
  // Feature: user-authentication, Property 16: Create-user validation and no-secret-leak
  await fc.assert(
    fc.asyncProperty(
      // Use invalid email so we always get a failure response
      invalidEmailArb,
      validNameArb,
      validRoleArb,
      validPasswordArb,
      async (email, name, role, password) => {
        const db = makeMockDb();
        const result = await createUser({ email, name, role, password }, db);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          // No error message should contain the actual plaintext password.
          const errorsJson = JSON.stringify(result.errors);
          expect(errorsJson).not.toContain(password);
        }
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);
