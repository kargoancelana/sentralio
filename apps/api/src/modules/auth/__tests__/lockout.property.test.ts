/**
 * Feature: user-authentication, Property 12: Lockout threshold, counting rules, reset, and auto-clear
 *
 * Model-based property test for the PURE lockout reference state machine in
 * `../lockout.ts`. A sequence of events ({fail, success, check}) is generated and
 * applied to the production state machine while an INDEPENDENT reference model —
 * which encodes the lockout rules from scratch (count timestamps within the
 * sliding window, lock on the 5th, auto-clear by time) — is advanced in parallel.
 * After every event the two are asserted to agree.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as fc from "fast-check";
import { test, expect, describe } from "bun:test";
import {
  emptyLockoutState,
  pureIsLocked,
  pureRecordFailure,
  pureResetOnSuccess,
  WINDOW_MS,
  LOCK_MS,
  THRESHOLD,
  type LockoutState,
} from "../lockout";

// ---------------------------------------------------------------------------
// Independent reference model
//
// This is a DELIBERATELY SEPARATE implementation of the lockout rules. It does
// NOT call the production functions; instead it keeps the raw list of counted
// failure timestamps and re-derives the locked state by counting timestamps
// that fall inside the sliding window. If the production state machine and this
// model ever disagree, the test fails — so the test genuinely validates
// behavior rather than comparing the implementation to itself.
// ---------------------------------------------------------------------------

interface RefModel {
  /** All COUNTED failure timestamps (epoch ms), in the order they occurred. */
  countedFailures: number[];
  /** Epoch-ms instant the lockout expires, or null when never locked / cleared. */
  lockedUntil: number | null;
}

function refEmpty(): RefModel {
  return { countedFailures: [], lockedUntil: null };
}

/** Reference predicate: locked iff lockedUntil is set and strictly in the future. */
function refIsLocked(m: RefModel, nowMs: number): boolean {
  return m.lockedUntil !== null && m.lockedUntil > nowMs;
}

/** Reference transition for a failure event. */
function refRecordFailure(m: RefModel, nowMs: number): RefModel {
  // Rule 8.1c: an attempt blocked by an active lockout is NOT counted.
  if (refIsLocked(m, nowMs)) {
    return { countedFailures: [...m.countedFailures], lockedUntil: m.lockedUntil };
  }

  // Count failures strictly inside the sliding window ending at nowMs, plus
  // this new one. We re-derive from the full counted history independently.
  const windowStart = nowMs - WINDOW_MS;
  const inWindow = m.countedFailures.filter((t) => t > windowStart);
  const countWithCurrent = inWindow.length + 1;

  const countedFailures = [...m.countedFailures, nowMs];

  if (countWithCurrent >= THRESHOLD) {
    return { countedFailures, lockedUntil: nowMs + LOCK_MS };
  }
  return { countedFailures, lockedUntil: null };
}

/** Reference transition for a successful login. */
function refResetOnSuccess(_m: RefModel): RefModel {
  return refEmpty();
}

// ---------------------------------------------------------------------------
// Event generators
// ---------------------------------------------------------------------------

type Event =
  | { type: "fail"; dtMs: number }
  | { type: "success" }
  | { type: "check"; dtMs: number };

// Time deltas span sub-window, around-window, and well-past-lockout gaps so the
// sliding window, threshold, and auto-clear behaviors are all exercised.
const dtArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 60_000 }), // seconds-to-1min apart (bunch up failures)
  fc.integer({ min: 60_000, max: WINDOW_MS }), // within / at the window edge
  fc.integer({ min: WINDOW_MS, max: 2 * WINDOW_MS }), // past the window
  fc.integer({ min: LOCK_MS, max: 3 * LOCK_MS }), // past a lockout (auto-clear)
);

const eventArb: fc.Arbitrary<Event> = fc.oneof(
  fc.record({ type: fc.constant("fail" as const), dtMs: dtArb }),
  fc.record({ type: fc.constant("success" as const) }),
  fc.record({ type: fc.constant("check" as const), dtMs: dtArb }),
);

const eventsArb: fc.Arbitrary<Event[]> = fc.array(eventArb, { minLength: 1, maxLength: 40 });

