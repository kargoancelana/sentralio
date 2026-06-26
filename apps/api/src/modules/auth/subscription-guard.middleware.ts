/**
 * Subscription Guard Middleware — hard block company tanpa langganan aktif.
 *
 * Mount SETELAH authMiddleware + authProtectedRoutes + subscriptionRoutes,
 * SEBELUM featureGuardMiddleware.
 *
 * Company tanpa langganan aktif → 402 subscription_required.
 * Exempt: /auth/*, /health, /subscription/* (tetap bisa diakses walau blocked).
 */

import { Elysia } from 'elysia';
import { getActiveSubscription } from '../platform/platform-subscriptions.service';

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

/** Prefix yang di-exempt dari subscription enforcement. */
const EXEMPT_PREFIXES = ['/auth', '/health', '/subscription'];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

export const subscriptionGuardMiddleware = new Elysia({ name: 'subscription-guard' })
  .onBeforeHandle({ as: 'global' }, async ({ request, user, set }) => {
    // authMiddleware sudah handle 401 — defensif skip kalau belum ter-autentikasi.
    if (!user) return;

    const pathname = pathnameOf(request.url);

    // Exempt: auth, health, subscription status endpoint.
    if (isExempt(pathname)) return;

    // Lazy-expire + cek langganan aktif.
    const activeSub = await getActiveSubscription(user.companyId, new Date());

    if (activeSub) return; // lolos

    set.status = 402;
    return {
      ok: false,
      error: 'subscription_required',
      message:
        'Langganan perusahaan Anda tidak aktif. Hubungi admin/penyedia layanan untuk mengaktifkan kembali.',
    };
  });
