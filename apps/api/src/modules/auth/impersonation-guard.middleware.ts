/**
 * Impersonation_Guard_Middleware (Fase 7.2) — guardrails saat sesi impersonation.
 *
 * Kalau sesi tenant adalah sesi impersonation (klaim `imp` ada ->
 * ctx.impersonatorId != null), middleware ini:
 *   1. MEMBLOKIR aksi sensitif (ganti password + ubah billing/langganan) dengan
 *      403 { ok:false, error:'impersonation_forbidden' } + catat audit.
 *   2. MENCATAT semua request mutating (POST/PUT/PATCH/DELETE) lain sebagai
 *      aktivitas impersonated ke audit_log (fire-and-forget, tidak nunggu).
 *
 * Sesi normal (impersonatorId == null) -> no-op total.
 *
 * WAJIB di-mount SETELAH authMiddleware (butuh ctx.user + ctx.impersonatorId)
 * dan SEBELUM authProtectedRoutes/subscriptionRoutes, supaya onBeforeHandle
 * global-nya menjangkau /auth/change-password + /subscription/*.
 */

import { Elysia } from 'elysia';
import { logAudit, extractAuditIp } from '../platform/audit-log.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Bentuk context minimal yang kita baca (authMiddleware men-derive-nya global). */
interface ImpersonationCtx {
  impersonatorId?: number | null;
  user?: { companyId: number } | null;
  request: Request;
  server: { requestIP?: (req: Request) => { address: string } | null } | null;
  set: { status?: number | string };
}

/** Buang prefix '/api' opsional + query string + trailing slash. */
export function normalizeImpersonationPath(rawUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = (rawUrl.split('?')[0] ?? rawUrl);
  }
  if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
  else if (pathname === '/api') pathname = '/';
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  return pathname;
}

/**
 * True kalau (method, pathname) termasuk aksi sensitif yang DIBLOK selama
 * impersonation. `pathname` HARUS sudah dinormalisasi.
 */
export function isBlockedImpersonationRoute(method: string, pathname: string): boolean {
  if (method !== 'POST') return false;
  if (pathname === '/auth/change-password') return true;      // ganti password
  if (pathname === '/subscription/orders') return true;        // buat order langganan
  if (/^\/subscription\/orders\/\d+\/proof$/.test(pathname)) return true; // upload bukti
  return false;
}

export const impersonationGuardMiddleware = new Elysia({ name: 'impersonation-guard' })
  .onBeforeHandle({ as: 'global' }, (raw) => {
    const ctx = raw as unknown as ImpersonationCtx;
    const impersonatorId = ctx.impersonatorId;

    // Sesi normal (bukan impersonation) -> tidak ada guardrail.
    if (impersonatorId == null) return;

    const method = ctx.request.method.toUpperCase();
    const pathname = normalizeImpersonationPath(ctx.request.url);
    const companyId = ctx.user?.companyId ?? null;
    const ip = extractAuditIp(ctx.request, ctx.server as Parameters<typeof extractAuditIp>[1]);

    // 1. Blok aksi sensitif.
    if (isBlockedImpersonationRoute(method, pathname)) {
      ctx.set.status = 403;
      // Catat blokir (fire-and-forget; logAudit tidak pernah throw).
      void logAudit({
        actorType: 'platform',
        actorId: impersonatorId,
        companyId,
        action: 'platform.impersonation.blocked',
        targetType: 'route',
        targetId: `${method} ${pathname}`,
        ip,
      });
      return {
        ok: false,
        error: 'impersonation_forbidden',
        message:
          'Aksi ini diblokir selama mode impersonation (ganti password & ubah langganan).',
      };
    }

    // 2. Catat request mutating lain sebagai aktivitas impersonated.
    if (MUTATING_METHODS.has(method)) {
      void logAudit({
        actorType: 'platform',
        actorId: impersonatorId,
        companyId,
        action: 'platform.impersonation.request',
        targetType: 'route',
        targetId: `${method} ${pathname}`,
        ip,
      });
    }
  });
