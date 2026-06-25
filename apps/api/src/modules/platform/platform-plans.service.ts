/**
 * Platform_Plans_Service — CRUD paket langganan untuk portal Super Admin.
 *
 * Dipakai route /platform/plans (list, get, create, update).
 * Tidak ada hard delete — plan cuma bisa dinonaktifin via isActive=false.
 * FK subscriptions.plan_id -> plans.id mencegah hapus permanen.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { plans } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface PlanItem {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  maxShops: number;
  maxUsers: number;
  features: string[] | null;   // hasil parse features_json
  isActive: boolean;           // dari is_active === 1
  createdAt: string;
  updatedAt: string;
}

export interface PlanInput {
  name: string;
  durationDays: number;
  price: number;
  maxShops: number;
  maxUsers: number;
  features: string[] | null;
  isActive: boolean;
}

// ── helpers ──────────────────────────────────────────────────

function parseFeaturesJson(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
    return null;
  } catch {
    return null;
  }
}

function serializeFeaturesJson(features: string[] | null | undefined): string | null {
  if (features == null || features.length === 0) return null;
  return JSON.stringify(features);
}

function rowToItem(row: typeof plans.$inferSelect): PlanItem {
  return {
    id: row.id,
    name: row.name,
    durationDays: row.durationDays,
    price: row.price,
    maxShops: row.maxShops,
    maxUsers: row.maxUsers,
    features: parseFeaturesJson(row.featuresJson),
    isActive: row.isActive === 1,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── queries ───────────────────────────────────────────────────

/** Semua plan, diurut id naik. */
export async function listPlans(db: DrizzleDb = defaultDb): Promise<PlanItem[]> {
  const rows = await db.select().from(plans).orderBy(plans.id);
  return rows.map(rowToItem);
}

/** 1 plan berdasarkan id, null kalau tidak ada. */
export async function getPlan(id: number, db: DrizzleDb = defaultDb): Promise<PlanItem | null> {
  const rows = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return rows[0] ? rowToItem(rows[0]) : null;
}

/** Insert plan baru, return row yang baru dibuat. */
export async function createPlan(input: PlanInput, db: DrizzleDb = defaultDb): Promise<PlanItem> {
  const result = await db.insert(plans).values({
    name: input.name.trim(),
    durationDays: input.durationDays,
    price: input.price,
    maxShops: input.maxShops,
    maxUsers: input.maxUsers,
    featuresJson: serializeFeaturesJson(input.features),
    isActive: input.isActive ? 1 : 0,
  });

  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  const created = await getPlan(Number(insertId), db);
  if (!created) throw new Error('createPlan: row tidak ditemukan setelah insert');
  return created;
}

/** Update semua field plan. null kalau id tidak ada. */
export async function updatePlan(
  id: number,
  input: PlanInput,
  db: DrizzleDb = defaultDb,
): Promise<PlanItem | null> {
  const existing = await getPlan(id, db);
  if (!existing) return null;

  await db
    .update(plans)
    .set({
      name: input.name.trim(),
      durationDays: input.durationDays,
      price: input.price,
      maxShops: input.maxShops,
      maxUsers: input.maxUsers,
      featuresJson: serializeFeaturesJson(input.features),
      isActive: input.isActive ? 1 : 0,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, id));

  return getPlan(id, db);
}
