/**
 * Feature: user-authentication, Property 6: Issued session invariants
 *
 * On a successful login, the issued session must satisfy a fixed set of
 * invariants: the canonical Set-Cookie string, a JWT whose claims encode the
 * user id/role and the 8-hour validity window (`exp === iat + 28800`,
 * `iat === floor(now/1000)`) with a non-empty jti, and a `user` payload that
 * exposes ONLY id/email/name/role (never the password hash).
 *
 * Validates: Requirements 2.1, 2.4
 */

// Sets AUTH_JWT_SECRET (>= 32 UTF-8 bytes, Req 2.5) and AUTH_ALLOWED_ORIGINS
// BEFORE `config/env.ts` evaluates. This import MUST come first: ESM hoists
// imports above top-level statements, and `config/env.ts` exits the process at
// load time when those vars are missing.
import "./helpers/auth-env-setup";

import * as fc from "fast-check";
import { test, expect, beforeAll } from "bun:test";
import { login } from "../auth.service";
import { verifyJwtIgnoreExp } from "../jwt";
import { hashPassword } from "../password";
import { users, accountLockouts } from "../../../db/schema";
import type { DrizzleDb } from "../lockout";

// ---------------------------------------------------------------------------
// Setup: a fixed, known password and its bcrypt hash. The submitted password
// equals KNOWN_PASSWORD, and the fake user stores its bcrypt hash, so every
// login reaches the success path. Hashing is expensive, so it is done once.
// ---------------------------------------------------------------------------

const KNOWN_PASSWORD = "correct-horse-battery-staple-12";
let KNOWN_HASH = "";

beforeAll(async () => {
  KNOWN_HASH = await hashPassword(KNOWN_PASSWORD);
});

// ---------------------------------------------------------------------------
// Fake DB that drives `login` down the success path:
//   - isLockedOut → SELECT from account_lockouts → []  (not locked)
//   - user lookup → SELECT from users → [the active user]
//   - clearFailures → DELETE from ... → awaitable no-ops
// The select chain shape is `.select().from(table).where(...).limit(n)`; the
// result is keyed off the table identity so the lockout check and the user
// lookup return the correct rows.
// ---------------------------------------------------------------------------

interface FakeUser {
  id: number;
  companyId: number;
  email: string;
  emailLower: string;
  name: string;
  role: "admin" | "staff";
  passwordHash: string;
  isActive: number;
}

function makeFakeDb(user: FakeUser): DrizzleDb {
  const fake = {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                limit(_n: number) {
                  if (table === accountLockouts) return Promise.resolve([]);
                  if (table === users) return Promise.resolve([user]);
                  return Promise.resolve([]);
                },
              };
            },
          };
        },
      };
    },
    delete() {
      return {
        where() {
          return Promise.resolve(undefined);
        },
      };
    },
  };
  return fake as unknown as DrizzleDb;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Positive integer in the MySQL INT range — used as users.id / sub. */
const subArbitrary = fc.integer({ min: 1, max: 2_147_483_647 });

/** One of the two valid role values. */
const roleArbitrary = fc.constantFrom("admin" as const, "staff" as const);

/** Arbitrary display name (may be empty — irrelevant to this property). */
const nameArbitrary = fc.string({ maxLength: 100 });

/**
 * A syntactically valid email (`isValidEmailSyntax`): exactly one `@`, local
 * part 1–64 chars, domain part containing a `.`, total <= 254. Built from
 * alphanumeric labels so it always passes the syntax gate.
 */
const alnum = fc.string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), minLength: 1, maxLength: 20 });
const emailArbitrary = fc
  .tuple(alnum, alnum)
  .map(([local, domain]) => `${local}@${domain}.com`);

/**
 * Session issuance time. Constrained to a sane range (2000–2100) so the JWT's
 * `iat`/`exp` are comfortably positive; expiry is irrelevant here because we
 * decode with `verifyJwtIgnoreExp`.
 */
const nowArbitrary = fc.date({
  min: new Date("2000-01-01T00:00:00.000Z"),
  max: new Date("2100-01-01T00:00:00.000Z"),
});

// ---------------------------------------------------------------------------
// Property 6: Issued session invariants
// Validates: Requirements 2.1, 2.4
// ---------------------------------------------------------------------------

test("Property 6 [issued session invariants]: cookie, JWT claims, and public user payload on successful login", async () => {
  // Feature: user-authentication, Property 6: Issued session invariants
  await fc.assert(
    fc.asyncProperty(
      subArbitrary,
      roleArbitrary,
      nameArbitrary,
      emailArbitrary,
      nowArbitrary,
      async (sub, role, name, email, now) => {
        const user: FakeUser = {
          id: sub,
          companyId: 1,
          email,
          emailLower: email.toLowerCase(),
          name,
          role,
          passwordHash: KNOWN_HASH,
          isActive: 1,
        };

        const result = await login({
          rawBody: JSON.stringify({ email, password: KNOWN_PASSWORD }),
          ip: "1.2.3.4",
          now,
          db: makeFakeDb(user),
        });

        // Must reach the success path.
        expect(result.kind).toBe("ok");
        if (result.kind !== "ok") return;

        // Cookie must EXACTLY equal the canonical issue-cookie string (Req 2.1).
        expect(result.cookie).toBe(
          `wms_session=${result.jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`,
        );

        // Decode regardless of wall clock (deterministic under injected `now`).
        const decoded = await verifyJwtIgnoreExp(result.jwt);

        const expectedIat = Math.floor(now.getTime() / 1000);

        expect(decoded.sub).toBe(user.id);
        expect(decoded.role).toBe(user.role);
        expect(decoded.iat).toBe(expectedIat);
        // exp = iat + 28800 (8 hours, Req 2.4).
        expect(decoded.exp).toBe(decoded.iat + 28_800);
        expect(typeof decoded.jti).toBe("string");
        expect(decoded.jti.length).toBeGreaterThan(0);

        // The public user payload exposes ONLY id/companyId/email/name/role — no
        // passwordHash (or any other) field leaks.
        expect(result.user).toEqual({
          id: user.id,
          companyId: user.companyId,
          email: user.email,
          name: user.name,
          role: user.role,
        });
        expect(Object.keys(result.user).sort()).toEqual(["companyId", "email", "id", "name", "role"]);
        expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
      },
    ),
    { numRuns: 100 },
  );
}, 60_000);
