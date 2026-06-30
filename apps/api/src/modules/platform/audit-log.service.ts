/**
 * Audit_Log_Service (Fase 6.1) — pencatatan aksi sensitif portal Super Admin.
 *
 * logAudit() bersifat FIRE-AND-FORGET & TIDAK PERNAH throw: kegagalan audit
 * (DB down, dll) tidak boleh menggagalkan aksi bisnis utama. Viewer = Fase 6.2.
 */

import { db as defaultDb } from '../../db/client';
import { auditLog } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

/** Batas panjang snapshot JSON supaya kolom TEXT tidak meledak. */
const MAX_JSON_LEN = 8000;

export type AuditActorType = 'platform' | 'company';

export interface LogAuditInput {
  actorType: AuditActorType;
  actorId: number | null;
  action: string;
  companyId?: number | null;
  targetType?: string | null;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  db?: DrizzleDb;
}

/** Serialize aman: undefined/null -> null, truncate ke MAX_JSON_LEN, gagal -> null. */
export function serializeSnapshot(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const json = JSON.stringify(value);
    if (json == null) return null;
    return json.length > MAX_JSON_LEN ? json.slice(0, MAX_JSON_LEN) : json;
  } catch {
    return null;
  }
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  const db = input.db ?? defaultDb;
  try {
    await db.insert(auditLog).values({
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      companyId: input.companyId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId == null ? null : String(input.targetId),
      beforeJson: serializeSnapshot(input.before),
      afterJson: serializeSnapshot(input.after),
      ip: input.ip ?? null,
    });
  } catch (e) {
    // SENGAJA ditelan — audit gagal tidak boleh menggagalkan aksi utama.
    console.warn('[audit] gagal mencatat audit log:', (e as Error)?.message ?? e);
  }
}

/**
 * Ambil IP client dari context Elysia. WAJIB mirror PERSIS logika extractIp()
 * yang sudah ada di platform-auth.route.ts (x-forwarded-for -> x-real-ip ->
 * server.requestIP -> '0.0.0.0'). Baca file itu dulu; kalau beda, samakan.
 */
export function extractAuditIp(
  request: Request,
  server: { requestIP?: (req: Request) => { address: string } | null } | null,
): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  if (server?.requestIP) {
    const addr = server.requestIP(request);
    if (addr?.address) return addr.address;
  }
  return '0.0.0.0';
}
