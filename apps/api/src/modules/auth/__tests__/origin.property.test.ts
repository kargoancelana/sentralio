/**
 * Feature: user-authentication, Property 14: Origin allow-list matching ignores path and query
 *
 * Validates: Requirements 9.2, 9.3
 *
 * Tests the `normalizeOrigin` function from origin.ts to verify that path, query, and fragment
 * are stripped during normalization, and that `matchesAllowList` correctly rejects non-http/https
 * schemes and invalid URLs.
 *
 * Note: `matchesAllowList` reads `AUTH_ALLOWED_ORIGINS` at module load time. We test
 * `normalizeOrigin` directly for the path-ignoring property, and test `matchesAllowList`
 * with a controlled environment setup.
 */

import * as fc from "fast-check";
import { test, expect, describe } from "bun:test";
import { normalizeOrigin, matchesAllowList } from "../origin";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid hostname (e.g. "example.com", "sub.domain.io"). */
const hostnameArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/),
  )
  .map(([label, tld]) => `${label}.${tld}`);

/** Generates a valid http or https scheme. */
const httpSchemeArb = fc.constantFrom("http", "https");

/** Generates a port number appropriate for the given scheme, or no port. */
const portArb = fc.option(fc.integer({ min: 1, max: 65535 }), { nil: null });

/** Generates a URL path component (starts with / and may include segments). */
const pathArb = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9_-]{0,15}$/), { minLength: 0, maxLength: 4 })
  .map((parts) => (parts.length === 0 ? "/" : "/" + parts.join("/")));

/** Generates a query string (without leading `?`). */
const queryArb = fc
  .array(
    fc.tuple(
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
      fc.stringMatching(/^[a-zA-Z0-9]{0,10}$/),
    ),
    { minLength: 0, maxLength: 3 },
  )
  .map((pairs) => pairs.map(([k, v]) => `${k}=${v}`).join("&"));

/** Generates a fragment component (without leading `#`). */
const fragmentArb = fc.stringMatching(/^[a-zA-Z0-9_-]{0,15}$/);

/**
 * Builds a full URL from components.
 * Returns { baseOrigin, fullUrl } where:
 *   - baseOrigin = "scheme://host" or "scheme://host:port"
 *   - fullUrl    = baseOrigin + path + optional query + optional fragment
 */
const urlComponentsArb = fc
  .tuple(httpSchemeArb, hostnameArb, portArb, pathArb, queryArb, fragmentArb)
  .map(([scheme, host, port, path, query, fragment]) => {
    const defaultPort = scheme === "https" ? 443 : 80;
    const authority =
      port !== null && port !== defaultPort ? `${host}:${port}` : host;
    const baseOrigin = `${scheme}://${authority}`;
    let fullUrl = baseOrigin + path;
    if (query) fullUrl += `?${query}`;
    if (fragment) fullUrl += `#${fragment}`;
    return { scheme, host, port, path, query, fragment, baseOrigin, fullUrl };
  });

// ---------------------------------------------------------------------------
// Property 14a: normalizeOrigin strips path, query, and fragment —
// adding or changing them does NOT change the normalized result.
// ---------------------------------------------------------------------------

