/**
 * Biaya Packing Service
 *
 * Implements CRUD operations and resolution logic for packing cost entries
 * (Entry_Biaya_Packing) per Produk_Channel (product_groups).
 *
 * Requirements: 6.1–6.7, 7.1–7.5, 8.1–8.3, 9.1–9.3, 10.1–10.3, 11.1–11.2
 */

import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { packingCostEntries, costAuditLog, productGroups } from "../../db/schema";
import {
  validatePeriod,
  checkOverlap,
  determineAutoClose,
  type ExistingEntry,
} from "../../utils/period-validation";

// ─── Input Interfaces ──────────────────────────────────────────────────────────

export interface CreatePackingCostEntryInput {
  productGroupId: number;
  packingCost: number;    // Rp 0 – Rp 999,999,999
  startDate: string;      // YYYY-MM-DD
  endDate?: string | null;
  note?: string | null;   // max 255 chars
  userId: string;
}

export interface UpdatePackingCostEntryInput {
  id: number;
  packingCost: number;
  startDate: string;
  endDate?: string | null;
  note?: string | null;
  userId: string;
}

export interface PackingCostResolutionResult {
  productGroupId: number;
  packingCost: number;
  entryId: number | null;
  source: "active" | "fallback" | "default";
}

// ─── Error Response Helpers ────────────────────────────────────────────────────

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

const PACKING_COST_MIN = 0;
const PACKING_COST_MAX = 999_999_999;
const NOTE_MAX_LENGTH = 255;

// ─── Validation Helpers ────────────────────────────────────────────────────────

function validatePackingCostValue(value: number): ServiceError | null {
  if (!Number.isInteger(value) || value < PACKING_COST_MIN || value > PACKING_COST_MAX) {
    return {
      success: false,
      message: `Packing cost must be between Rp ${PACKING_COST_MIN} and Rp ${PACKING_COST_MAX}`,
      field: "packingCost",
    };
  }
  return null;
}

function validateNote(note?: string | null): ServiceError | null {
  if (note != null && note.length > NOTE_MAX_LENGTH) {
    return {
      success: false,
      message: `Note must not exceed ${NOTE_MAX_LENGTH} characters`,
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
    entityType: "packing_cost",
    entityId: params.entityId,
    action: params.action,
    previousValues: params.previousValues ? JSON.stringify(params.previousValues) : null,
    newValues: params.newValues ? JSON.stringify(params.newValues) : null,
    userId: params.userId,
  });
}

// ─── Product Group Existence Check ────────────────────────────────────────────

async function assertProductGroupExists(productGroupId: number): Promise<ServiceError | null> {
  const rows = await db
    .select({ id: productGroups.id })
    .from(productGroups)
    .where(eq(productGroups.id, productGroupId))
    .limit(1);

  if (rows.length === 0) {
    return {
      success: false,
      message: `Product group with id=${productGroupId} not found`,
    };
  }
  return null;
}

// ─── Fetch Active Entries for Overlap Check ────────────────────────────────────

async function fetchActiveEntries(productGroupId: number): Promise<ExistingEntry[]> {
  const rows = await db
    .select({
      id: packingCostEntries.id,
      startDate: packingCostEntries.startDate,
      endDate: packingCostEntries.endDate,
      packingCost: packingCostEntries.packingCost,
    })
    .from(packingCostEntries)
    .where(
      and(
        eq(packingCostEntries.productGroupId, productGroupId),
        isNull(packingCostEntries.deletedAt),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    endDate: r.endDate ?? null,
    value: r.packingCost,
  }));
}

// ─── createPackingCostEntry ────────────────────────────────────────────────────

