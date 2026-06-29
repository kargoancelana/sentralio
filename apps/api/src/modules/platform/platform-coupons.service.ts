/**
 * Platform_Coupons_Service — CRUD kupon diskon untuk portal Super Admin.
 *
 * Dipakai route /platform/coupons (list, get, create, update).
 * Tidak ada hard delete — coupon cuma bisa dinonaktifin via isActive=false.
 * Kupon GLOBAL (platform-wide), TANPA company_id, sama kayak plans.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { coupons, plans } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export type CouponType = 'percent' | 'fixed';

export interface CouponItem {
  id: number;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;   // ISO string
  validUntil: string | null;  // ISO string
  planId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CouponInput {
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  validFrom: string | null;   // ISO string atau null
  validUntil: string | null;  // ISO string atau null
  planId: number | null;
  isActive: boolean;
}

// Error tipe biar route bisa map ke HTTP code yang ramah.
export class DuplicateCouponCodeError extends Error {
  constructor() { super('DUPLICATE_CODE'); this.name = 'DuplicateCouponCodeError'; }
}
export class PlanNotFoundError extends Error {
  constructor() { super('PLAN_NOT_FOUND'); this.name = 'PlanNotFoundError'; }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function rowToItem(row: typeof coupons.$inferSelect): CouponItem {
  return {
    id: row.id,
    code: row.code,
    type: row.type as CouponType,
    value: row.value,
    maxUses: row.maxUses ?? null,
    usedCount: row.usedCount,
    validFrom: row.validFrom ? row.validFrom.toISOString() : null,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    planId: row.planId ?? null,
    isActive: row.isActive === 1,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertPlanExists(planId: number | null, db: DrizzleDb): Promise<void> {
  if (planId == null) return;
  const rows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!rows[0]) throw new PlanNotFoundError();
}

function isDupErr(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as any).code === 'ER_DUP_ENTRY';
}

export async function listCoupons(db: DrizzleDb = defaultDb): Promise<CouponItem[]> {
  const rows = await db.select().from(coupons).orderBy(coupons.id);
  return rows.map(rowToItem);
}

export async function getCoupon(id: number, db: DrizzleDb = defaultDb): Promise<CouponItem | null> {
  const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return rows[0] ? rowToItem(rows[0]) : null;
}

export async function createCoupon(input: CouponInput, db: DrizzleDb = defaultDb): Promise<CouponItem> {
  await assertPlanExists(input.planId, db);
  try {
    const result = await db.insert(coupons).values({
      code: input.code.trim(),
      codeUpper: normalizeCode(input.code),
      type: input.type,
      value: input.value,
      maxUses: input.maxUses,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      planId: input.planId,
      isActive: input.isActive ? 1 : 0,
    });
    const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
    const created = await getCoupon(Number(insertId), db);
    if (!created) throw new Error('createCoupon: row tidak ditemukan setelah insert');
    return created;
  } catch (e) {
    if (isDupErr(e)) throw new DuplicateCouponCodeError();
    throw e;
  }
}

export async function updateCoupon(id: number, input: CouponInput, db: DrizzleDb = defaultDb): Promise<CouponItem | null> {
  const existing = await getCoupon(id, db);
  if (!existing) return null;
  await assertPlanExists(input.planId, db);
  try {
    await db.update(coupons).set({
      code: input.code.trim(),
      codeUpper: normalizeCode(input.code),
      type: input.type,
      value: input.value,
      maxUses: input.maxUses,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      planId: input.planId,
      isActive: input.isActive ? 1 : 0,
      updatedAt: new Date(),
      // CATATAN: used_count TIDAK di-set di sini (server-managed, dipakai 5.2).
    }).where(eq(coupons.id, id));
  } catch (e) {
    if (isDupErr(e)) throw new DuplicateCouponCodeError();
    throw e;
  }
  return getCoupon(id, db);
}
