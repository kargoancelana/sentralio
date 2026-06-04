/**
 * HPP (Harga Pokok Penjualan) Service
 *
 * Handles CRUD operations for HPP entries per master product variant,
 * including period validation, auto-close logic, soft delete, audit logging,
 * and HPP resolution for a given date.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { costAuditLog, hppEntries, masterProductVariants } from "../../db/schema";
import {
  checkOverlap,
  determineAutoClose,
  validatePeriod,
  type ExistingEntry,
} from "../../utils/period-validation";

// ─── Input Interfaces ──────────────────────────────────────────────────────────

export interface CreateHppEntryInput {
  variantId: number;
  hppValue: number;       // Rp 1 – Rp 999,999,999
  startDate: string;      // YYYY-MM-DD
  endDate?: string | null;
  note?: string | null;   // max 255 chars
  userId: string;
}

export interface UpdateHppEntryInput {
  id: number;
  hppValue: number;
  startDate: string;
  endDate?: string | null;
  note?: string | null;
  userId: string;
}

// ─── Result Interfaces ─────────────────────────────────────────────────────────

export interface HppResolutionResult {
  variantId: number;
  hppValue: number;
  entryId: number | null;
  source: "active" | "fallback" | "default";
}

export interface ServiceError {
  success: false;
  message: string;
  field?: string;
  conflict?: {
    id: number;
    startDate: string;
    endDate: string | null;
    value: number;
  };
}

export interface ServiceSuccess<T> {
  success: true;
  data: T;
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

// ─── Constants ─────────────────────────────────────────────────────────────────

const HPP_MIN = 1;
const HPP_MAX = 999_999_999;

// ─── Validation Helpers ────────────────────────────────────────────────────────

function validateHppValue(value: number): ServiceError | null {
  if (!Number.isInteger(value) || value < HPP_MIN || value > HPP_MAX) {
    return {
      success: false,
      message: `HPP value must be between Rp 1 and Rp 999,999,999`,
      field: "hppValue",
    };
  }
  return null;
}

function validateNote(note?: string | null): ServiceError | null {
  if (note != null && note.length > 255) {
    return {
      success: false,
      message: "Note must not exceed 255 characters",
      field: "note",
    };
  }
  return null;
}

// ─── Audit Log Helper ──────────────────────────────────────────────────────────

async function insertAuditLog(params: {
  entityId: number;
  action: "insert" | "update" | "delete";
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  userId: string;
}) {
  await db.insert(costAuditLog).values({
    entityType: "hpp",
    entityId: params.entityId,
    action: params.action,
    previousValues: params.previousValues ? JSON.stringify(params.previousValues) : null,
    newValues: params.newValues ? JSON.stringify(params.newValues) : null,
    userId: params.userId,
  });
}

// ─── Variant Existence Check ───────────────────────────────────────────────────

async function assertVariantExists(variantId: number): Promise<ServiceError | null> {
  const rows = await db
    .select({ id: masterProductVariants.id })
    .from(masterProductVariants)
    .where(eq(masterProductVariants.id, variantId))
    .limit(1);

  if (rows.length === 0) {
    return {
      success: false,
      message: `Variant with id=${variantId} not found`,
    };
  }
  return null;
}

// ─── Fetch Active Entries Helper ───────────────────────────────────────────────

async function fetchActiveEntries(variantId: number): Promise<ExistingEntry[]> {
  const rows = await db
    .select({
      id: hppEntries.id,
      startDate: hppEntries.startDate,
      endDate: hppEntries.endDate,
      hppValue: hppEntries.hppValue,
    })
    .from(hppEntries)
    .where(
      and(
        eq(hppEntries.variantId, variantId),
        isNull(hppEntries.deletedAt),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    endDate: r.endDate ?? null,
    value: r.hppValue,
  }));
}

// ─── createHppEntry ────────────────────────────────────────────────────────────

/**
 * Creates a new HPP entry for a variant.
 *
 * Steps:
 *  1. Validate HPP value range
 *  2. Validate period dates
 *  3. Validate note length
 *  4. Assert variant exists
 *  5. Fetch active entries for the variant
 *  6. Handle auto-close for any existing open-ended entry
 *  7. Check for period overlaps (excluding the entry being auto-closed)
 *  8. Insert the new entry
 *  9. Apply auto-close update if needed
 * 10. Insert audit log
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */
export async function createHppEntry(
  input: CreateHppEntryInput,
): Promise<ServiceResult<typeof hppEntries.$inferSelect>> {
  // 1. Validate HPP value
  const valueError = validateHppValue(input.hppValue);
  if (valueError) return valueError;

  // 2. Validate period
  const periodResult = validatePeriod(input.startDate, input.endDate);
  if (!periodResult.valid) {
    return {
      success: false,
      message: periodResult.error!,
      field: periodResult.field,
    };
  }

  // 3. Validate note
  const noteError = validateNote(input.note);
  if (noteError) return noteError;

  // 4. Assert variant exists
  const variantError = await assertVariantExists(input.variantId);
  if (variantError) return variantError;

  // 5. Fetch active entries
  const activeEntries = await fetchActiveEntries(input.variantId);

  // 6. Handle auto-close for open-ended entry
  const openEntry = activeEntries.find((e) => e.endDate === null);
  let autoCloseUpdate: { id: number; newEndDate: string } | null = null;

  if (openEntry) {
    const autoCloseResult = determineAutoClose(input.startDate, openEntry, input.endDate);

    if (autoCloseResult.rejected) {
      return {
        success: false,
        message: autoCloseResult.rejectionReason!,
      };
    }

    if (autoCloseResult.shouldAutoClose && autoCloseResult.entryToClose) {
      autoCloseUpdate = autoCloseResult.entryToClose;
    }
  }

  // 7. Check for period overlaps (exclude the entry being auto-closed)
  const newPeriod = { startDate: input.startDate, endDate: input.endDate ?? null };
  const entriesForOverlapCheck = autoCloseUpdate
    ? activeEntries.map((e) =>
        e.id === autoCloseUpdate!.id
          ? { ...e, endDate: autoCloseUpdate!.newEndDate }
          : e,
      )
    : activeEntries;

  const overlapResult = checkOverlap(newPeriod, entriesForOverlapCheck);
  if (overlapResult.hasOverlap && overlapResult.conflictingEntry) {
    return {
      success: false,
      message: "Period overlaps with existing entry",
      conflict: {
        id: overlapResult.conflictingEntry.id,
        startDate: overlapResult.conflictingEntry.startDate,
        endDate: overlapResult.conflictingEntry.endDate,
        value: overlapResult.conflictingEntry.value,
      },
    };
  }

  // 8. Apply auto-close update before inserting new entry
  if (autoCloseUpdate) {
    const closedEntry = activeEntries.find((e) => e.id === autoCloseUpdate!.id)!;
    await db
      .update(hppEntries)
      .set({ endDate: autoCloseUpdate.newEndDate, updatedAt: new Date() })
      .where(eq(hppEntries.id, autoCloseUpdate.id));

    // Audit log for auto-close
    await insertAuditLog({
      entityId: autoCloseUpdate.id,
      action: "update",
      previousValues: {
        endDate: closedEntry.endDate,
      },
      newValues: {
        endDate: autoCloseUpdate.newEndDate,
        autoClosedReason: "auto-closed by new entry",
      },
      userId: input.userId,
    });
  }

  // 9. Insert new entry
  const insertResult = await db.insert(hppEntries).values({
    variantId: input.variantId,
    hppValue: input.hppValue,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    note: input.note ?? null,
  });

  const newId = Number(insertResult[0].insertId);

  // 10. Fetch the inserted row
  const [newEntry] = await db
    .select()
    .from(hppEntries)
    .where(eq(hppEntries.id, newId))
    .limit(1);

  // 11. Audit log for insert
  await insertAuditLog({
    entityId: newId,
    action: "insert",
    previousValues: null,
    newValues: {
      variantId: newEntry.variantId,
      hppValue: newEntry.hppValue,
      startDate: newEntry.startDate,
      endDate: newEntry.endDate,
      note: newEntry.note,
    },
    userId: input.userId,
  });

  return { success: true, data: newEntry };
}