/**
 * Creates a new Biaya Packing entry for a Produk_Channel.
 *
 * Steps:
 *  1. Validate product group existence
 *  2. Validate field values (cost range, dates, note length)
 *  3. Fetch active entries for the same product group
 *  4. Determine auto-close if an open-ended entry exists
 *  5. Check for period overlaps (after potential auto-close)
 *  6. Insert the new entry
 *  7. Apply auto-close update (set endDate + autoClosedBy)
 *  8. Insert audit log
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export async function createPackingCostEntry(
  input: CreatePackingCostEntryInput,
): Promise<ServiceResult<{ id: number }>> {
  // 1. Validate product group existence
  const groupError = await assertProductGroupExists(input.productGroupId);
  if (groupError) return groupError;

  // 2. Validate field values
  const costError = validatePackingCostValue(input.packingCost);
  if (costError) return costError;

  const periodError = validatePeriod(input.startDate, input.endDate);
  if (!periodError.valid) {
    return {
      success: false,
      message: periodError.error!,
      field: periodError.field,
    };
  }

  const noteError = validateNote(input.note);
  if (noteError) return noteError;

  // 3. Fetch active entries
  const activeEntries = await fetchActiveEntries(input.productGroupId);

  // 4. Determine auto-close for any existing open-ended entry
  const openEndedEntry = activeEntries.find((e) => e.endDate === null);
  let autoCloseUpdate: { id: number; newEndDate: string } | null = null;

  if (openEndedEntry) {
    const autoCloseResult = determineAutoClose(input.startDate, openEndedEntry, input.endDate);

    if (autoCloseResult.rejected) {
      return {
        success: false,
        message: autoCloseResult.rejectionReason!,
        conflict: {
          id: openEndedEntry.id,
          startDate: openEndedEntry.startDate,
          endDate: openEndedEntry.endDate,
          value: openEndedEntry.value,
        },
      };
    }

    if (autoCloseResult.shouldAutoClose && autoCloseResult.entryToClose) {
      autoCloseUpdate = autoCloseResult.entryToClose;
    }
  }

  // 5. Check for period overlaps
  // Build the effective entries list: if auto-closing, treat the open-ended entry
  // as having its new endDate for overlap purposes.
  const entriesForOverlapCheck: ExistingEntry[] = activeEntries.map((e) => {
    if (autoCloseUpdate && e.id === autoCloseUpdate.id) {
      return { ...e, endDate: autoCloseUpdate.newEndDate };
    }
    return e;
  });

  const overlapResult = checkOverlap(
    { startDate: input.startDate, endDate: input.endDate ?? null },
    entriesForOverlapCheck,
  );

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

  // 6. Insert the new entry
  const insertResult = await db.insert(packingCostEntries).values({
    productGroupId: input.productGroupId,
    packingCost: input.packingCost,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    note: input.note ?? null,
  });

  const newEntryId = Number(insertResult[0].insertId);

  // 7. Apply auto-close update
  if (autoCloseUpdate) {
    const closedEntry = activeEntries.find((e) => e.id === autoCloseUpdate!.id)!;

    await db
      .update(packingCostEntries)
      .set({
        endDate: autoCloseUpdate.newEndDate,
        autoClosedBy: newEntryId,
        updatedAt: new Date(),
      })
      .where(eq(packingCostEntries.id, autoCloseUpdate.id));

    // Audit log for auto-close
    await insertAuditLog({
      entityId: autoCloseUpdate.id,
      action: "update",
      previousValues: {
        endDate: closedEntry.endDate,
      },
      newValues: {
        endDate: autoCloseUpdate.newEndDate,
        autoClosedBy: newEntryId,
        autoClosedReason: "auto-closed by new entry",
      },
      userId: input.userId,
    });
  }

  // 8. Insert audit log
  const newValues: Record<string, unknown> = {
    id: newEntryId,
    productGroupId: input.productGroupId,
    packingCost: input.packingCost,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    note: input.note ?? null,
  };

  await insertAuditLog({
    entityId: newEntryId,
    action: "insert",
    previousValues: null,
    newValues,
    userId: input.userId,
  });

  return { success: true, data: { id: newEntryId } };
}

// ─── updatePackingCostEntry ────────────────────────────────────────────────────

/**
 * Updates an existing Biaya Packing entry.
 *
 * Steps:
 *  1. Fetch the existing entry (must exist and not be deleted)
 *  2. Validate field values
 *  3. Fetch active entries for overlap check (excluding self)
 *  4. Check for period overlaps
 *  5. Apply update
 *  6. Insert audit log
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export async function updatePackingCostEntry(
  input: UpdatePackingCostEntryInput,
): Promise<ServiceResult<{ id: number }>> {
  // 1. Fetch existing entry
  const existing = await db
    .select()
    .from(packingCostEntries)
    .where(
      and(
        eq(packingCostEntries.id, input.id),
        isNull(packingCostEntries.deletedAt),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      success: false,
      message: `Entry with id=${input.id} not found`,
    };
  }

  const entry = existing[0];

  // 2. Validate field values
  const costError = validatePackingCostValue(input.packingCost);
  if (costError) return costError;

  const periodError = validatePeriod(input.startDate, input.endDate);
  if (!periodError.valid) {
    return {
      success: false,
      message: periodError.error!,
      field: periodError.field,
    };
  }

  const noteError = validateNote(input.note);
  if (noteError) return noteError;

  // 3. Fetch active entries for overlap check (excluding self)
  const activeEntries = await fetchActiveEntries(entry.productGroupId);

  const overlapResult = checkOverlap(
    { startDate: input.startDate, endDate: input.endDate ?? null },
    activeEntries,
    input.id, // exclude self
  );

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

  // 4. Capture previous values for audit log
  const previousValues: Record<string, unknown> = {
    id: entry.id,
    productGroupId: entry.productGroupId,
    packingCost: entry.packingCost,
    startDate: entry.startDate,
    endDate: entry.endDate ?? null,
    note: entry.note ?? null,
  };

  // 5. Apply update
  await db
    .update(packingCostEntries)
    .set({
      packingCost: input.packingCost,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(packingCostEntries.id, input.id));

  // 6. Insert audit log
  const newValues: Record<string, unknown> = {
    id: input.id,
    productGroupId: entry.productGroupId,
    packingCost: input.packingCost,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    note: input.note ?? null,
  };

  await insertAuditLog({
    entityId: input.id,
    action: "update",
    previousValues,
    newValues,
    userId: input.userId,
  });

  return { success: true, data: { id: input.id } };
}

// ─── deletePackingCostEntry ────────────────────────────────────────────────────

/**
 * Soft-deletes a Biaya Packing entry.
 *
 * Steps:
 *  1. Fetch the existing entry (must exist and not be deleted)
 *  2. Soft-delete (set deletedAt)
 *  3. Re-open any entry that was auto-closed by this entry (Requirement 8.2)
 *  4. Insert audit log
 *
 * Requirements: 8.1, 8.2, 8.3
 */
