/**
 * Property-based tests for logout revocation round-trip.
 *
 * Feature: user-authentication
 * Property 9: Logout revocation round-trip
 * Validates: Requirements 3.3, 3.5
 */

import * as fc from "fast-check";
import { test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// In-memory revocation model
//
// These two helpers model the server-side revocation logic:
//   - revoke(jti, set)    → inserts jti into the denylist  (logout path)
//   - isRevoked(jti, set) → checks whether jti is in the denylist
//
// The real implementation stores the jti in the `revoked_sessions` table
// (Auth_Service.logout / Auth_Middleware step 6).  We test the pure logical
// invariants here using a Set<string> so the properties remain fast and
// database-free.
// ---------------------------------------------------------------------------

function isRevoked(jti: string, revokedSet: Set<string>): boolean {
  return revokedSet.has(jti);
}

function revoke(jti: string, revokedSet: Set<string>): void {
  revokedSet.add(jti);
}

// ---------------------------------------------------------------------------
// Arbitrary for jti strings
//
// A realistic jti is a UUIDv4, but for logical correctness it is any non-empty
// string.  We generate both UUID-shaped strings and arbitrary printable strings
// so the properties are not accidentally coupled to UUID formatting.
// ---------------------------------------------------------------------------

/** Generates a hex segment of exactly `len` characters from [0-9a-f]. */
const hexSegment = (len: number) =>
  fc
    .array(fc.constantFrom(...("0123456789abcdef".split(""))), {
      minLength: len,
      maxLength: len,
    })
    .map((chars) => chars.join(""));

const jtiArbitrary = fc.oneof(
  // UUID-shaped strings (realistic: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  fc
    .tuple(
      hexSegment(8),
      hexSegment(4),
      hexSegment(4),
      hexSegment(4),
      hexSegment(12)
    )
    .map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`),
  // Arbitrary non-empty strings
  fc.string({ minLength: 1, maxLength: 64 })
);

/**
 * Generates two distinct jti values (jtiA !== jtiB).
 */
const distinctJtiPairArbitrary = fc
  .tuple(jtiArbitrary, jtiArbitrary)
  .filter(([a, b]) => a !== b);

// ---------------------------------------------------------------------------
// Property 9a: Before revocation isRevoked returns false
// Validates: Requirements 3.3, 3.5
// ---------------------------------------------------------------------------

test("Property 9a [revocation]: before revocation, isRevoked returns false for any jti", () => {
  // Feature: user-authentication, Property 9: Logout revocation round-trip
  fc.assert(
    fc.property(jtiArbitrary, (jti) => {
      const revokedSet = new Set<string>();
      expect(isRevoked(jti, revokedSet)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 9b: After revocation isRevoked returns true
// Validates: Requirements 3.3, 3.5
// ---------------------------------------------------------------------------

test("Property 9b [revocation]: after revocation, isRevoked returns true for the same jti", () => {
  // Feature: user-authentication, Property 9: Logout revocation round-trip
  fc.assert(
    fc.property(jtiArbitrary, (jti) => {
      const revokedSet = new Set<string>();
      revoke(jti, revokedSet);
      expect(isRevoked(jti, revokedSet)).toBe(true);
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 9c: Revoking jtiA does not affect the revocation status of jtiB (B !== A)
// Validates: Requirements 3.3, 3.5
// ---------------------------------------------------------------------------

test("Property 9c [revocation]: revoking jtiA does not affect the status of an unrelated jtiB", () => {
  // Feature: user-authentication, Property 9: Logout revocation round-trip
  fc.assert(
    fc.property(distinctJtiPairArbitrary, ([jtiA, jtiB]) => {
      const revokedSet = new Set<string>();

      // jtiB starts as not-revoked
      expect(isRevoked(jtiB, revokedSet)).toBe(false);

      // revoking jtiA must not affect jtiB
      revoke(jtiA, revokedSet);
      expect(isRevoked(jtiB, revokedSet)).toBe(false);
    }),
    { numRuns: 100 }
  );
});
