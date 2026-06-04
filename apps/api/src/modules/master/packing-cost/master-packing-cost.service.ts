/**
 * Master Packing Cost Service
 *
 * Handles CRUD operations for packing cost entries per master product,
 * including period validation, auto-close logic, soft delete, audit logging,
 * and packing cost resolution for a given date.
 *
 * Mirrors the pattern of hpp.service.ts.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { costAuditLog, masterPackingCostEntries, masterProducts } from "../../../db/schema";
import {
  checkOverlap,
  determineAutoClose,
  validatePeriod,
  type ExistingEntry,
} from "../../../utils/period-validation";

// ─── Input Interfaces ──────────────────────────────────────────────────────────

export interface CreateMasterPackingCostInput {
  masterProductId: number;
  packingCost: number;        // Rp 0 – Rp 999,999,999
  startDate: string;          // YYYY-MM-DD
  endDate?: string | null;
  note?: string | null;       // max 255 chars
  userId: string;
}

export interface UpdateMasterPackingCostInput {
  id: number;
  packingCost: number;
  startDate: string;
  endDate?: string | null;
  note?: string | null;
  userId: string;
}

// ─── Result Interfaces ─────────────────────────────────────────────────────────

export interface MasterPackingCostResolution {
  masterProductId: number;
  packingCost: number;
  entryId: number | null;
  source: "active" | "default";
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

const PACKING_COST_MIN = 0;
const PACKING_COST_MAX = 999_999_999;

// ─── Validation Helpers ────────────────────────────────────────────────────────

function validatePackingCostValue(value: number): ServiceError | null {
  if (!Number.isInteger(value) || value < PACKING_COST_MIN || value > PACKING_COST_MAX) {
    return {
      success: false,
      message: `Packing cost must be between Rp 0 and Rp 999,999,999`,
      field: "packingCost",
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

function validateUserId(userId: string | null | undefined): ServiceError | null {
  if (!userId || userId.trim().length === 0) {
    return {
      success: false,
      message: "userId is required",
      field: "userId",
    };
  }
  return null;
}

// ─── Audit Log Helper ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertAuditLog(
  tx: any,
  params: {
    entityId: number;
    action: "insert" | "update" | "delete";
    previousValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    userId: string;
  },
) {
  await tx.insert(costAuditLog).values({
    entityType: "master_packing_cost",
    entityId: params.entityId,
    action: params.action,
    previousValues: params.previousValues ? JSON.stringify(params.previousValues) : null,
    newValues: params.newValues ? JSON.stringify(params.newValues) : null,
    userId: params.userId,
  });
}

// ─── Master Product Existence Check ───────────────────────────────────────────

async function assertMasterProductExists(masterProductId: number): Promise<ServiceError | null> {
  const rows = await db
    .select({ id: masterProducts.id })
    .from(masterProducts)
    .where(eq(masterProducts.id, masterProductId))
    .limit(1);

  if (rows.length === 0) {
    return {
      success: false,
      message: `Master product with id=${masterProductId} not found`,
    };
  }
  return null;
}

// ─── Fetch Active Entries Helper ───────────────────────────────────────────────

async function fetchActiveEntries(masterProductId: number): Promise<ExistingEntry[]> {
  const rows = await db
    .select({
      id: masterPackingCostEntries.id,
      startDate: masterPackingCostEntries.startDate,
      endDate: masterPackingCostEntries.endDate,
      packingCost: masterPackingCostEntries.packingCost,
    })
    .from(masterPackingCostEntries)
    .where(
      and(
        eq(masterPackingCostEntries.masterProductId, masterProductId),
        isNull(masterPackingCostEntries.deletedAt),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    endDate: r.endDate ?? null,
    value: r.packingCost,
  }));
}

// ─── createMasterPackingCost ───────────────────────────────────────────────────

/**
 * Creates a new packing cost entry for a master product.
 *
 * Steps:
 *  1. Validate userId
 *  2. Validate packingCost value range
 *  3. Validate period dates
 *  4. Validate note length
 *  5. Assert master product exists
 *  6. Fetch active entries for the master product
 *  7. Handle auto-close for any existing open-ended entry
 *  8. Check for period overlaps (excluding the entry being auto-closed)
 *  9. Execute in a single atomic transaction:
 *     a. Apply auto-close update if needed (+ audit log action='update')
 *     b. Insert new entry
 *     c. Set autoClosedBy on the closed entry (if applicable)
 *     d. Insert audit log action='insert' for new entry
 *
 * Requirements: 9.1, 10.1–10.7, 11.1–11.5, 13.1, 13.5, 13.6
 */
