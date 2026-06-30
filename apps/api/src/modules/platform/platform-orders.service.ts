/**
 * Platform_Orders_Service — review/approve/reject subscription_orders (Fase 4.3a).
 *
 * Approve (atomic transaction):
 *   1. order → approved, set reviewedBy + reviewedAt
 *   2. auto-cancel subscriptions company yg active
 *   3. INSERT subscription baru (active, endsAt = now + durationDays)
 *   4. company → active
 *
 * Reject (atomic transaction):
 *   1. order → rejected, set reviewedBy + reviewedAt + note
 *   (company & subscriptions tidak disentuh)
 *
 * TIDAK memanggil assignSubscription (nested transaction); logika cancel+insert
 * direplikasi langsung di dalam transaction approveOrder.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { subscriptionOrders, subscriptions, plans, companies, coupons } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface PlatformOrderItem {
  id: number;
  companyId: number;
  companyName: string | null;
  planId: number;
  planName: string | null;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  proofKey: string | null;
  note: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null; // ISO
  createdAt: string;         // ISO
  couponId: number | null;
  couponCode: string | null;
  discountAmount: number;
}

export type ApproveResult =
  | { kind: 'ok'; order: PlatformOrderItem }
  | { kind: 'not_found' }
  | { kind: 'not_pending' }
  | { kind: 'plan_missing' };

export type RejectResult =
  | { kind: 'ok'; order: PlatformOrderItem }
  | { kind: 'not_found' }
  | { kind: 'not_pending' }
  | { kind: 'invalid_note' };

// ── helpers ──────────────────────────────────────────────────

function mapOrderRow(row: {
  id: number;
  companyId: number;
  companyName: string | null;
  planId: number;
  planName: string | null;
  amount: number;
  status: string;
  proofKey: string | null;
  note: string | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  createdAt: Date;
  couponId: number | null;
  couponCode: string | null;
  discountAmount: number;
}): PlatformOrderItem {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyName,
    planId: row.planId,
    planName: row.planName,
    amount: row.amount,
    status: row.status as 'pending' | 'approved' | 'rejected',
    proofKey: row.proofKey ?? null,
    note: row.note ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    couponId: row.couponId ?? null,
    couponCode: row.couponCode ?? null,
    discountAmount: row.discountAmount,
  };
}

async function selectOrderById(
  orderId: number,
  db: DrizzleDb,
): Promise<PlatformOrderItem | null> {
  const rows = await db
    .select({
      id: subscriptionOrders.id,
      companyId: subscriptionOrders.companyId,
      companyName: companies.name,
      planId: subscriptionOrders.planId,
      planName: plans.name,
      amount: subscriptionOrders.amount,
      status: subscriptionOrders.status,
      proofKey: subscriptionOrders.proofKey,
      note: subscriptionOrders.note,
      reviewedBy: subscriptionOrders.reviewedBy,
      reviewedAt: subscriptionOrders.reviewedAt,
      createdAt: subscriptionOrders.createdAt,
      couponId: subscriptionOrders.couponId,
      couponCode: coupons.code,
      discountAmount: subscriptionOrders.discountAmount,
    })
    .from(subscriptionOrders)
    .leftJoin(companies, eq(subscriptionOrders.companyId, companies.id))
    .leftJoin(plans, eq(subscriptionOrders.planId, plans.id))
    .leftJoin(coupons, eq(subscriptionOrders.couponId, coupons.id))
    .where(eq(subscriptionOrders.id, orderId))
    .limit(1);
  return rows[0] ? mapOrderRow(rows[0]) : null;
}

// ── queries ───────────────────────────────────────────────────

/** List order lintas company, filter opsional by status, DESC by id. */
export async function listAllOrders(
  args: { status?: 'pending' | 'approved' | 'rejected'; db?: DrizzleDb } = {},
): Promise<PlatformOrderItem[]> {
  const db = args.db ?? defaultDb;

  const baseQuery = db
    .select({
      id: subscriptionOrders.id,
      companyId: subscriptionOrders.companyId,
      companyName: companies.name,
      planId: subscriptionOrders.planId,
      planName: plans.name,
      amount: subscriptionOrders.amount,
      status: subscriptionOrders.status,
      proofKey: subscriptionOrders.proofKey,
      note: subscriptionOrders.note,
      reviewedBy: subscriptionOrders.reviewedBy,
      reviewedAt: subscriptionOrders.reviewedAt,
      createdAt: subscriptionOrders.createdAt,
      couponId: subscriptionOrders.couponId,
      couponCode: coupons.code,
      discountAmount: subscriptionOrders.discountAmount,
    })
    .from(subscriptionOrders)
    .leftJoin(companies, eq(subscriptionOrders.companyId, companies.id))
    .leftJoin(plans, eq(subscriptionOrders.planId, plans.id))
    .leftJoin(coupons, eq(subscriptionOrders.couponId, coupons.id))
    .orderBy(desc(subscriptionOrders.id));

  const rows = args.status
    ? await baseQuery.where(eq(subscriptionOrders.status, args.status))
    : await baseQuery;

  return rows.map(mapOrderRow);
}

