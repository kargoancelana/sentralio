/**
 * Maintenance Guard Middleware — hard block akses saat maintenance level='full'.
 *
 * Mount SETELAH authMiddleware + authProtectedRoutes + subscriptionRoutes,
 * SEBELUM subscriptionGuardMiddleware + feature routes.
 *
 * Saat maintenance level='full' → 503 maintenance, blok semua route tenant.
 * Level 'banner' & 'off' → TIDAK memblok apa pun (cuma diekspos lewat /system/status).
 *
 * Exempt: /auth/*, /subscription/*, /system/status, /platform/* (Super Admin tetap bisa matiin maintenance).
 */

import { Elysia } from 'elysia';
import { getMaintenance } from '../platform/platform-settings.service';

/** Resolve pathname dari full URL, strip scheme+host dan query string. */
function pathnameOf(url: string): string {
  const qIdx = url.indexOf('?');
  const noQuery = qIdx === -1 ? url : url.slice(0, qIdx);
  const schemeIdx = noQuery.indexOf('://');
  if (schemeIdx !== -1) {
    const afterHost = noQuery.indexOf('/', schemeIdx + 3);
    return afterHost === -1 ? '/' : noQuery.slice(afterHost);
  }
  return noQuery;
}

/**
 * Prefix yang di-exempt dari maintenance enforcement.
 * /auth/* - login/logout tetap jalan
 * /health - health check (Caddy/monitoring), jangan blok
 * /subscription/* - company tetap bisa lihat status langganan & payment info
 * /system/status - frontend perlu cek status maintenance
 * /platform/* - Super Admin portal (tetap bisa akses untuk matiin maintenance)
 * /shopee/* - webhook push dari Shopee, jangan blok
 */
const EXEMPT_PREFIXES = ['/auth', '/health', '/subscription', '/system/status', '/platform', '/shopee'];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

export const maintenanceGuardMiddleware = new Elysia({ name: 'maintenance-guard' })
  .onBeforeHandle({ as: 'global' }, async ({ request, set }) => {
    const pathname = pathnameOf(request.url);

    // Exempt: auth, health, subscription, system status, platform portal, shopee webhook.
    // Note: /shopee/* dan routes publik lainnya tidak akan kena blok karena di-exempt.
    if (isExempt(pathname)) return;

    // Cek maintenance status (cached).
    const maintenance = await getMaintenance();

    // Hanya level 'full' yang blok akses. 'banner' & 'off' → lolos.
    if (maintenance.level !== 'full') return;

    // Blok dengan 503 maintenance.
    set.status = 503;
    return {
      ok: false,
      error: 'maintenance',
      message: maintenance.message || 'Sistem sedang dalam maintenance. Silakan coba lagi nanti.',
    };
  });
