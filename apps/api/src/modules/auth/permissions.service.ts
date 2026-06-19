/**
 * Staff permissions service.
 *
 * The authorization matrix for the `admin` role is fixed (full access). For the
 * `staff` role, a subset of features is configurable by an admin and persisted
 * in the `staff_permissions` table. This service loads those toggles into an
 * in-memory cache (refreshed on write and lazily on first read) so that
 * `decide()` stays synchronous and fast on the hot path.
 *
 * Feature classification:
 *   - ALWAYS_ON_STAFF: features staff always have (cannot be disabled).
 *   - ADMIN_ONLY: features staff can NEVER have (not configurable).
 *   - CONFIGURABLE: features an admin may toggle on/off for staff.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { staffPermissions } from '../../db/schema';
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

// ─── In-memory cache ────────────────────────────────────────────────────────

let cache: Map<Feature, boolean> | null = null;

type AnyDb = typeof defaultDb;

/** Load the staff permission rows from the DB into the cache. */
export async function loadStaffPermissions(db: AnyDb = defaultDb): Promise<Map<Feature, boolean>> {
  const next = new Map<Feature, boolean>();

  // Seed with defaults first so missing rows fall back sensibly.
  for (const f of CONFIGURABLE_STAFF_FEATURES) {
    next.set(f, DEFAULT_ENABLED[f] ?? false);
  }

  try {
    const rows = await db.select().from(staffPermissions);
    for (const row of rows) {
      const feature = row.feature as Feature;
      if (CONFIGURABLE_STAFF_FEATURES.includes(feature)) {
        next.set(feature, row.enabled === 1);
      }
    }
  } catch {
    // If the table does not exist yet (pre-migration), keep defaults.
  }

  cache = next;
  return next;
}

/** Force the cache to refresh on next access. */
export function invalidateStaffPermissionsCache(): void {
  cache = null;
}

/**
 * Synchronous check used by decide() for staff. Reads the cache; if the cache
 * is cold it falls back to compiled defaults (and a background load is
 * triggered). Call ensureStaffPermissionsLoaded() at startup to warm it.
 */
export function isStaffFeatureEnabled(feature: Feature, _companyId?: number): boolean {
  if (ALWAYS_ON_STAFF.includes(feature)) return true;
  if (ADMIN_ONLY.includes(feature)) return false;

  if (cache === null) {
    // Cold cache: trigger async load, answer from defaults this time.
    void loadStaffPermissions();
    return DEFAULT_ENABLED[feature] ?? false;
  }

  return cache.get(feature) ?? DEFAULT_ENABLED[feature] ?? false;
}

/** Warm the cache (call once at startup). */
export async function ensureStaffPermissionsLoaded(db: AnyDb = defaultDb): Promise<void> {
  if (cache === null) {
    await loadStaffPermissions(db);
  }
}

/**
 * Return the full configurable permission map for the admin UI.
 * Always reflects current persisted state (loads if cache is cold).
 */
export async function getStaffPermissions(
  db: AnyDb = defaultDb,
): Promise<Array<{ feature: Feature; enabled: boolean }>> {
  const map = cache ?? (await loadStaffPermissions(db));
  return CONFIGURABLE_STAFF_FEATURES.map((feature) => ({
    feature,
    enabled: map.get(feature) ?? DEFAULT_ENABLED[feature] ?? false,
  }));
}

/**
 * Persist a set of staff permission toggles. Only CONFIGURABLE features are
 * accepted; unknown or non-configurable keys are ignored. Refreshes the cache.
 */
export async function setStaffPermissions(
  updates: Array<{ feature: string; enabled: boolean }>,
  db: AnyDb = defaultDb,
): Promise<void> {
  for (const u of updates) {
    const feature = u.feature as Feature;
    if (!CONFIGURABLE_STAFF_FEATURES.includes(feature)) continue;

    const enabled = u.enabled ? 1 : 0;
    await db
      .insert(staffPermissions)
      .values({ feature, enabled })
      .onDuplicateKeyUpdate({ set: { enabled, updatedAt: new Date() } });
  }

  await loadStaffPermissions(db);
}

// Wire the dynamic resolver into the matrix so decide('staff', ...) consults
// the admin-configurable permission set. Imported here (not in matrix.ts) to
// keep the dependency direction one-way and avoid a circular import.
import { registerStaffResolver } from './matrix';
registerStaffResolver(isStaffFeatureEnabled);