/** Return proofKey order, atau null kalau order tidak ada. */
export async function getOrderProofKey(
  orderId: number,
  db: DrizzleDb = defaultDb,
): Promise<{ proofKey: string | null } | null> {
  const rows = await db
    .select({ proofKey: subscriptionOrders.proofKey })
    .from(subscriptionOrders)
    .where(eq(subscriptionOrders.id, orderId))
    .limit(1);
  if (!rows[0]) return null;
  return { proofKey: rows[0].proofKey ?? null };
}

/**
 * Approve order:
 *   order→approved, auto-cancel subscriptions active, insert subscription baru, company→active.
 *   Semua dalam 1 transaction. Plan lookup TANPA cek isActive (order sudah "dibayar").
 */
export async function approveOrder(args: {
  orderId: number;
  reviewedBy: number;
  now: Date;
  db?: DrizzleDb;
}): Promise<ApproveResult> {
  const db = args.db ?? defaultDb;
  const { orderId, reviewedBy, now } = args;

  // Cek order ada
  const orderRows = await db
    .select()
    .from(subscriptionOrders)
    .where(eq(subscriptionOrders.id, orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) return { kind: 'not_found' };
  if (order.status !== 'pending') return { kind: 'not_pending' };

  // Lookup plan (TANPA cek isActive — order sudah "dibayar")
  const planRows = await db
    .select()
    .from(plans)
    .where(eq(plans.id, order.planId))
    .limit(1);
  const plan = planRows[0];
  if (!plan) return { kind: 'plan_missing' };

  const startsAt = now;
  const endsAt = new Date(now.getTime() + plan.durationDays * 86400000);

  await db.transaction(async (tx) => {
    // 1. Order → approved
    await tx
      .update(subscriptionOrders)
      .set({ status: 'approved', reviewedBy, reviewedAt: now, updatedAt: now })
      .where(eq(subscriptionOrders.id, orderId));

    // 2. Increment used_count kalau order pakai kupon (Fase 5.2, atomic)
    if (order.couponId !== null) {
      await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1`, updatedAt: now })
        .where(eq(coupons.id, order.couponId));
    }

    // 3. Auto-cancel subscriptions active milik company ini
    await tx
      .update(subscriptions)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(subscriptions.companyId, order.companyId),
          eq(subscriptions.status, 'active'),
        ),
      );

    // 4. Insert subscription baru
    await tx.insert(subscriptions).values({
      companyId: order.companyId,
      planId: plan.id,
      status: 'active',
      startsAt,
      endsAt,
    });

    // 5. Company → active
    await tx
      .update(companies)
      .set({ status: 'active' })
      .where(eq(companies.id, order.companyId));
  });

  const updated = await selectOrderById(orderId, db);
  if (!updated) throw new Error('approveOrder: order tidak ditemukan setelah update');

  return { kind: 'ok', order: updated };
}

/**
 * Reject order: order→rejected + note. Company & subscriptions tidak disentuh.
 */
export async function rejectOrder(args: {
  orderId: number;
  reviewedBy: number;
  note: string;
  now: Date;
  db?: DrizzleDb;
}): Promise<RejectResult> {
  const db = args.db ?? defaultDb;
  const { orderId, reviewedBy, note, now } = args;

  if (!note || note.trim().length === 0) return { kind: 'invalid_note' };

  const orderRows = await db
    .select()
    .from(subscriptionOrders)
    .where(eq(subscriptionOrders.id, orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) return { kind: 'not_found' };
  if (order.status !== 'pending') return { kind: 'not_pending' };

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionOrders)
      .set({ status: 'rejected', reviewedBy, reviewedAt: now, note: note.trim(), updatedAt: now })
      .where(eq(subscriptionOrders.id, orderId));
  });

  const updated = await selectOrderById(orderId, db);
  if (!updated) throw new Error('rejectOrder: order tidak ditemukan setelah update');

  return { kind: 'ok', order: updated };
}