describe("Property 12: Lockout threshold, counting rules, reset, and auto-clear", () => {
  // -------------------------------------------------------------------------
  // 12-model: model-based equivalence across arbitrary event sequences
  //
  // Drives the production state machine and the independent reference model
  // through the same sequence of events, advancing a shared clock, and asserts
  // they agree on lock state after every event.
  // -------------------------------------------------------------------------
  test("12-model: production state machine agrees with the independent reference model", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), eventsArb, (startMs, events) => {
        let prod: LockoutState = emptyLockoutState();
        let model: RefModel = refEmpty();
        let nowMs = startMs;

        for (const ev of events) {
          if (ev.type === "fail") {
            nowMs += ev.dtMs;
            prod = pureRecordFailure(prod, nowMs);
            model = refRecordFailure(model, nowMs);
          } else if (ev.type === "success") {
            prod = pureResetOnSuccess(prod);
            model = refResetOnSuccess(model);
          } else {
            nowMs += ev.dtMs;
          }

          // The two implementations must agree on lock status at the current time.
          expect(pureIsLocked(prod, nowMs)).toBe(refIsLocked(model, nowMs));
        }
      }),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // 12a: Threshold — 5 in-window failures lock; fewer than 5 do not (Req 8.1, 8.2)
  // -------------------------------------------------------------------------
  test("12a: THRESHOLD in-window failures lock at the 5th; fewer do not", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        // Small gaps that keep all failures comfortably inside one window.
        fc.array(fc.integer({ min: 0, max: Math.floor(WINDOW_MS / (THRESHOLD + 2)) }), {
          minLength: THRESHOLD,
          maxLength: THRESHOLD,
        }),
        (startMs, gaps) => {
          let state = emptyLockoutState();
          let nowMs = startMs;

          for (let i = 0; i < gaps.length; i++) {
            nowMs += gaps[i];
            const before = state;
            state = pureRecordFailure(state, nowMs);

            const failuresSoFar = i + 1;
            if (failuresSoFar < THRESHOLD) {
              // Not yet at the threshold → must not be locked.
              expect(pureIsLocked(state, nowMs)).toBe(false);
            } else {
              // The THRESHOLD-th in-window failure locks at this instant.
              expect(pureIsLocked(state, nowMs)).toBe(true);
              expect(state.lockedUntil).toBe(nowMs + LOCK_MS);
            }
            void before;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 12b: Counting rule — once locked, further failures don't change lockedUntil
  // and don't add to the counted failures (Req 8.1c)
  // -------------------------------------------------------------------------
  test("12b: lockout-blocked failures are not counted and do not extend the lockout", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        // Extra failure attempts while still locked, each a small gap apart but
        // strictly less than the remaining lock time in aggregate.
        fc.array(fc.integer({ min: 1, max: Math.floor(LOCK_MS / 10) }), { minLength: 1, maxLength: 5 }),
        (startMs, blockedGaps) => {
          // Drive to a locked state with THRESHOLD rapid failures.
          let state = emptyLockoutState();
          let nowMs = startMs;
          for (let i = 0; i < THRESHOLD; i++) {
            state = pureRecordFailure(state, nowMs);
          }
          expect(pureIsLocked(state, nowMs)).toBe(true);

          const lockedUntil = state.lockedUntil;
          const failureCount = state.failures.length;

          // Now attempt more failures while still locked.
          for (const gap of blockedGaps) {
            const next = nowMs + gap;
            // Stay inside the lock window so the attempt is genuinely blocked.
            if (!pureIsLocked(state, next)) break;
            nowMs = next;
            state = pureRecordFailure(state, nowMs);
            // lockedUntil unchanged and failure count unchanged.
            expect(state.lockedUntil).toBe(lockedUntil);
            expect(state.failures.length).toBe(failureCount);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 12c: Reset on success — empties state regardless of prior state (Req 8.4)
  // -------------------------------------------------------------------------
  test("12c: pureResetOnSuccess yields an empty, unlocked state for any prior state", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        eventsArb,
        (startMs, events) => {
          // Build up some arbitrary prior state via fail/success events.
          let state = emptyLockoutState();
          let nowMs = startMs;
          for (const ev of events) {
            if (ev.type === "fail") {
              nowMs += ev.dtMs;
              state = pureRecordFailure(state, nowMs);
            } else if (ev.type === "success") {
              state = pureResetOnSuccess(state);
            } else {
              nowMs += ev.dtMs;
            }
          }

          const reset = pureResetOnSuccess(state);
          expect(reset.failures).toEqual([]);
          expect(reset.lockedUntil).toBeNull();
          // And it is not locked at any time after reset.
          expect(pureIsLocked(reset, nowMs)).toBe(false);
          expect(pureIsLocked(reset, nowMs + LOCK_MS + 1)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 12d: Auto-clear — past lockedUntil, isLocked is false with no explicit clear (Req 8.5)
  // -------------------------------------------------------------------------
  test("12d: a lockout auto-clears once now passes lockedUntil, with no clear call", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 10 * LOCK_MS }),
        (startMs, advance) => {
          // Reach a locked state.
          let state = emptyLockoutState();
          let nowMs = startMs;
          for (let i = 0; i < THRESHOLD; i++) {
            state = pureRecordFailure(state, nowMs);
          }
          expect(pureIsLocked(state, nowMs)).toBe(true);
          const lockedUntil = state.lockedUntil!;

          const later = nowMs + advance;
          // No mutation of state — purely advance the observed time.
          const expectedLocked = lockedUntil > later;
          expect(pureIsLocked(state, later)).toBe(expectedLocked);

          // Strictly past expiry it must be cleared.
          expect(pureIsLocked(state, lockedUntil)).toBe(false);
          expect(pureIsLocked(state, lockedUntil + 1)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 12e: Sliding window — old failures age out; 4 old + 1 recent ≠ locked (Req 8.1)
  // -------------------------------------------------------------------------
  test("12e: failures older than WINDOW_MS before now do not count toward the threshold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        // How far in the past the first batch of (THRESHOLD - 1) failures occurs,
        // strictly more than one window before the recent failure.
        fc.integer({ min: WINDOW_MS + 1, max: 5 * WINDOW_MS }),
        (startMs, ageGap) => {
          let state = emptyLockoutState();
          // THRESHOLD - 1 failures long ago.
          const longAgo = startMs;
          for (let i = 0; i < THRESHOLD - 1; i++) {
            state = pureRecordFailure(state, longAgo);
          }
          // Not locked (only 4 failures).
          expect(pureIsLocked(state, longAgo)).toBe(false);

          // One recent failure, more than a full window later → old ones aged out.
          const recent = longAgo + ageGap;
          state = pureRecordFailure(state, recent);

          // Only the single recent in-window failure counts → not locked.
          expect(pureIsLocked(state, recent)).toBe(false);
          expect(state.failures.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
