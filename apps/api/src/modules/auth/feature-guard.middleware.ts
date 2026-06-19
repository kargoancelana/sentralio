/**
 * Feature-guard middleware — centralized, path-based authorization.
 *
 * Maps request path prefixes to matrix Features and enforces `decide(role, feature)`
 * in a single place (onBeforeHandle), so configurable staff permissions actually
 * block backend access (403) rather than being cosmetic frontend-only hiding.
 *
 * Mount AFTER authMiddleware (so ctx.user is set) and BEFORE the feature route
 * modules. Routes not matched by any rule are allowed (auth is still required by
 * authMiddleware). user_management is enforced separately in the users routes.
 *
 * Requirements: 5.8, 5.9, 5.10, 11.1
 */

import { Elysia } from 'elysia';
import { decide, type Feature } from './matrix';

/** Ordered prefix → feature rules. First match wins. */
const RULES: Array<{ prefix: string; feature: Feature }> = [
  { prefix: '/master', feature: 'master_produk' },
  { prefix: '/hpp', feature: 'master_produk' },
  { prefix: '/packing-cost', feature: 'master_produk' },
  { prefix: '/master-packing-cost', feature: 'master_produk' },
  { prefix: '/products', feature: 'produk_channel' },
  { prefix: '/profit', feature: 'laporan_keuangan' },
  { prefix: '/shopee', feature: 'integrasi_toko' },
  // Manual Shopee sync triggers (force/escrow/status) — sensitif, admin-only.
  { prefix: '/sync', feature: 'integrasi_toko' },
  // Orders + labels are the staff baseline; still gated so an admin could
  // disable them for staff if desired.
  { prefix: '/orders', feature: 'orders' },
  { prefix: '/auto-boost', feature: 'auto_boost' },
];

/** Resolve the pathname from a full request URL, ignoring query string. */
function pathnameOf(url: string): string {
  const qIdx = url.indexOf('?');
  const noQuery = qIdx === -1 ? url : url.slice(0, qIdx);
  // Strip scheme+host if present.
  const schemeIdx = noQuery.indexOf('://');
  if (schemeIdx !== -1) {
    const afterHost = noQuery.indexOf('/', schemeIdx + 3);
    return afterHost === -1 ? '/' : noQuery.slice(afterHost);
  }
  return noQuery;
}

/** Find the first matching feature for a pathname, or null if unguarded. */
export function featureForPath(pathname: string): Feature | null {
  for (const rule of RULES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) {
      return rule.feature;
    }
  }
  return null;
}

export const featureGuardMiddleware = new Elysia({ name: 'feature-guard' }).onBeforeHandle(
  { as: 'global' },
  ({ request, user, set }) => {
    // authMiddleware already rejected unauthenticated requests; defensively skip.
    if (!user) return;

    const pathname = pathnameOf(request.url);
    const feature = featureForPath(pathname);
    if (feature === null) return; // unguarded route

    if (!decide(user.role, feature, user.companyId)) {
      set.status = 403;
      return {
        ok: false,
        error: 'forbidden',
        message: `Akses ditolak: Anda tidak memiliki izin untuk fitur ini.`,
      };
    }
  },
);
