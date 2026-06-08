// Authorization matrix — single source of truth (mirrored at apps/web/src/auth/matrix.ts)
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
 * Pluggable resolver for staff feature access. Defaults to the static matrix
 * (used in tests and before the dynamic permissions service registers itself).
 * The permissions service overrides this at startup so staff access reflects
 * admin-configured toggles. This indirection avoids a circular import between
 * matrix.ts and permissions.service.ts.
 */
let staffResolver: (feature: Feature) => boolean = (feature) =>
  MATRIX.staff[feature] ?? false;

/** Register the dynamic staff resolver (called by permissions.service). */
export function registerStaffResolver(resolver: (feature: Feature) => boolean): void {
  staffResolver = resolver;
}

/**
 * Returns true if the given role is allowed to access the given feature.
 *
 * Admin always has full access. Staff access is resolved via the registered
 * staff resolver (dynamic, admin-configurable; defaults to the static matrix).
 *
 * Implements Requirement 5.10 and 11.1.
 */
export function decide(role: Role, feature: Feature): boolean {
  if (role === 'admin') return MATRIX.admin[feature] ?? false;
  return staffResolver(feature);
}

/**
 * Returns the list of features that are visible (allowed) for the given role.
 * Used to filter sidebar navigation entries per Requirement 11.5.
 */
export function visibleNavFor(role: Role): Feature[] {
  return FEATURES.filter((feature) => decide(role, feature));
}