export async function deletePackingCostEntry(
  id: number,
  userId: string,
): Promise<ServiceResult<{ id: number }>> {
  // 1. Fetch existing entry
  const existing = await db
    .select()
    .from(packingCostEntries)
    .where(
      and(
        eq(packingCostEntries.id, id),
        isNull(packingCostEntries.deletedAt),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      success: false,
      message: `Entry with id=${id} not found`,
    };
  }

  const entry = existing[0];
  const now = new Date();

  // 2. Soft-delete
  await db
    .update(packingCostEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(packingCostEntries.id, id));

  // 3. Re-open any entry that was auto-closed by this entry (Requirement 8.2)
  // Find entries where autoClosedBy = id (the entry being deleted)
  const autoClosedEntries = await db
    .select({ id: packingCostEntries.id })
    .from(packingCostEntries)
    .where(
      and(
        eq(packingCostEntries.autoClosedBy, id),
        isNull(packingCostEntries.deletedAt),
      ),
    );

  for (const autoClosedEntry of autoClosedEntries) {
    await db
      .update(packingCostEntries)
      .set({
        endDate: null,
        autoClosedBy: null,
        updatedAt: now,
      })
      .where(eq(packingCostEntries.id, autoClosedEntry.id));
  }

  // 4. Insert audit log
  const deletedValues: Record<string, unknown> = {
    id: entry.id,
    productGroupId: entry.productGroupId,
    packingCost: entry.packingCost,
    startDate: entry.startDate,
    endDate: entry.endDate ?? null,
    note: entry.note ?? null,
  };

  await insertAuditLog({
    entityId: id,
    action: "delete",
    previousValues: deletedValues,
    newValues: null,
    userId,
  });

  return { success: true, data: { id } };
}

// ─── getPackingCostHistory ─────────────────────────────────────────────────────

/**
 * Returns the full Biaya Packing history for a Produk_Channel,
 * including soft-deleted entries, sorted by startDate DESC, max 100 entries.
 * Each entry includes its associated audit log entries.
 *
 * Requirements: 9.1, 9.2, 9.3
 */
export async function getPackingCostHistory(productGroupId: number): Promise<
  ServiceResult<
    Array<{
      id: number;
      productGroupId: number;
      packingCost: number;
      startDate: string;
      endDate: string | null;
      note: string | null;
      autoClosedBy: number | null;
      deletedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      auditLogs: Array<{
        id: number;
        action: string;
        previousValues: Record<string, unknown> | null;
        newValues: Record<string, unknown> | null;
        userId: string;
        createdAt: Date;
      }>;
    }>
  >