// ─── updateHppEntry ────────────────────────────────────────────────────────────

/**
 * Updates an existing HPP entry.
 *
 * Steps:
 *  1. Validate HPP value range
 *  2. Validate period dates
 *  3. Validate note length
 *  4. Fetch the existing entry (must exist and not be deleted)
 *  5. Check for period overlaps (excluding the entry being updated)
 *  6. Apply update
 *  7. Insert audit log
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export async function updateHppEntry(
  input: UpdateHppEntryInput,
): Promise<ServiceResult<typeof hppEntries.$inferSelect>> {
  // 1. Validate HPP value
  const valueError = validateHppValue(input.hppValue);
  if (valueError) return valueError;

  // 2. Validate period
  const periodResult = validatePeriod(input.startDate, input.endDate);
  if (!periodResult.valid) {
    return {
      success: false,
      message: periodResult.error!,
      field: periodResult.field,
    };
  }

  // 3. Validate note
  const noteError = validateNote(input.note);
  if (noteError) return noteError;

  // 4. Fetch existing entry
  const [existing] = await db
    .select()
    .from(hppEntries)
    .where(and(eq(hppEntries.id, input.id), isNull(hppEntries.deletedAt)))
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: `Entry with id=${input.id} not found`,
    };
  }

  // 5. Fetch all active entries for the same variant and check overlap (excluding self)
  const activeEntries = await fetchActiveEntries(existing.variantId);
  const newPeriod = { startDate: input.startDate, endDate: input.endDate ?? null };
  const overlapResult = checkOverlap(newPeriod, activeEntries, input.id);

  if (overlapResult.hasOverlap && overlapResult.conflictingEntry) {
    return {
      success: false,
      message: "Period overlaps with existing entry",
      conflict: {
        id: overlapResult.conflictingEntry.id,
        startDate: overlapResult.conflictingEntry.startDate,
        endDate: overlapResult.conflictingEntry.endDate,
        value: overlapResult.conflictingEntry.value,
      },
    };
  }

  // 6. Apply update
  await db
    .update(hppEntries)
    .set({
      hppValue: input.hppValue,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(hppEntries.id, input.id));

  // 7. Fetch updated row
  const [updated] = await db
    .select()
    .from(hppEntries)
    .where(eq(hppEntries.id, input.id))
    .limit(1);

  // 8. Audit log for update
  await insertAuditLog({
    entityId: input.id,
    action: "update",
    previousValues: {
      hppValue: existing.hppValue,
      startDate: existing.startDate,
      endDate: existing.endDate,
      note: existing.note,
    },
    newValues: {
      hppValue: updated.hppValue,
      startDate: updated.startDate,
      endDate: updated.endDate,
      note: updated.note,
    },
    userId: input.userId,
  });

  return { success: true, data: updated };
}

// ─── deleteHppEntry ────────────────────────────────────────────────────────────

/**
 * Soft-deletes an HPP entry by setting its deletedAt timestamp.
 *
 * Requirements: 3.1, 3.2, 3.3
 */
