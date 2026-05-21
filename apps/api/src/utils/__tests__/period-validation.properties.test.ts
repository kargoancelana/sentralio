/**
 * Property-based tests for period-validation.ts shared utility.
 *
 * Uses fast-check with bun:test runner.
 * Each property runs a minimum of 100 iterations.
 *
 * Properties covered:
 * - Property 1:  Overlap Detection Symmetry and Correctness
 * - Property 3:  Auto-Close Correctness
 * - Property 4:  Auto-Close Rejection
 * - Property 11: Date Validation
 *
 * **Validates: Requirements 14.1, 1.5, 1.6, 6.4, 6.5, 2.6**
 */

import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import {
  periodsOverlap,
  determineAutoClose,
  validatePeriod,
  subtractOneDay,
  type Period,
  type ExistingEntry,
} from "../period-validation";

// ─── Arbitraries ────────────────────────────────────────────────────────────

/**
 * Generates a random valid YYYY-MM-DD date string.
 * Uses integer offsets from a base epoch to avoid Invalid Date issues.
 * Range: 2000-01-01 to 2099-12-31 (36524 days).
 */
const BASE_DATE_MS = new Date("2000-01-01T00:00:00.000Z").getTime();
const MAX_OFFSET_DAYS = 36523; // 2099-12-31 is ~36523 days after 2000-01-01

const arbDate = (): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: MAX_OFFSET_DAYS }).map((offsetDays) => {
    const d = new Date(BASE_DATE_MS + offsetDays * 86400000);
    return d.toISOString().slice(0, 10);
  });

/**
 * Converts a YYYY-MM-DD string to an offset (days since 2000-01-01).
 */
function dateToOffset(date: string): number {
  return Math.round(
    (new Date(date + "T00:00:00.000Z").getTime() - BASE_DATE_MS) / 86400000
  );
}

/**
 * Converts an offset (days since 2000-01-01) to a YYYY-MM-DD string.
 */
