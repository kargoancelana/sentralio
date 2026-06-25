/**
 * Platform_Subscriptions_Service — assign & manage langganan company untuk portal Super Admin.
 *
 * Aturan desain (FINAL):
 * - Assign = INSERT row baru (riwayat lama dipertahankan, tidak di-overwrite/delete).
 * - Sebelum insert: auto-cancel semua row active company itu, lakukan dalam 1 transaction.
 * - Cancel = set status='cancelled' manual (status 'expired' diset enforcement 3.3b, bukan di sini).
 * - Cuma plan dengan is_active=1 yang boleh di-assign.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { subscriptions, plans, companies } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface SubscriptionItem {
  id: number;
  companyId: number;
  planId: number;
  planName: string;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: string;  // ISO
  endsAt: string;    // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

type AssignResult =
  | { kind: 'ok'; subscription: SubscriptionItem }
  | { kind: 'company_not_found' }
  | { kind: 'plan_invalid' }; // plan tidak ada ATAU is_active != 1

type CancelResult =
  | { kind: 'ok'; subscription: SubscriptionItem }
  | { kind: 'not_found' }   // row tidak ada ATAU bukan milik company ini
  | { kind: 'not_active' }; // status bukan 'active'

// ── helpers ──────────────────────────────────────────────────

function rowToItem(row: {
  id: number;
  companyId: number;
  planId: number;
  planName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): SubscriptionItem {
  return {
    id: row.id,
    companyId: row.companyId,
    planId: row.planId,
    planName: row.planName,
    status: row.status as 'active' | 'expired' | 'cancelled',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function selectSubById(
  id: number,
  db: DrizzleDb,
): Promise<SubscriptionItem | null> {
  const rows = await db
    .select({
      id: subscriptions.id,
      companyId: subscriptions.companyId,
      planId: subscriptions.planId,
      planName: plans.name,
      status: subscriptions.status,
      startsAt: subscriptions.startsAt,
      endsAt: subscriptions.endsAt,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.id, id))
    .limit(1);
  return rows[0] ? rowToItem(rows[0]) : null;
}

// ── queries ───────────────────────────────────────────────────

/**
 * Semua langganan company + current (row active dengan endsAt terjauh).
 */
export async function getCompanySubscriptions(
  companyId: number,
  db: DrizzleDb = defaultDb,
): Promise<{ items: SubscriptionItem[]; current: SubscriptionItem | null }> {
  const rows = await db
    .select({
      id: subscriptions.id,
      companyId: subscriptions.companyId,
      planId: subscriptions.planId,
      planName: plans.name,
      status: subscriptions.status,
      startsAt: subscriptions.startsAt,
      endsAt: subscriptions.endsAt,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.companyId, companyId))
    .orderBy(desc(subscriptions.id));

  const items = rows.map(rowToItem);

  // current = active dengan endsAt terjauh
  const activeItems = items.filter((i) => i.status === 'active');
  const current =
    activeItems.length === 0
      ? null
      : activeItems.reduce((best, cur) =>
          cur.endsAt > best.endsAt ? cur : best,
        );

  return { items, current };
}

/**
 * Assign plan ke company.
 * - Auto-cancel semua row active company tersebut (dalam 1 transaction).
 * - Insert row baru dengan status='active', startsAt=now, endsAt=now+durationDays.
 */
export async function assignSubscription(args: {
  companyId: number;
  planId: number;
  now: Date;
  db?: DrizzleDb;
}): Promise<AssignResult> {
  const db = args.db ?? defaultDb;
  const { companyId, planId, now } = args;

  // cek company ada
  const companyRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!companyRows[0]) return { kind: 'company_not_found' };

  // cek plan ada dan aktif
  const planRows = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  const plan = planRows[0];
  if (!plan || plan.isActive !== 1) return { kind: 'plan_invalid' };

  const startsAt = now;
  const endsAt = new Date(now.getTime() + plan.durationDays * 86400000);

  let insertId: number;

  await db.transaction(async (tx) => {
    // auto-cancel semua row active
    await tx
      .update(subscriptions)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          eq(subscriptions.status, 'active'),
        ),
      );

    // insert row baru
    const res = await tx.insert(subscriptions).values({
      companyId,
      planId,
      status: 'active',
      startsAt,
      endsAt,
    });

    insertId = (res as any)[0]?.insertId ?? (res as any).insertId;
  });

  const subscription = await selectSubById(insertId!, db);
  if (!subscription) throw new Error('assignSubscription: row tidak ditemukan setelah insert');

  return { kind: 'ok', subscription };
}

/**
 * Cancel langganan tertentu milik company.
 */
export async function cancelSubscription(args: {
  companyId: number;
  subscriptionId: number;
  now: Date;
  db?: DrizzleDb;
}): Promise<CancelResult> {
  const db = args.db ?? defaultDb;
  const { companyId, subscriptionId, now } = args;

  // cek row ada dan milik company ini
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  const row = rows[0];
  if (!row || row.companyId !== companyId) return { kind: 'not_found' };
  if (row.status !== 'active') return { kind: 'not_active' };

  await db
    .update(subscriptions)
    .set({ status: 'cancelled', updatedAt: now })
    .where(eq(subscriptions.id, subscriptionId));

  const subscription = await selectSubById(subscriptionId, db);
  if (!subscription) throw new Error('cancelSubscription: row tidak ditemukan setelah update');

  return { kind: 'ok', subscription };
}
