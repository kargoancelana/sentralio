/**
 * Feature: user-authentication, Property 11: Authorization matrix is a pure total function
 *
 * Validates: Requirements 5.4, 5.5, 5.10, 11.1, 11.2, 11.5
 */

import * as fc from "fast-check";
import { test, expect, describe } from "bun:test";
import { decide, visibleNavFor, FEATURES, type Role, type Feature } from "../matrix";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Every valid role value. */
const roleArb: fc.Arbitrary<Role> = fc.constantFrom<Role>("admin", "staff");

/** Every valid feature value. */
const featureArb: fc.Arbitrary<Feature> = fc.constantFrom<Feature>(...FEATURES);

// ---------------------------------------------------------------------------
// Property 11a: decide is a pure total function
// For every valid (role, feature) pair, decide always returns a boolean —
// it never throws and never returns undefined or null.
// ---------------------------------------------------------------------------

describe("Property 11: Authorization matrix is a pure total function", () => {
  test("11a: decide always returns a boolean for every valid (role, feature) pair", () => {
    fc.assert(
      fc.property(roleArb, featureArb, (role, feature) => {
        let result: boolean;
        expect(() => {
          result = decide(role, feature);
        }).not.toThrow();
        // result is assigned synchronously inside the non-throwing block
        expect(typeof result!).toBe("boolean");
        expect(result!).not.toBeNull();
        expect(result!).not.toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 11b: The matrix is pinned exactly to the Requirement 11.1 table
  // Test each specific cell against the expected values.
  // -------------------------------------------------------------------------

  test("11b: admin role has full access — all 9 features return true", () => {
    fc.assert(
      fc.property(featureArb, (feature) => {
        expect(decide("admin", feature)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test("11b: staff role — orders returns true (Req 11.1)", () => {
    expect(decide("staff", "orders")).toBe(true);
  });

  test("11b: staff role — cetak_label returns true (Req 11.1)", () => {
    expect(decide("staff", "cetak_label")).toBe(true);
  });

  test("11b: staff role — me_logout returns true (Req 11.1)", () => {
    expect(decide("staff", "me_logout")).toBe(true);
  });

  test("11b: staff role — master_produk returns false (Req 11.1)", () => {
    expect(decide("staff", "master_produk")).toBe(false);
  });

  test("11b: staff role — produk_channel returns false (Req 11.1)", () => {
    expect(decide("staff", "produk_channel")).toBe(false);
  });

  test("11b: staff role — integrasi_toko returns false (Req 11.1)", () => {
    expect(decide("staff", "integrasi_toko")).toBe(false);
  });

  test("11b: staff role — pengaturan returns false (Req 11.1)", () => {
    expect(decide("staff", "pengaturan")).toBe(false);
  });

  test("11b: staff role — laporan_keuangan returns false (Req 11.1)", () => {
    expect(decide("staff", "laporan_keuangan")).toBe(false);
  });

  test("11b: staff role — user_management returns false (Req 11.1)", () => {
    expect(decide("staff", "user_management")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Property 11c: visibleNavFor('admin') returns all 9 features
  // -------------------------------------------------------------------------

  test("11c: visibleNavFor('admin') returns all 9 features", () => {
    fc.assert(
      fc.property(fc.constant("admin" as Role), (role) => {
        const visible = visibleNavFor(role);
        expect(visible).toHaveLength(9);
        // Every feature must be present
        for (const feature of FEATURES) {
          expect(visible).toContain(feature);
        }
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 11d: visibleNavFor('staff') returns exactly
  // ['orders', 'cetak_label', 'me_logout']
  // -------------------------------------------------------------------------

  test("11d: visibleNavFor('staff') returns exactly ['orders', 'cetak_label', 'me_logout']", () => {
    fc.assert(
      fc.property(fc.constant("staff" as Role), (role) => {
        const visible = visibleNavFor(role);
        expect(visible).toHaveLength(3);
        expect(visible).toContain("orders");
        expect(visible).toContain("cetak_label");
        expect(visible).toContain("me_logout");
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 11e: For any role, visibleNavFor(role) returns only features
  // where decide(role, feature) is true.
  // -------------------------------------------------------------------------

  test("11e: visibleNavFor(role) contains only features where decide(role, feature) is true", () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const visible = visibleNavFor(role);
        // Every feature in the visible list must be allowed by decide
        for (const feature of visible) {
          expect(decide(role, feature)).toBe(true);
        }
        // Every feature allowed by decide must be in the visible list
        for (const feature of FEATURES) {
          if (decide(role, feature)) {
            expect(visible).toContain(feature);
          } else {
            expect(visible).not.toContain(feature);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