export async function createMasterPackingCost(
  input: CreateMasterPackingCostInput,
): Promise<ServiceResult<typeof masterPackingCostEntries.$inferSelect>> {
  // 1. Validate userId
  const userIdError = validateUserId(input.userId);
  if (userIdError) return userIdError;

  // 2. Validate packingCost value
  const valueError = validatePackingCostValue(input.packingCost);
  if (valueError) return valueError;

  // 3. Validate period
  const periodResult = validatePeriod(input.startDate, input.endDate);
  if (!periodResult.valid) {
    return {
      success: false,
      message: periodResult.error!,
      field: periodResult.field,
    };
  }

  // 4. Validate note
  const noteError = validateNote(input.note);
  if (noteError) return noteError;

  // 5. Assert master product exists
  const masterProductError = await assertMasterProductExists(input.masterProductId);
  if (masterProductError) return masterProductError;

  // 6. Fetch active entries
  const activeEntries = await fetchActiveEntries(input.masterProductId);

  // 7. Handle auto-close for open-ended entry
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

  // 8. Check for period overlaps (exclude the entry being auto-closed)
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

  // 9. Execute everything in a single atomic transaction
  try {
    return await db.transaction(async (tx) => {
      // 9a. Apply auto-close update if needed
      let newEntryId: number;

      if (autoCloseUpdate) {
        const closedEntry = activeEntries.find((e) => e.id === autoCloseUpdate!.id)!;

        await tx
          .update(masterPackingCostEntries)
          .set({ endDate: autoCloseUpdate.newEndDate, updatedAt: new Date() })
          .where(eq(masterPackingCostEntries.id, autoCloseUpdate.id));

        // 9b. Insert new entry
        const insertResult = await tx.insert(masterPackingCostEntries).values({
          masterProductId: input.masterProductId,
          packingCost: input.packingCost,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          note: input.note ?? null,
        });

        newEntryId = Number(insertResult[0].insertId);

        // 9c. Set autoClosedBy on the closed entry
        await tx
          .update(masterPackingCostEntries)
          .set({ autoClosedBy: newEntryId, updatedAt: new Date() })
          .where(eq(masterPackingCostEntries.id, autoCloseUpdate.id));

        // Audit log for auto-close (action='update')
        await insertAuditLog(tx, {
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
      } else {
        // 9b. Insert new entry (no auto-close)
        const insertResult = await tx.insert(masterPackingCostEntries).values({
          masterProductId: input.masterProductId,
          packingCost: input.packingCost,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          note: input.note ?? null,
        });

        newEntryId = Number(insertResult[0].insertId);
      }

      // 9d. Fetch the inserted row
      const [newEntry] = await tx
        .select()
        .from(masterPackingCostEntries)
        .where(eq(masterPackingCostEntries.id, newEntryId))
        .limit(1);

      // Audit log for insert (action='insert')
      await insertAuditLog(tx, {
        entityId: newEntryId,
        action: "insert",
        previousValues: null,
        newValues: {
          masterProductId: newEntry!.masterProductId,
          packingCost: newEntry!.packingCost,
          startDate: newEntry!.startDate,
          endDate: newEntry!.endDate,
          note: newEntry!.note,
        },
        userId: input.userId,
      });

      return { success: true as const, data: newEntry! };
    });
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Transaction failed",
    };
  }
}

// ─── updateMasterPackingCost ───────────────────────────────────────────────────

/**
 * Updates an existing packing cost entry.
 *
 * Steps:
 *  1. Validate userId
 *  2. Validate packingCost value range
 *  3. Validate period dates
 *  4. Validate note length
 *  5. Fetch the existing entry (must exist and not be deleted)
 *  6. Check for period overlaps (excluding the entry being updated)
 *  7. Execute in a single atomic transaction:
 *     a. Apply update
 *     b. Insert audit log action='update'
 *
 * Requirements: 9.2, 9.6, 10.1–10.7, 13.2, 13.5, 13.6
 */
export async function updateMasterPackingCost(
  input: UpdateMasterPackingCostInput,
): Promise<ServiceResult<typeof masterPackingCostEntries.$inferSelect>> {
  // 1. Validate userId
  const userIdError = validateUserId(input.userId);
  if (userIdError) return userIdError;

  // 2. Validate packingCost value
  const valueError = validatePackingCostValue(input.packingCost);
  if (valueError) return valueError;

  // 3. Validate period
  const periodResult = validatePeriod(input.startDate, input.endDate);
  if (!periodResult.valid) {
    return {
      success: false,
      message: periodResult.error!,
      field: periodResult.field,
    };
  }

  // 4. Validate note
  const noteError = validateNote(input.note);
  if (noteError) return noteError;

  // 5. Fetch existing entry (must exist and not be soft-deleted)
  const [existing] = await db
    .select()
    .from(masterPackingCostEntries)
    .where(
      and(
        eq(masterPackingCostEntries.id, input.id),
        isNull(masterPackingCostEntries.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: `Entry with id=${input.id} not found`,
    };
  }

  // 6. Fetch all active entries for the same master product and check overlap (excluding self)
  const activeEntries = await fetchActiveEntries(existing.masterProductId);
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

  // 7. Execute in a single atomic transaction
  try {
    return await db.transaction(async (tx) => {
      // 7a. Apply update
      await tx
        .update(masterPackingCostEntries)
        .set({
          packingCost: input.packingCost,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          note: input.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(masterPackingCostEntries.id, input.id));

      // 7b. Fetch updated row
      const [updated] = await tx
        .select()
        .from(masterPackingCostEntries)
        .where(eq(masterPackingCostEntries.id, input.id))
        .limit(1);

      // Audit log for update
      await insertAuditLog(tx, {
        entityId: input.id,
        action: "update",
        previousValues: {
          packingCost: existing.packingCost,
          startDate: existing.startDate,
          endDate: existing.endDate,
          note: existing.note,
        },
        newValues: {
          packingCost: updated!.packingCost,
          startDate: updated!.startDate,
          endDate: updated!.endDate,
          note: updated!.note,
        },
        userId: input.userId,
      });

      return { success: true as const, data: updated! };
    });
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Transaction failed",
    };
  }
}

// ─── deleteMasterPackingCost ───────────────────────────────────────────────────

/**
 * Soft-deletes a packing cost entry by setting its deletedAt timestamp.
 *
 * Requirements: 9.3, 9.6, 13.3, 13.5, 13.6
 */
export async function deleteMasterPackingCost(
  id: number,
  userId: string,
): Promise<ServiceResult<{ id: number }>> {
  // Validate userId
  const userIdError = validateUserId(userId);
  if (userIdError) return userIdError;

  // Fetch existing entry (must exist and not already be deleted)
  const [existing] = await db
    .select()
    .from(masterPackingCostEntries)
    .where(
      and(
        eq(masterPackingCostEntries.id, id),
        isNull(masterPackingCostEntries.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: `Entry with id=${id} not found`,
    };
  }

  // Execute in a single atomic transaction
  try {
    return await db.transaction(async (tx) => {
      const deletedAt = new Date();

      // Soft delete
      await tx
        .update(masterPackingCostEntries)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(eq(masterPackingCostEntries.id, id));

      // Audit log for delete
      await insertAuditLog(tx, {
        entityId: id,
        action: "delete",
        previousValues: {
          masterProductId: existing.masterProductId,
          packingCost: existing.packingCost,
          startDate: existing.startDate,
          endDate: existing.endDate,
          note: existing.note,
        },
        newValues: null,
        userId,
      });

      return { success: true, data: { id } };
    });
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Transaction failed",
    };
  }
}

// ─── Helper: deserialize audit log row ─────────────────────────────────────────
//
// `cost_audit_log.previousValues` and `newValues` are stored as JSON strings so
// the schema can hold heterogeneous payloads. The wire contract with the
// frontend is structured objects (e.g. `{ packingCost: 400, startDate: "..." }`),
// not raw strings — otherwise `Object.keys(value)` on the client iterates the
// string character-by-character and renders nonsense.
//
// We parse here at the service boundary so every consumer (history view, audit
// list, future report views) gets the same deserialised shape. If a row was
// written with malformed JSON for any reason, we surface `null` rather than
// crashing the whole history fetch.
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

// ─── getMasterPackingCostHistory ───────────────────────────────────────────────

/**
 * Returns all packing cost entries (including soft-deleted) for a master product,
 * sorted by startDate DESC, with associated audit logs.
 *
 * Requirements: 9.4
 */
export async function getMasterPackingCostHistory(masterProductId: number): Promise<
  ServiceResult<
    Array<
      typeof masterPackingCostEntries.$inferSelect & {
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
  // Assert master product exists
  const masterProductError = await assertMasterProductExists(masterProductId);
  if (masterProductError) return masterProductError;

  // Fetch all entries (including deleted), sorted by startDate DESC
  const entries = await db
    .select()
    .from(masterPackingCostEntries)
    .where(eq(masterPackingCostEntries.masterProductId, masterProductId))
    .orderBy(desc(masterPackingCostEntries.startDate));

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
        eq(costAuditLog.entityType, "master_packing_cost"),
        sql`${costAuditLog.entityId} IN (${sql.join(entryIds.map((id) => sql`${id}`), sql`, `)})`,
      ),
    )
    .orderBy(desc(costAuditLog.createdAt));

  // Group audit logs by entityId. Deserialise JSON strings into objects so
  // the wire payload matches what the frontend expects (see `deserialiseAuditLog`).
  const auditLogsByEntryId = new Map<number, Array<ReturnType<typeof deserialiseAuditLog>>>();
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

// ─── resolveMasterPackingCost ──────────────────────────────────────────────────

/**
 * Resolves the packing cost for a master product on a specific target date.
 *
 * Resolution:
 *  1. Filter entries: deleted_at IS NULL, start_date <= targetDate,
 *     end_date IS NULL OR end_date >= targetDate
 *  2. Pick the entry with the largest start_date (most recent)
 *  3. If none found → { packingCost: 0, entryId: null, source: 'default' }
 *
 * Requirements: 9.5, 12.1–12.6
 */
export async function resolveMasterPackingCost(
  masterProductId: number,
  targetDate: string,
): Promise<ServiceResult<MasterPackingCostResolution>> {
  // Fetch all active (non-deleted) entries for the master product
  const activeEntries = await db
    .select()
    .from(masterPackingCostEntries)
    .where(
      and(
        eq(masterPackingCostEntries.masterProductId, masterProductId),
        isNull(masterPackingCostEntries.deletedAt),
      ),
    );

  if (activeEntries.length === 0) {
    return {
      success: true,
      data: {
        masterProductId,
        packingCost: 0,
        entryId: null,
        source: "default",
      },
    };
  }

  // Filter entries that cover the targetDate:
  //   start_date <= targetDate AND (end_date IS NULL OR end_date >= targetDate)
  const coveringEntries = activeEntries.filter((e) => {
    const afterStart = e.startDate <= targetDate;
    const beforeEnd = e.endDate === null || e.endDate >= targetDate;
    return afterStart && beforeEnd;
  });

  if (coveringEntries.length === 0) {
    return {
      success: true,
      data: {
        masterProductId,
        packingCost: 0,
        entryId: null,
        source: "default",
      },
    };
  }

  // Pick the entry with the largest start_date (most recent)
  const activeEntry = coveringEntries.reduce((best, current) =>
    current.startDate > best.startDate ? current : best,
  );

  return {
    success: true,
    data: {
      masterProductId,
      packingCost: activeEntry.packingCost,
      entryId: activeEntry.id,
      source: "active",
    },
  };
}