function offsetToDate(offset: number): string {
  const d = new Date(BASE_DATE_MS + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Generates a random Period with a valid startDate and an optional endDate.
 * When endDate is present, it is guaranteed to be >= startDate.
 */
const arbPeriod = (): fc.Arbitrary<Period> =>
  fc
    .tuple(
      fc.integer({ min: 0, max: MAX_OFFSET_DAYS }),
      fc.boolean(),
      fc.integer({ min: 0, max: MAX_OFFSET_DAYS }),
    )
    .map(([startOffset, hasEndDate, endOffsetRaw]) => {
      const startDate = offsetToDate(startOffset);
      if (!hasEndDate) {
        return { startDate, endDate: null };
      }
      // endDate >= startDate: pick an offset >= startOffset
      const endOffset = startOffset + (endOffsetRaw % (MAX_OFFSET_DAYS - startOffset + 1));
      const endDate = offsetToDate(Math.min(endOffset, MAX_OFFSET_DAYS));
      return { startDate, endDate };
    });

/**
 * Generates a date string that is strictly after the given date.
 * Requires the input date to be before 2099-12-31.
 */
const arbDateAfter = (date: string): fc.Arbitrary<string> => {
  const startOffset = dateToOffset(date);
  const minOffset = startOffset + 1;
  if (minOffset > MAX_OFFSET_DAYS) {
    // Edge case: date is already at max — return same date (caller must handle)
    return fc.constant(date);
  }
  return fc
    .integer({ min: minOffset, max: MAX_OFFSET_DAYS })
    .map((offset) => offsetToDate(offset));
};

/**
 * Generates a date string that is strictly before the given date.
 * Returns null if the date is already at the minimum (2000-01-01).
 */
const arbDateBefore = (date: string): fc.Arbitrary<string | null> => {
  const endOffset = dateToOffset(date);
  const maxOffset = endOffset - 1;
  if (maxOffset < 0) {
    return fc.constant(null);
  }
  return fc
    .integer({ min: 0, max: maxOffset })
    .map((offset) => offsetToDate(offset));
};

/**
 * Generates an ExistingEntry with endDate: null (open-ended).
 * Uses a date range that allows at least one day before and after,
 * so arbDateAfter and arbDateBefore always have valid ranges.
 */
const arbOpenEndedEntry = (): fc.Arbitrary<ExistingEntry> =>
  fc
    .tuple(
      fc.integer({ min: 1, max: 100_000 }),
      // startDate in range [2000-01-02, 2099-12-30] to allow dates before and after
      fc.integer({ min: 1, max: MAX_OFFSET_DAYS - 1 }),
      fc.integer({ min: 1, max: 999_999_999 }),
    )
    .map(([id, startOffset, value]) => ({
      id,
      startDate: offsetToDate(startOffset),
      endDate: null,
      value,
    }));

// ─── Property 1: Overlap Detection Symmetry and Correctness ─────────────────

describe("Property 1: Overlap Detection Symmetry and Correctness", () => {
  // Feature: hpp-packing-cost, Property 1: Overlap Detection Symmetry and Correctness

  it("periodsOverlap(A, B) === periodsOverlap(B, A) for any two periods (symmetry)", () => {
    // **Validates: Requirements 14.1**
    fc.assert(
      fc.property(arbPeriod(), arbPeriod(), (a, b) => {
        expect(periodsOverlap(a, b)).toBe(periodsOverlap(b, a));
      }),
      { numRuns: 100 }
    );
  });

  it("periodsOverlap(A, B) is true iff (A.startDate <= B.endDate OR B.endDate is null) AND (B.startDate <= A.endDate OR A.endDate is null)", () => {
    // **Validates: Requirements 14.1**
    fc.assert(
      fc.property(arbPeriod(), arbPeriod(), (a, b) => {
        const result = periodsOverlap(a, b);

        const aStartBeforeBEnd = b.endDate === null || a.startDate <= b.endDate;
        const bStartBeforeAEnd = a.endDate === null || b.startDate <= a.endDate;
        const expected = aStartBeforeBEnd && bStartBeforeAEnd;

        expect(result).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it("two open-ended periods always overlap", () => {
    // **Validates: Requirements 14.1**
    fc.assert(
      fc.property(arbDate(), arbDate(), (startA, startB) => {
        const a: Period = { startDate: startA, endDate: null };
        const b: Period = { startDate: startB, endDate: null };
        expect(periodsOverlap(a, b)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("a period with the same start and end date overlaps with itself", () => {
    // **Validates: Requirements 14.1**
    fc.assert(
      fc.property(arbDate(), (date) => {
        const p: Period = { startDate: date, endDate: date };
        expect(periodsOverlap(p, p)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Auto-Close Correctness ─────────────────────────────────────

describe("Property 3: Auto-Close Correctness", () => {
  // Feature: hpp-packing-cost, Property 3: Auto-Close Correctness

  it("when N.startDate > E.startDate, determineAutoClose returns shouldAutoClose: true", () => {
    // **Validates: Requirements 1.5, 6.4**
    fc.assert(
      fc.property(
        arbOpenEndedEntry().chain((entry) =>
          arbDateAfter(entry.startDate).map((newStartDate) => ({ entry, newStartDate }))
        ),
        ({ entry, newStartDate }) => {
          // Guard: arbDateAfter may return same date if entry.startDate is at max
          if (newStartDate <= entry.startDate) return;
          const result = determineAutoClose(newStartDate, entry);
          expect(result.shouldAutoClose).toBe(true);
          expect(result.rejected).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when N.startDate > E.startDate, entryToClose.newEndDate equals subtractOneDay(N.startDate)", () => {
    // **Validates: Requirements 1.5, 6.4**
    fc.assert(
      fc.property(
        arbOpenEndedEntry().chain((entry) =>
          arbDateAfter(entry.startDate).map((newStartDate) => ({ entry, newStartDate }))
        ),
        ({ entry, newStartDate }) => {
          if (newStartDate <= entry.startDate) return;
          const result = determineAutoClose(newStartDate, entry);
          expect(result.entryToClose).toBeDefined();
          expect(result.entryToClose!.newEndDate).toBe(subtractOneDay(newStartDate));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when N.startDate > E.startDate, entryToClose.id matches the existing entry's id", () => {
    // **Validates: Requirements 1.5, 6.4**
    fc.assert(
      fc.property(
        arbOpenEndedEntry().chain((entry) =>
          arbDateAfter(entry.startDate).map((newStartDate) => ({ entry, newStartDate }))
        ),
        ({ entry, newStartDate }) => {
          if (newStartDate <= entry.startDate) return;
          const result = determineAutoClose(newStartDate, entry);
          expect(result.entryToClose!.id).toBe(entry.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Auto-Close Rejection ───────────────────────────────────────

describe("Property 4: Auto-Close Rejection", () => {
  // Feature: hpp-packing-cost, Property 4: Auto-Close Rejection

  it("when N.startDate === E.startDate, determineAutoClose returns rejected: true and shouldAutoClose: false", () => {
    // **Validates: Requirements 1.6, 6.5**
    fc.assert(
      fc.property(arbOpenEndedEntry(), (entry) => {
        // Same start date: N.startDate === E.startDate
        const result = determineAutoClose(entry.startDate, entry);
        expect(result.rejected).toBe(true);
        expect(result.shouldAutoClose).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("when N.startDate < E.startDate, determineAutoClose returns rejected: true and shouldAutoClose: false", () => {
    // **Validates: Requirements 1.6, 6.5**
    fc.assert(
      fc.property(
        arbOpenEndedEntry().chain((entry) =>
          arbDateBefore(entry.startDate).map((newStartDate) => ({ entry, newStartDate }))
        ),
        ({ entry, newStartDate }) => {
          // Skip if arbDateBefore returned null (entry.startDate is at minimum)
          if (newStartDate === null) return;
          const result = determineAutoClose(newStartDate, entry);
          expect(result.rejected).toBe(true);
          expect(result.shouldAutoClose).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when N.startDate <= E.startDate, entryToClose is undefined", () => {
    // **Validates: Requirements 1.6, 6.5**
    fc.assert(
      fc.property(arbOpenEndedEntry(), (entry) => {
        const result = determineAutoClose(entry.startDate, entry);
        expect(result.entryToClose).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Date Validation ───────────────────────────────────────────

describe("Property 11: Date Validation", () => {
  // Feature: hpp-packing-cost, Property 11: Date Validation

  it("when endDate < startDate, validatePeriod returns valid: false with field: 'endDate'", () => {
    // **Validates: Requirements 2.6**
    fc.assert(
      fc.property(
        // Generate two distinct offsets and use the larger as startDate, smaller as endDate
        fc.tuple(
          fc.integer({ min: 1, max: MAX_OFFSET_DAYS }),
          fc.integer({ min: 0, max: MAX_OFFSET_DAYS - 1 }),
        ).filter(([a, b]) => a > b),
        ([startOffset, endOffset]) => {
          const startDate = offsetToDate(startOffset);
          const endDate = offsetToDate(endOffset);
          // endDate < startDate guaranteed by filter
          const result = validatePeriod(startDate, endDate);
          expect(result.valid).toBe(false);
          expect(result.field).toBe("endDate");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when endDate >= startDate, validatePeriod returns valid: true", () => {
    // **Validates: Requirements 2.6**
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: MAX_OFFSET_DAYS }),
          fc.integer({ min: 0, max: MAX_OFFSET_DAYS }),
        ).map(([a, b]) => {
          const startOffset = Math.min(a, b);
          const endOffset = Math.max(a, b);
          return {
            startDate: offsetToDate(startOffset),
            endDate: offsetToDate(endOffset),
          };
        }),
        ({ startDate, endDate }) => {
          const result = validatePeriod(startDate, endDate);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when endDate is null (open-ended), validatePeriod returns valid: true", () => {
    // **Validates: Requirements 2.6**
    fc.assert(
      fc.property(arbDate(), (startDate) => {
        const result = validatePeriod(startDate, null);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("when endDate is undefined (not provided), validatePeriod returns valid: true", () => {
    // **Validates: Requirements 2.6**
    fc.assert(
      fc.property(arbDate(), (startDate) => {
        const result = validatePeriod(startDate);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("when endDate === startDate (same day), validatePeriod returns valid: true", () => {
    // **Validates: Requirements 2.6** — boundary: endDate == startDate is valid
    fc.assert(
      fc.property(arbDate(), (date) => {
        const result = validatePeriod(date, date);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
