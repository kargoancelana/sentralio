/**
 * Subscription_Plan_Service — list plan AKTIF untuk tenant (Fase 4.2a-2).
 *
 * Dipakai route GET /subscription/plans (self-service tenant, EXEMPT dari
 * subscription-guard via prefix /subscription/*). Tujuan: company 'pending' yang
 * belum punya langganan aktif bisa lihat daftar paket sebelum buat order.
 *
 * Hanya plan dengan is_active = 1 yang dikembalikan, diurut harga naik. Shape
 * sengaja diringkas (tanpa isActive/createdAt/updatedAt) — info internal admin
 * tidak perlu bocor ke tenant.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { plans } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface TenantPlanItem {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  maxShops: number;
  maxUsers: number;
  features: string[] | null; // hasil parse features_json
}

function parseFeaturesJson(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

/** List semua plan AKTIF, diurut harga naik. */
export async function listActivePlans(db: DrizzleDb = defaultDb): Promise<TenantPlanItem[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, 1))
    .orderBy(plans.price);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    durationDays: row.durationDays,
    price: row.price,
    maxShops: row.maxShops,
    maxUsers: row.maxUsers,
    features: parseFeaturesJson(row.featuresJson),
  }));
}
