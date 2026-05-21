/**
 * Shared period validation utility for HPP and Biaya Packing entries.
 * Implements overlap detection, auto-close logic, and date validation.
 */

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Period {
  startDate: string;      // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD or null (open-ended)
}

export interface ExistingEntry extends Period {
  id: number;
  value: number;
}

export interface OverlapCheckResult {
  hasOverlap: boolean;
  conflictingEntry?: {
    id: number;
    startDate: string;
    endDate: string | null;
    value: number;
  };
}

export interface AutoCloseResult {
  shouldAutoClose: boolean;
  entryToClose?: { id: number; newEndDate: string };
  rejected?: boolean;
  rejectionReason?: string;
}

export interface DateValidationResult {
  valid: boolean;
  error?: string;
  field?: string;
}

// ─── Date Helpers ──────────────────────────────────────────────────────────────

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that a string is a valid YYYY-MM-DD date.
 * Checks both format and calendar validity.
 */
export function validateDateFormat(date: string): boolean {
  if (!DATE_FORMAT_REGEX.test(date)) return false;
  const parsed = new Date(date);
  // Ensure the date is valid (e.g. not 2024-02-30)
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

/**
 * Returns the date one day before the given YYYY-MM-DD date string.
 */
export function subtractOneDay(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Core Validation Functions ─────────────────────────────────────────────────

/**
 * Determines whether two periods overlap.
 *
 * Two periods overlap when both conditions are true:
 *   - start_a <= end_b  (or end_b is null, meaning B extends indefinitely)
 *   - start_b <= end_a  (or end_a is null, meaning A extends indefinitely)
 *
 * Requirement 14.1
 */
export function periodsOverlap(a: Period, b: Period): boolean {
  const aStartBeforeBEnd = b.endDate === null || a.startDate <= b.endDate;
  const bStartBeforeAEnd = a.endDate === null || b.startDate <= a.endDate;
  return aStartBeforeBEnd && bStartBeforeAEnd;
}

/**
 * Checks whether a new period overlaps with any of the provided existing entries.
 * Only non-deleted (active) entries should be passed in.
 *
 * Requirements 14.2, 14.3
 */
export function checkOverlap(
  newPeriod: Period,
  existingEntries: ExistingEntry[],
  excludeId?: number,
): OverlapCheckResult {
  for (const entry of existingEntries) {
    // When updating an entry, exclude itself from the overlap check
    if (excludeId !== undefined && entry.id === excludeId) continue;

    if (periodsOverlap(newPeriod, entry)) {
      return {
        hasOverlap: true,
        conflictingEntry: {
          id: entry.id,
          startDate: entry.startDate,
          endDate: entry.endDate,
          value: entry.value,
        },
      };
    }
  }

  return { hasOverlap: false };
}

/**
 * Determines whether an existing open-ended entry should be auto-closed when
 * a new entry is being created for the same entity.
 *
 * Rules:
 *   - If the new entry has a defined endDate that is before the existing entry's
 *     startDate, there is no overlap → skip auto-close entirely (return no-op).
 *   - If newStartDate > existingEntry.startDate → auto-close existing entry
 *     by setting its endDate to newStartDate - 1 day.
 *   - If newStartDate <= existingEntry.startDate AND the new entry overlaps
 *     with the existing entry → reject creation.
 *
 * Requirements 1.5, 1.6, 6.4, 6.5
 */
export function determineAutoClose(
  newStartDate: string,
  existingOpenEntry: { id: number; startDate: string },
  newEndDate?: string | null,
): AutoCloseResult {
  // If the new entry has a defined end date that ends before the existing
  // open-ended entry starts, there's no overlap and no auto-close needed.
  if (newEndDate != null && newEndDate < existingOpenEntry.startDate) {
    return { shouldAutoClose: false };
  }

  if (newStartDate > existingOpenEntry.startDate) {
    return {
      shouldAutoClose: true,
      entryToClose: {
        id: existingOpenEntry.id,
        newEndDate: subtractOneDay(newStartDate),
      },
    };
  }

  // newStartDate <= existingOpenEntry.startDate → reject
  return {
    shouldAutoClose: false,
    rejected: true,
    rejectionReason: `New start date must be after existing entry's start date (${existingOpenEntry.startDate})`,
  };
}

/**
 * Validates a period's dates:
 *   - Both startDate and endDate (if provided) must be in YYYY-MM-DD format.
 *   - endDate, if specified, must be >= startDate.
 *
 * Requirements 2.6, 6.1
 */
export function validatePeriod(
  startDate: string,
  endDate?: string | null,
): DateValidationResult {
  if (!startDate) {
    return { valid: false, error: "Start date is required", field: "startDate" };
  }

  if (!validateDateFormat(startDate)) {
    return {
      valid: false,
      error: "Date must be in YYYY-MM-DD format",
      field: "startDate",
    };
  }

  if (endDate != null) {
    if (!validateDateFormat(endDate)) {
      return {
        valid: false,
        error: "Date must be in YYYY-MM-DD format",
        field: "endDate",
      };
    }

    if (endDate < startDate) {
      return {
        valid: false,
        error: "End date must be on or after start date",
        field: "endDate",
      };
    }
  }

  return { valid: true };
}
