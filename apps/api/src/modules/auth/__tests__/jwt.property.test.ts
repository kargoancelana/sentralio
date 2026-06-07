/**
 * Property-based tests for JWT sign/verify round-trip.
 *
 * Feature: user-authentication
 * Property 7: JWT round-trip preserves claims
 * Validates: Requirements 2.3, 2.4
 */

import * as fc from "fast-check";
import { test, expect, beforeAll } from "bun:test";
import { signJwt, verifyJwt } from "../jwt";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  // AUTH_JWT_SECRET must be at least 32 bytes (UTF-8) per Requirement 2.5
  process.env.AUTH_JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long!!";
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Positive integer in the MySQL INT range (1 to 2,147,483,647). */
const subArbitrary = fc.integer({ min: 1, max: 2_147_483_647 });

/** One of the two valid role values. */
const roleArbitrary = fc.constantFrom("admin" as const, "staff" as const);

/**
 * Session issuance time (`now`).
 *
 * `verifyJwt` delegates expiry checking to jose, which compares `exp` against the
 * real wall-clock time. Since a signed token is valid for 28,800 seconds (8h), the
 * round-trip only succeeds while `exp = iat + 28800` is still in the future at the
 * moment of verification. We therefore sample `now` from the valid input space:
 * issuance times anchored to the real current time and extending into the future,
 * which is exactly the realistic domain of "a session being issued right now".
 *
 * The base is captured once so the lower bound stays comfortably ahead of any
 * expiry boundary throughout the test run.
 */
const BASE_NOW_MS = Date.now();
const nowArbitrary = fc
  .integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }) // 0 .. ~1 year in the future
  .map((offsetMs) => new Date(BASE_NOW_MS + offsetMs));

// ---------------------------------------------------------------------------
// Property 7: JWT round-trip preserves claims
// Validates: Requirements 2.3, 2.4
// ---------------------------------------------------------------------------

test("Property 7 [round-trip]: signJwt then verifyJwt preserves sub, role, iat, exp, and jti", async () => {
  // Feature: user-authentication, Property 7: JWT round-trip preserves claims
  await fc.assert(
    fc.asyncProperty(subArbitrary, roleArbitrary, nowArbitrary, async (sub, role, now) => {
      // Sign the JWT
      const token = await signJwt({ sub, role }, now);

      // The result must be a non-empty string
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);

      // Decode and verify. `verifyJwt` uses jose, which checks `exp` against the
      // real current time. Because `now` is sampled from the valid issuance window
      // (now .. ~1 year ahead), every generated token's `exp` is still in the future
      // at verification time, so the round-trip reflects normal session usage.
      const decoded = await verifyJwt(token);

      const expectedIat = Math.floor(now.getTime() / 1000);
      const expectedExp = expectedIat + 28_800;

      // sub must round-trip as the same integer
      expect(decoded.sub).toBe(sub);

      // role must round-trip unchanged
      expect(decoded.role).toBe(role);

      // iat must equal Math.floor(now.getTime() / 1000)
      expect(decoded.iat).toBe(expectedIat);

      // exp must equal iat + 28800 (8 hours, per Requirement 2.4)
      expect(decoded.exp).toBe(expectedExp);

      // jti must be a non-empty string in UUID format
      expect(typeof decoded.jti).toBe("string");
      expect(decoded.jti.length).toBeGreaterThan(0);
      expect(decoded.jti).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    }),
    { numRuns: 100 }
  );
});
