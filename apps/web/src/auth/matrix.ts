// Authorization matrix — single source of truth (mirrored from apps/api/src/modules/auth/matrix.ts)
// Pinned to Requirement 11.1

export const FEATURES = [
  'orders',
  'cetak_label',
  'master_produk',
  'produk_channel',
  'integrasi_toko',
  'pengaturan',
  'laporan_keuangan',
  'user_management',
  'me_logout',
] as const;

export type Feature = typeof FEATURES[number];
export type Role = 'admin' | 'staff';

const MATRIX: Record<Role, Record<Feature, boolean>> = {
  admin: {
    orders: true,
    cetak_label: true,
    master_produk: true,
    produk_channel: true,
    integrasi_toko: true,
    pengaturan: true,
    laporan_keuangan: true,
    user_management: true,
    me_logout: true,
  },
  staff: {
    orders: true,
    cetak_label: true,
    master_produk: false,
    produk_channel: false,
    integrasi_toko: false,
    pengaturan: false,
    laporan_keuangan: false,
    user_management: false,
    me_logout: true,
  },
};

/**
 * Returns true if the given role is allowed to access the given feature.
 * Implements Requirement 5.10 and 11.1.
 */
export function decide(role: Role, feature: Feature): boolean {
  return MATRIX[role]?.[feature] ?? false;
}

/**
 * Returns the list of features that are visible (allowed) for the given role.
 * Used to filter sidebar navigation entries per Requirement 11.5.
 */
export function visibleNavFor(role: Role): Feature[] {
  const row = MATRIX[role];
  if (!row) return [];
  return FEATURES.filter((feature) => row[feature]);
}

/**
 * Returns the effective list of allowed features for a user. Prefers the
 * backend-provided `features` array (dynamic, admin-configurable staff
 * permissions); falls back to the static matrix when absent (older sessions).
 */
export function effectiveFeatures(user: { role: Role; features?: string[] }): Set<Feature> {
  if (Array.isArray(user.features)) {
    return new Set(user.features.filter((f): f is Feature => (FEATURES as readonly string[]).includes(f)));
  }
  return new Set(visibleNavFor(user.role));
}

/** True if the user can access a feature, using effective (dynamic) features. */
export function canAccess(user: { role: Role; features?: string[] }, feature: Feature): boolean {
  return effectiveFeatures(user).has(feature);
}