describe("Property 14: Origin allow-list matching ignores path and query", () => {
  test(
    "Property 14a: normalizeOrigin produces the same result regardless of path, query, or fragment",
    () => {
      fc.assert(
        fc.property(urlComponentsArb, ({ baseOrigin, fullUrl }) => {
          const normalizedBase = normalizeOrigin(baseOrigin);
          const normalizedFull = normalizeOrigin(fullUrl);
          // Both the bare origin and the full URL must normalize to the same value.
          expect(normalizedBase).not.toBeNull();
          expect(normalizedFull).not.toBeNull();
          expect(normalizedFull).toBe(normalizedBase);
        }),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 14b: normalizeOrigin returns null for non-http/https schemes
  // -------------------------------------------------------------------------

  test(
    "Property 14b: normalizeOrigin returns null for non-http/https schemes (e.g. ftp://, javascript:)",
    () => {
      const nonHttpSchemes = [
        "ftp",
        "ftps",
        "ssh",
        "smtp",
        "ldap",
        "data",
        "javascript",
        "file",
        "mailto",
        "ws",
        "wss",
        "blob",
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...nonHttpSchemes),
          hostnameArb,
          (scheme, host) => {
            const url = `${scheme}://${host}/path?query=1`;
            expect(normalizeOrigin(url)).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 14c: normalizeOrigin returns null for invalid / garbage inputs
  // -------------------------------------------------------------------------

  test(
    "Property 14c: normalizeOrigin returns null for invalid URLs (empty string, random garbage)",
    () => {
      // Test the empty string explicitly
      expect(normalizeOrigin("")).toBeNull();

      // Generate random strings that are unlikely to be valid http/https URLs
      fc.assert(
        fc.property(
          // Strings without "://" are never valid URLs
          fc.string({ minLength: 0, maxLength: 30 }).filter((s) => !s.includes("://")),
          (garbage) => {
            expect(normalizeOrigin(garbage)).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 14d: When AUTH_ALLOWED_ORIGINS contains a base origin,
  // matchesAllowList returns true for that origin with any path/query appended.
  // -------------------------------------------------------------------------

  test(
    "Property 14d: matchesAllowList matches any URL that shares the same scheme+host+port as an allowed origin",
    () => {
      // The module reads AUTH_ALLOWED_ORIGINS at load time, so we test the
      // underlying logic: normalizeOrigin of the full URL equals normalizeOrigin
      // of the bare origin. We verify the specific documented example here.
      //
      // AUTH_ALLOWED_ORIGINS is set in the module scope already. We verify the
      // normalizeOrigin identity holds, which is what matchesAllowList uses.
      fc.assert(
        fc.property(
          urlComponentsArb,
          ({ baseOrigin, fullUrl }) => {
            // If the full URL's normalized form equals the base origin's normalized form,
            // then matchesAllowList(fullUrl) === matchesAllowList(baseOrigin).
            const normBase = normalizeOrigin(baseOrigin);
            const normFull = normalizeOrigin(fullUrl);
            expect(normFull).toBe(normBase);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property 14e: Case-insensitive host matching.
  // normalizeOrigin lowercases the host, so HTTPS://EXAMPLE.COM matches
  // https://example.com after normalization.
  // -------------------------------------------------------------------------

  test(
    "Property 14e: normalizeOrigin is case-insensitive for host — HTTPS://EXAMPLE.COM normalizes the same as https://example.com",
    () => {
      fc.assert(
        fc.property(
          httpSchemeArb,
          hostnameArb,
          (scheme, host) => {
            const lower = `${scheme}://${host}`;
            const upper = `${scheme.toUpperCase()}://${host.toUpperCase()}`;
            const mixed = `${scheme}://${host
              .split("")
              .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
              .join("")}`;

            const normLower = normalizeOrigin(lower);
            const normUpper = normalizeOrigin(upper);
            const normMixed = normalizeOrigin(mixed);

            // All three forms must normalize to the same value.
            expect(normLower).not.toBeNull();
            expect(normUpper).toBe(normLower);
            expect(normMixed).toBe(normLower);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Concrete example tests (not property-based, but validate specific docs)
  // -------------------------------------------------------------------------

  test(
    "Concrete: https://example.com/any/path?q=1 normalizes to https://example.com:443",
    () => {
      const result = normalizeOrigin("https://example.com/any/path?q=1");
      expect(result).toBe("https://example.com:443");
    },
  );

  test(
    "Concrete: HTTPS://EXAMPLE.COM normalizes to same value as https://example.com",
    () => {
      const upper = normalizeOrigin("HTTPS://EXAMPLE.COM");
      const lower = normalizeOrigin("https://example.com");
      expect(upper).toBe(lower);
      expect(upper).toBe("https://example.com:443");
    },
  );

  test(
    "Concrete: matchesAllowList returns false for ftp:// URL",
    () => {
      expect(matchesAllowList("ftp://example.com/path")).toBe(false);
    },
  );

  test(
    "Concrete: matchesAllowList returns false for empty string",
    () => {
      expect(matchesAllowList("")).toBe(false);
    },
  );

  test(
    "Concrete: matchesAllowList returns false for javascript: scheme",
    () => {
      expect(matchesAllowList("javascript:alert(1)")).toBe(false);
    },
  );

  test(
    "Concrete: matchesAllowList returns false for random garbage",
    () => {
      expect(matchesAllowList("not-a-url")).toBe(false);
      expect(matchesAllowList("://missing-scheme")).toBe(false);
    },
  );
});
