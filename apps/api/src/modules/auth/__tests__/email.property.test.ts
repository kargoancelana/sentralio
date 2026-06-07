/**
 * Property-based tests for email helpers.
 *
 * Feature: user-authentication
 * Property 3: Email syntax validation returns 400 iff the syntax predicate fails
 * Validates: Requirements 1.6
 */

import * as fc from "fast-check";
import { test, expect } from "bun:test";
import { isValidEmailSyntax } from "../email";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Alphanumeric word with a given min/max length (shrink-safe). */
const alphaNum = (minLength: number, maxLength: number) =>
  fc
    .array(
      fc.constantFrom(...("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""))),
      { minLength, maxLength }
    )
    .map((chars) => chars.join(""));

/**
 * A string with NO '@' character.
 * Built from alphanumeric characters and common email-adjacent symbols, all of
 * which are guaranteed to never be '@'.
 */
const noAtString = alphaNum(0, 300);

/**
 * A string with at least TWO '@' characters.
 * Pattern: <word>@<word>@<word>
 */
const multiAtString = fc
  .tuple(alphaNum(1, 50), alphaNum(1, 50), alphaNum(1, 50))
  .map(([a, b, c]) => `${a}@${b}@${c}`);

/**
 * An email-shaped string whose local part is EMPTY.
 * Pattern: @<word>.<word>
 */
const emptyLocalPartEmail = fc
  .tuple(alphaNum(1, 50), alphaNum(1, 50))
  .map(([pre, suf]) => `@${pre}.${suf}`);

/**
 * An email-shaped string whose LOCAL PART is LONGER THAN 64 characters.
 * We pad the local part to exactly (64 + pad) where pad >= 1.
 */
const longLocalPartEmail = fc
  .tuple(
    alphaNum(1, 64),           // base local (will be padded)
    fc.integer({ min: 1, max: 66 }), // pad amount → local.length = base.length + pad, but we just need > 64
    alphaNum(1, 20),           // domain prefix
    alphaNum(1, 20),           // domain suffix
  )
  .map(([base, pad, pre, suf]) => {
    // Ensure local part length > 64
    const local = base.padEnd(65 + (pad - 1), "a"); // length = max(base.length, 65 + pad - 1) >= 65
    return `${local}@${pre}.${suf}`;
  })
  // Safety: ensure local truly > 64 after map (shrinking-safe guard)
  .filter((email) => {
    const atIdx = email.indexOf("@");
    return atIdx > 64;
  });

/**
 * An email-shaped string whose DOMAIN HAS NO '.'.
 * Pattern: <word>@<word>   — domain is a single word with no dot.
 */
const noDotInDomainEmail = fc
  .tuple(alphaNum(1, 64), alphaNum(1, 60))
  .map(([local, domain]) => `${local}@${domain}`);

/**
 * A string with exactly one '@' and TOTAL LENGTH > 254.
 * We pad the local part so the email exceeds 254 chars.
 */
const tooLongEmail = fc
  .tuple(
    alphaNum(1, 50),   // domain prefix
    alphaNum(1, 50),   // domain suffix
    fc.integer({ min: 1, max: 100 }), // extra padding beyond 254
  )
  .map(([pre, suf, extra]) => {
    const domain = `${pre}.${suf}`;
    // local must be long enough so local.length + 1 + domain.length > 254
    const localLength = 254 - domain.length + extra; // = 254 - domain.length + extra > 254 - domain.length, total = localLength + 1 + domain.length = 254 + extra + 1 > 254
    const local = "a".repeat(Math.max(1, localLength));
    return `${local}@${domain}`;
  })
  .filter((email) => email.length > 254 && (email.match(/@/g)?.length ?? 0) === 1);

/**
 * A WELL-FORMED email satisfying ALL constraints:
 *  - exactly one '@'
 *  - local part: 1–64 chars
 *  - domain: <word>.<word>  (contains '.', no '@')
 *  - total length ≤ 254
 */
const wellFormedEmail = fc
  .tuple(alphaNum(1, 64), alphaNum(1, 90), alphaNum(1, 90))
  .map(([local, pre, suf]) => `${local}@${pre}.${suf}`)
  .filter((email) => email.length <= 254);

// ---------------------------------------------------------------------------
// Property 3: Email syntax validation returns 400 iff the syntax predicate fails
// ---------------------------------------------------------------------------

test("Property 3 [invalid - no @ symbol]: isValidEmailSyntax returns false for strings without @", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(noAtString, (s) => {
      expect(isValidEmailSyntax(s)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test("Property 3 [invalid - multiple @ symbols]: isValidEmailSyntax returns false for strings with 2+ @", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(multiAtString, (s) => {
      expect(isValidEmailSyntax(s)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test("Property 3 [invalid - empty local part]: isValidEmailSyntax returns false when local part length is 0", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(emptyLocalPartEmail, (s) => {
      expect(isValidEmailSyntax(s)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test("Property 3 [invalid - local part > 64 chars]: isValidEmailSyntax returns false when local part is longer than 64 chars", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(longLocalPartEmail, (s) => {
      expect(isValidEmailSyntax(s)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test("Property 3 [invalid - no dot in domain]: isValidEmailSyntax returns false when domain contains no '.'", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(noDotInDomainEmail, (s) => {
      expect(isValidEmailSyntax(s)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test("Property 3 [invalid - total length > 254]: isValidEmailSyntax returns false when total length exceeds 254 characters", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(tooLongEmail, (s) => {
      expect(isValidEmailSyntax(s)).toBe(false);
    }),
    { numRuns: 100 }
  );
});

test("Property 3 [valid - well-formed emails]: isValidEmailSyntax returns true for well-formed emails", () => {
  // Feature: user-authentication, Property 3: Email syntax validation returns 400 iff the syntax predicate fails
  fc.assert(
    fc.property(wellFormedEmail, (s) => {
      expect(isValidEmailSyntax(s)).toBe(true);
    }),
    { numRuns: 100 }
  );
});
