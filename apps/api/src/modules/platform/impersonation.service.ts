/**
 * Impersonation_Service (Fase 7.1) — Super Admin "lihat sebagai" user tenant.
 *
 * Bikin token impersonation (30 menit) dengan klaim `imp` = id platform admin.
 * Start/stop dicatat di audit log. Guardrail aksi sensitif = Fase 7.2.
 */

import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { users } from '../../db/schema';
import { signImpersonationJwt, verifyJwtIgnoreExp } from '../auth/jwt';
import { buildSessionCookie, buildClearCookie } from '../auth/cookie';
import { revokeSessionJti } from '../auth/auth.service';
import type { DrizzleDb } from '../auth/lockout';

export type StartResult =
  | { kind: 'ok'; cookie: string; user: { id: number; name: string; companyId: number } }
  | { kind: 'not-found' };

/**
 * Mulai sesi impersonation: bikin token tenant (30 menit) atas nama user target,
 * dengan klaim `imp` = id admin platform yang impersonate.
 *
 * Returns `not-found` jika user tidak ada, bukan bagian dari companyId tsb,
 * atau tidak aktif. Returns `ok` + cookie jika berhasil.
 */
export async function startImpersonation(input: {
  adminId: number;
  companyId: number;
  userId: number;
  now: Date;
  db?: DrizzleDb;
}): Promise<StartResult> {
  const db = input.db ?? defaultDb;

  // Lookup user: harus ada, harus di company yang benar, harus aktif.
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.userId), eq(users.companyId, input.companyId)))
    .limit(1);

  const u = rows[0];
  if (!u || u.isActive !== 1) {
    return { kind: 'not-found' };
  }

  // Mint impersonation JWT: durasi 30 menit, klaim `imp` = adminId.
  const jwt = await signImpersonationJwt(
    {
      sub: u.id,
      role: u.role,
      companyId: u.companyId,
      imp: input.adminId,
    },
    input.now,
  );

  return {
    kind: 'ok',
    cookie: buildSessionCookie(jwt),
    user: { id: u.id, name: u.name, companyId: u.companyId },
  };
}

/**
 * Stop sesi impersonation: revoke jti token impersonation + clear cookie.
 *
 * Returns `stopped` = { userId, adminId } jika token valid + punya klaim `imp`.
 * Returns `stopped` = null jika token invalid/tanpa `imp` (tetap clear cookie).
 */
export async function stopImpersonation(input: {
  cookieValue: string | undefined;
  now: Date;
  db?: DrizzleDb;
}): Promise<{ clearCookie: string; stopped: { userId: number; adminId?: number } | null }> {
  const db = input.db ?? defaultDb;
  let stopped: { userId: number; adminId?: number } | null = null;

  if (input.cookieValue) {
    try {
      const p = await verifyJwtIgnoreExp(input.cookieValue);
      // Hanya revoke jika token punya klaim `imp` (impersonation token).
      if (p.imp != null) {
        await revokeSessionJti(db, p.sub, p.jti, p.exp, input.now);
        stopped = { userId: p.sub, adminId: p.imp };
      }
    } catch {
      // Token invalid: tetap clear cookie, tapi stopped = null.
    }
  }

  return { clearCookie: buildClearCookie(), stopped };
}