export async function deleteHppEntry(
  id: number,
  userId: string,
): Promise<ServiceResult<{ id: number }>> {
  // Fetch existing entry (must exist and not already be deleted)
  const [existing] = await db
    .select()
    .from(hppEntries)
    .where(and(eq(hppEntries.id, id), isNull(hppEntries.deletedAt)))
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: `Entry with id=${id} not found`,
    };
  }

  // Soft delete
  const deletedAt = new Date();
  await db
    .update(hppEntries)
    .set({ deletedAt, updatedAt: deletedAt })
    .where(eq(hppEntries.id, id));

  // Audit log for delete
  await insertAuditLog({
    entityId: id,
    action: "delete",
    previousValues: {
      variantId: existing.variantId,
      hppValue: existing.hppValue,
      startDate: existing.startDate,
      endDate: existing.endDate,
      note: existing.note,
    },
    newValues: null,
    userId,
  });

  return { success: true, data: { id } };
}

// ─── Helper: deserialize audit log row ─────────────────────────────────────────
//
// Same rationale as the Master Packing Cost service: `previousValues` and
// `newValues` are stored as JSON strings, but the frontend expects structured
// objects. Without parsing, `Object.keys(rawString)` would iterate characters.
function deserialiseAuditLog(
  log: typeof costAuditLog.$inferSelect,
): Omit<typeof costAuditLog.$inferSelect, "previousValues" | "newValues"> & {
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
} {
  const safeParse = (raw: string | null): Record<string, unknown> | null => {
    if (raw === null || raw === undefined) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  return {
    ...log,
    previousValues: safeParse(log.previousValues),
    newValues: safeParse(log.newValues),
  };
}

// ─── getHppHistory ─────────────────────────────────────────────────────────────

/**
 * Returns all HPP entries (including soft-deleted) for a variant,
 * sorted by startDate DESC, max 100 entries, with associated audit logs.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export async function getHppHistory(variantId: number): Promise<
  ServiceResult<
    Array<
      typeof hppEntries.$inferSelect & {
        auditLogs: Array<
          typeof costAuditLog.$inferSelect & {
            previousValues: Record<string, unknown> | null;
            newValues: Record<string, unknown> | null;
          }
        >;
      }
    >
  >
> {
  // Assert variant exists
  const variantError = await assertVariantExists(variantId);
  if (variantError) return variantError;

  // Fetch all entries (including deleted), sorted by startDate DESC, max 100
  const entries = await db
    .select()
    .from(hppEntries)
    .where(eq(hppEntries.variantId, variantId))
    .orderBy(desc(hppEntries.startDate))
    .limit(100);

  if (entries.length === 0) {
    return { success: true, data: [] };
  }

  // Fetch all audit logs for these entries in one query
  const entryIds = entries.map((e) => e.id);
  const auditLogs = await db
    .select()
    .from(costAuditLog)
    .where(
      and(
        eq(costAuditLog.entityType, "hpp"),
        sql`${costAuditLog.entityId} IN (${sql.join(entryIds.map((id) => sql`${id}`), sql`, `)})`,
      ),
    )
    .orderBy(desc(costAuditLog.createdAt));

  // Group audit logs by entityId. Deserialise JSON strings into objects so the
  // wire payload matches what the frontend expects — same rationale as the
  // Master Packing Cost service. Without this, `Object.keys(value)` on the
  // frontend iterates the string character-by-character.
  const auditLogsByEntryId = new Map<
    number,
    Array<typeof costAuditLog.$inferSelect & {
      previousValues: Record<string, unknown> | null;
      newValues: Record<string, unknown> | null;
    }>
  >();
  for (const log of auditLogs) {
    const parsed = deserialiseAuditLog(log);
    const existing = auditLogsByEntryId.get(parsed.entityId) ?? [];
    existing.push(parsed);
    auditLogsByEntryId.set(parsed.entityId, existing);
  }

  // Attach audit logs to each entry
  const result = entries.map((entry) => ({
    ...entry,
    auditLogs: auditLogsByEntryId.get(entry.id) ?? [],
  }));

  return { success: true, data: result };
}

// ─── resolveHpp ───────────────────────────────────────────────────────────────

/**
 * Resolves the HPP value for a variant on a specific target date.
 *
 * Resolution order:
 *  1. Active entry whose period contains the target date
 *     (startDate <= targetDate AND (endDate >= targetDate OR endDate is null))
 *  2. Fallback: most recent active entry with endDate < targetDate
 *  3. Default: Rp 0
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export async function resolveHpp(
  variantId: number,
  targetDate: string,
): Promise<ServiceResult<HppResolutionResult>> {
  // Assert variant exists
  const variantError = await assertVariantExists(variantId);
  if (variantError) return variantError;

  // Fetch all active (non-deleted) entries for the variant
  const activeEntries = await db
    .select()
    .from(hppEntries)
    .where(
      and(
        eq(hppEntries.variantId, variantId),
        isNull(hppEntries.deletedAt),
      ),
    );

  if (activeEntries.length === 0) {
    return {
      success: true,
      data: {
        variantId,
        hppValue: 0,
        entryId: null,
        source: "default",
      },
    };
  }

  // 1. Find active entry whose period contains the target date
  const activeEntry = activeEntries.find((e) => {
    const afterStart = e.startDate <= targetDate;
    const beforeEnd = e.endDate === null || e.endDate >= targetDate;
    return afterStart && beforeEnd;
  });

  if (activeEntry) {
    return {
      success: true,
      data: {
        variantId,
        hppValue: activeEntry.hppValue,
        entryId: activeEntry.id,
        source: "active",
      },
    };
  }

  // 2. Fallback: most recent entry with endDate < targetDate
  const pastEntries = activeEntries
    .filter((e) => e.endDate !== null && e.endDate < targetDate)
    .sort((a, b) => {
      // Sort by endDate DESC, then startDate DESC as tiebreaker
      if (b.endDate! > a.endDate!) return 1;
      if (b.endDate! < a.endDate!) return -1;
      return b.startDate > a.startDate ? 1 : -1;
    });

  if (pastEntries.length > 0) {
    const fallbackEntry = pastEntries[0];
    return {
      success: true,
      data: {
        variantId,
        hppValue: fallbackEntry.hppValue,
        entryId: fallbackEntry.id,
        source: "fallback",
      },
    };
  }

  // 3. Default: Rp 0
  return {
    success: true,
    data: {
      variantId,
      hppValue: 0,
      entryId: null,
      source: "default",
    },
  };
}