> {
  // Fetch all entries (including soft-deleted), sorted by startDate DESC, max 100
  const entries = await db
    .select()
    .from(packingCostEntries)
    .where(eq(packingCostEntries.productGroupId, productGroupId))
    .orderBy(desc(packingCostEntries.startDate))
    .limit(100);

  if (entries.length === 0) {
    return { success: true, data: [] };
  }

  // Fetch all audit logs for these entries
  const entryIds = entries.map((e) => e.id);

  // Fetch audit logs for all entry IDs using SQL IN clause
  const relevantAuditLogs = await db
    .select()
    .from(costAuditLog)
    .where(
      and(
        eq(costAuditLog.entityType, "packing_cost"),
        sql`${costAuditLog.entityId} IN (${sql.join(entryIds.map((id) => sql`${id}`), sql`, `)})`,
      ),
    )
    .orderBy(desc(costAuditLog.createdAt));

  // Group audit logs by entityId
  const auditLogsByEntryId = new Map<
    number,
    typeof relevantAuditLogs
  >();

  for (const log of relevantAuditLogs) {
    const existing = auditLogsByEntryId.get(log.entityId) ?? [];
    existing.push(log);
    auditLogsByEntryId.set(log.entityId, existing);
  }

  // Build result
  const result = entries.map((entry) => {
    const logs = auditLogsByEntryId.get(entry.id) ?? [];
    return {
      id: entry.id,
      productGroupId: entry.productGroupId,
      packingCost: entry.packingCost,
      startDate: entry.startDate,
      endDate: entry.endDate ?? null,
      note: entry.note ?? null,
      autoClosedBy: entry.autoClosedBy ?? null,
      deletedAt: entry.deletedAt ?? null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      auditLogs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        previousValues: log.previousValues
          ? (JSON.parse(log.previousValues) as Record<string, unknown>)
          : null,
        newValues: log.newValues
          ? (JSON.parse(log.newValues) as Record<string, unknown>)
          : null,
        userId: log.userId,
        createdAt: log.createdAt,
      })),
    };
  });

  return { success: true, data: result };
}

// ─── resolvePackingCost ────────────────────────────────────────────────────────

/**
 * Resolves the Biaya Packing for a Produk_Channel on a specific target date.
 *
 * Resolution order:
 *  1. Active entry whose period contains the target date
 *     (startDate <= targetDate AND (endDate >= targetDate OR endDate is null))
 *  2. Fallback: active entry with the most recent endDate < targetDate
 *  3. Default: Rp 0
 *
 * Requirements: 10.1, 10.2, 10.3, 11.1, 11.2
 */
export async function resolvePackingCost(
  productGroupId: number,
  targetDate: string,
): Promise<ServiceResult<PackingCostResolutionResult>> {
  // Fetch all active (non-deleted) entries for this product group
  const activeEntries = await db
    .select()
    .from(packingCostEntries)
    .where(
      and(
        eq(packingCostEntries.productGroupId, productGroupId),
        isNull(packingCostEntries.deletedAt),
      ),
    )
    .orderBy(desc(packingCostEntries.startDate));

  if (activeEntries.length === 0) {
    // Requirement 10.3, 11.1, 11.2: No entries → default Rp 0
    return {
      success: true,
      data: {
        productGroupId,
        packingCost: 0,
        entryId: null,
        source: "default",
      },
    };
  }

  // 1. Find active entry whose period contains the target date
  const activeEntry = activeEntries.find((e) => {
    const startOk = e.startDate <= targetDate;
    const endOk = e.endDate === null || e.endDate >= targetDate;
    return startOk && endOk;
  });

  if (activeEntry) {
    return {
      success: true,
      data: {
        productGroupId,
        packingCost: activeEntry.packingCost,
        entryId: activeEntry.id,
        source: "active",
      },
    };
  }

  // 2. Fallback: most recent entry with endDate < targetDate
  // Entries are already sorted by startDate DESC; find the one with the most recent endDate < targetDate
  const fallbackEntries = activeEntries
    .filter((e) => e.endDate !== null && e.endDate < targetDate)
    .sort((a, b) => {
      // Sort by endDate DESC to get the most recent
      if (a.endDate! > b.endDate!) return -1;
      if (a.endDate! < b.endDate!) return 1;
      return 0;
    });

  if (fallbackEntries.length > 0) {
    const fallbackEntry = fallbackEntries[0];
    return {
      success: true,
      data: {
        productGroupId,
        packingCost: fallbackEntry.packingCost,
        entryId: fallbackEntry.id,
        source: "fallback",
      },
    };
  }

  // 3. Default: Rp 0
  return {
    success: true,
    data: {
      productGroupId,
      packingCost: 0,
      entryId: null,
      source: "default",
    },
  };
}
