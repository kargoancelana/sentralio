/**
 * Feature: user-authentication, Property 5: safeRedirectPath accepts only same-origin paths
 * Validates: Requirements 1.8
 */

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '../redirect';

describe('safeRedirectPath – Property 5: safeRedirectPath accepts only same-origin paths', () => {
  /**
   * Property 5a: Any string starting with `/` but NOT `//` is returned as-is (valid same-origin path).
   */
  it('returns the path as-is for valid same-origin paths (starts with / but not //)', () => {
    fc.assert(
      fc.property(
        // Generate strings that start with / but not //
        // Strategy: concatenate "/" + a char that is not "/" + an arbitrary suffix
        fc.tuple(
          // First non-slash character after the leading /
          fc.string({ minLength: 1, maxLength: 1 }).filter((c) => c !== '/'),
          fc.string()
        ).map(([c, rest]) => '/' + c + rest),
        (path) => {
          expect(safeRedirectPath(path)).toBe(path);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5a (edge): the bare "/" is also a valid same-origin path.
   */
  it('returns "/" as-is (minimal valid same-origin path)', () => {
    expect(safeRedirectPath('/')).toBe('/');
  });

  /**
   * Property 5b: Any string starting with `//` returns `/` (scheme-relative URL blocked).
   */
  it('returns "/" for scheme-relative URLs starting with //', () => {
    fc.assert(
      fc.property(
        fc.string().map((s) => '//' + s),
        (path) => {
          expect(safeRedirectPath(path)).toBe('/');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5c: Any string NOT starting with `/` returns `/`
   * (absolute URLs, empty string, relative paths, etc. are all blocked).
   */
  it('returns "/" for strings that do not start with /', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          // Absolute URLs with scheme
          fc.string().map((s) => 'http://' + s),
          fc.string().map((s) => 'https://' + s),
          // Backslash-prefixed paths
          fc.string().map((s) => '\\' + s),
          // Arbitrary strings that don't start with /
          fc.string().filter((s) => s.length > 0 && !s.startsWith('/'))
        ),
        (path) => {
          fc.pre(!path.startsWith('/'));
          expect(safeRedirectPath(path)).toBe('/');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5d: safeRedirectPath is idempotent:
   * safeRedirectPath(safeRedirectPath(x)) === safeRedirectPath(x)
   */
  it('is idempotent: applying safeRedirectPath twice yields the same result', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (path) => {
          const once = safeRedirectPath(path);
          const twice = safeRedirectPath(once);
          expect(twice).toBe(once);
        }
      ),
      { numRuns: 100 }
    );
  });
});
