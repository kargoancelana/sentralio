/**
 * Platform_Audit_Service (Fase 6.2) — viewer audit log di portal Super Admin.
 *
 * List audit_log dengan filter (company / action / tanggal) + pagination.
 * READ-ONLY: gak ada insert/update/delete (audit_log append-only via logAudit).
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { auditLog, companies } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

// ── types ────────────────────────────────────────────────────────

export interface AuditLogRow {
  id: number;
  actorType: 'platform' | 'company';
  actorId: number | null;
  companyId: number | null;
  companyName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  ip: string | null;
  createdAt: string; // ISO string
}

export interface ListAuditParams {
  db?: DrizzleDb;
  companyId?: number;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface ListAuditResult {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ── queries ──────────────────────────────────────────────────────

/**
 * List audit log dengan filter + pagination.
 * Sort: createdAt DESC (terbaru di atas).
 * Left join companies buat company_name (bisa null untuk aksi global).
 */
export async function listAuditLogs(params: ListAuditParams): Promise<ListAuditResult> {
  const db = params.db ?? defaultDb;

  // Clamp pageSize: min 1, max 50, default 50
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 50), 50);
  // Clamp page: min 1, default 1
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conds: any[] = [];
  if (params.companyId !== undefined) {
    conds.push(eq(auditLog.companyId, params.companyId));
  }
  if (params.action !== undefined && params.action.trim() !== '') {
    conds.push(eq(auditLog.action, params.action));
  }
  if (params.dateFrom !== undefined) {
    conds.push(gte(auditLog.createdAt, params.dateFrom));
  }
  if (params.dateTo !== undefined) {
    conds.push(lte(auditLog.createdAt, params.dateTo));
  }

  const whereClause = conds.length > 0 ? and(...conds) : undefined;

  // Count total
  const countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog);
  
  const countResult = whereClause
    ? await countQuery.where(whereClause)
    : await countQuery;
  
  const total = Number(countResult[0]?.count ?? 0);

  // Select rows
  const baseQuery = db
    .select({
      id: auditLog.id,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      companyId: auditLog.companyId,
      companyName: companies.name,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(companies, eq(auditLog.companyId, companies.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset(offset);

  const rowsRaw = whereClause
    ? await baseQuery.where(whereClause)
    : await baseQuery;

  // Map to AuditLogRow
  const rows: AuditLogRow[] = rowsRaw.map((r) => ({
    id: r.id,
    actorType: r.actorType as 'platform' | 'company',
    actorId: r.actorId ?? null,
    companyId: r.companyId ?? null,
    companyName: r.companyName ?? null,
    action: r.action,
    targetType: r.targetType ?? null,
    targetId: r.targetId ?? null,
    beforeJson: r.beforeJson ?? null,
    afterJson: r.afterJson ?? null,
    ip: r.ip ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    rows,
    total,
    page,
    pageSize,
  };
}

/**
 * List distinct action (sort asc) buat dropdown filter.
 */
export async function listAuditActions(args?: { db?: DrizzleDb }): Promise<string[]> {
  const db = args?.db ?? defaultDb;

  const rows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action);

  return rows.map((r) => r.action);
}
