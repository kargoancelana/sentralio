/**
 * Staff permissions service.
 *
 * The authorization matrix for the `admin` role is fixed (full access). For the
 * `staff` role, a subset of features is configurable by an admin and persisted
 * in the `staff_permissions` table (scoped per-company). This service loads
 * those toggles into an in-memory cache keyed by companyId (refreshed on write
 * and lazily on first read) so that `decide()` stays synchronous and fast on
 * the hot path.
 *
 * Feature classification:
 *   - ALWAYS_ON_STAFF: features staff always have (cannot be disabled).
 *   - ADMIN_ONLY: features staff can NEVER have (not configurable).
 *   - CONFIGURABLE: features an admin may toggle on/off for staff.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { staffPermissions, companies } from '../../db/schema';
import { FEATURES, type Feature } from './matrix';

/** Features staff always have access to, regardless of configuration. */
export const ALWAYS_ON_STAFF: readonly Feature[] = ['pengaturan', 'me_logout'] as const;

/** Features that are admin-only and can never be granted to staff. */
export const ADMIN_ONLY: readonly Feature[] = ['user_management', 'integrasi_toko'] as const;

/** Features an admin may toggle for staff. */
export const CONFIGURABLE_STAFF_FEATURES: readonly Feature[] = FEATURES.filter(
  (f) => !ALWAYS_ON_STAFF.includes(f) && !ADMIN_ONLY.includes(f),
);

/** Default enabled-state for configurable features (used when DB has no row). */
const DEFAULT_ENABLED: Record<string, boolean> = {
  orders: true,
  cetak_label: true,
  master_produk: false,
  produk_channel: false,
  laporan_keuangan: false,
  auto_boost: false,
};

// ─── In-memory cache (per-company) ───────────────────────────────────────────
// Keyed by companyId. A company absent from the map means its permissions have
// not been loaded yet (cold) and reads fall back to compiled defaults until a
// background load populates it.

const cache: Map<number, Map<Feature, boolean>> = new Map();

type AnyDb = typeof defaultDb;

/** Load the staff permission rows for ONE company from the DB into the cache. */
export async function loadStaffPermissions(
  companyId: number,
  db: AnyDb = defaultDb,
): Promise<Map<Feature, boolean>> {
  const next = new Map<Feature, boolean>();

  // Seed with defaults first so missing rows fall back sensibly.
  for (const f of CONFIGURABLE_STAFF_FEATURES) {
    next.set(f, DEFAULT_ENABLED[f] ?? false);
  }

  try {
    const rows = await db
      .select()
      .from(staffPermissions)
      .where(eq(staffPermissions.companyId, companyId));
    for (const row of rows) {
      const feature = row.feature as Feature;
      if (CONFIGURABLE_STAFF_FEATURES.includes(feature)) {
        next.set(feature, row.enabled === 1);
      }
    }
  } catch {
    // If the table does not exist yet (pre-migration), keep defaults.
  }

  cache.set(companyId, next);
  return next;
}

/**
 * Force the cache to refresh on next access. Pass a companyId to invalidate just
 * that company, or omit to clear the entire cache.
 */
export function invalidateStaffPermissionsCache(companyId?: number): void {
  if (companyId === undefined) {
    cache.clear();
  } else {
    cache.delete(companyId);
  }
}

/**
 * Synchronous check used by decide() for staff. Reads the per-company cache; if
 * the company is cold it falls back to compiled defaults (and triggers a
 * background load). When companyId is undefined (no company context) it also
 * falls back to compiled defaults. Call ensureStaffPermissionsLoaded() at
 * startup to warm all companies.
 */
export function isStaffFeatureEnabled(feature: Feature, companyId?: number): boolean {
  if (ALWAYS_ON_STAFF.includes(feature)) return true;
  if (ADMIN_ONLY.includes(feature)) return false;

  // No company context → answer from compiled defaults.
  if (companyId === undefined) {
    return DEFAULT_ENABLED[feature] ?? false;
  }

  const companyCache = cache.get(companyId);
  if (companyCache === undefined) {
    // Cold cache for this company: trigger async load, answer from defaults now.
    void loadStaffPermissions(companyId);
    return DEFAULT_ENABLED[feature] ?? false;
  }

  return companyCache.get(feature) ?? DEFAULT_ENABLED[feature] ?? false;
}

/**
 * Warm the cache for ALL companies (call once at startup). No-arg by design so
 * the existing startup call in index.ts stays unchanged.
 */
export async function ensureStaffPermissionsLoaded(db: AnyDb = defaultDb): Promise<void> {
  try {
    const rows = await db.select({ id: companies.id }).from(companies);
    for (const row of rows) {
      if (!cache.has(row.id)) {
        await loadStaffPermissions(row.id, db);
      }
    }
  } catch {
    // companies table missing (pre-migration) — leave cache empty; the lazy
    // per-company load in isStaffFeatureEnabled handles warming on first read.
  }
}

/**
 * Return the full configurable permission map for the admin UI, for ONE company.
 * Always reflects current persisted state (loads if that company is cold).
 */
export async function getStaffPermissions(
  companyId: number,
  db: AnyDb = defaultDb,
): Promise<Array<{ feature: Feature; enabled: boolean }>> {
  const map = cache.get(companyId) ?? (await loadStaffPermissions(companyId, db));
  return CONFIGURABLE_STAFF_FEATURES.map((feature) => ({
    feature,
    enabled: map.get(feature) ?? DEFAULT_ENABLED[feature] ?? false,
  }));
}

/**
 * Persist a set of staff permission toggles for ONE company. Only CONFIGURABLE
 * features are accepted; unknown or non-configurable keys are ignored. Refreshes
 * that company's cache.
 */
export async function setStaffPermissions(
  companyId: number,
  updates: Array<{ feature: string; enabled: boolean }>,
  db: AnyDb = defaultDb,
): Promise<void> {
  for (const u of updates) {
    const feature = u.feature as Feature;
    if (!CONFIGURABLE_STAFF_FEATURES.includes(feature)) continue;

    const enabled = u.enabled ? 1 : 0;
    await db
      .insert(staffPermissions)
      .values({ companyId, feature, enabled })
      .onDuplicateKeyUpdate({ set: { enabled, updatedAt: new Date() } });
  }

  await loadStaffPermissions(companyId, db);
}

// Wire the dynamic resolver into the matrix so decide('staff', ...) consults
// the admin-configurable permission set. Imported here (not in matrix.ts) to
// keep the dependency direction one-way and avoid a circular import.
import { registerStaffResolver } from './matrix';
registerStaffResolver(isStaffFeatureEnabled);
