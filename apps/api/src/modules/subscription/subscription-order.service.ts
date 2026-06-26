/**
 * Subscription_Order_Service — buat order langganan + attach bukti (Fase 4.2a).
 *
 * Dipakai route /subscription/orders* (tenant, EXEMPT dari subscription-guard
 * sehingga company 'pending' tetap bisa submit order + upload bukti walau belum
 * punya langganan aktif).
 *
 * TIDAK ada kupon di sini (Fase 5). amount = plan.price saat order dibuat.
 * Approve/reject + bikin row subscriptions ada di portal Super Admin (Fase 4.1),
 * BUKAN di sini.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { plans, subscriptionOrders } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface OrderItem {
  id: number;
  companyId: number;
  planId: number;
  planName: string | null;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  proofKey: string | null;
  note: string | null;
  createdAt: string;
}

export type CreateOrderResult =
  | { kind: 'ok'; order: OrderItem }
  | { kind: 'fail-validation'; message: string }
  | { kind: 'fail-plan-not-found' }
  | { kind: 'fail-pending-exists'; order: OrderItem }
  | { kind: 'fail-500' };

export type AttachProofResult =
  | { kind: 'ok' }
  | { kind: 'fail-not-found' }
  | { kind: 'fail-not-pending' }
  | { kind: 'fail-500' };

function mapOrderRow(row: any, planName: string | null): OrderItem {
  return {
    id: row.id,
    companyId: row.companyId,
    planId: row.planId,
    planName,
    amount: row.amount,
    status: row.status,
    proofKey: row.proofKey ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/** Buat order pending baru untuk company. Tolak kalau sudah ada order pending. */
export async function createOrder(input: {
  companyId: number;
  planId: unknown;
  db?: DrizzleDb;
}): Promise<CreateOrderResult> {
  const db = input.db ?? defaultDb;

  const planId = typeof input.planId === 'number' ? input.planId : Number(input.planId);
  if (!Number.isInteger(planId) || planId <= 0) {
    return { kind: 'fail-validation', message: 'planId wajib berupa angka.' };
  }

  try {
    // Plan harus ada & aktif.
    const planRows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    const plan = planRows[0];
    if (!plan || plan.isActive !== 1) {
      return { kind: 'fail-plan-not-found' };
    }

    // Hanya boleh SATU order pending per company.
    const pendingRows = await db
      .select()
      .from(subscriptionOrders)
      .where(
        and(
          eq(subscriptionOrders.companyId, input.companyId),
          eq(subscriptionOrders.status, 'pending'),
        ),
      )
      .limit(1);
    if (pendingRows[0]) {
      return { kind: 'fail-pending-exists', order: mapOrderRow(pendingRows[0], null) };
    }

    const [ins] = await db.insert(subscriptionOrders).values({
      companyId: input.companyId,
      planId,
      amount: plan.price,
      status: 'pending',
    });
    const orderId = (ins as { insertId: number }).insertId;

    const created = await db
      .select()
      .from(subscriptionOrders)
      .where(eq(subscriptionOrders.id, orderId))
      .limit(1);
    return { kind: 'ok', order: mapOrderRow(created[0], plan.name) };
  } catch {
    return { kind: 'fail-500' };
  }
}

/** List semua order milik company, terbaru dulu. */
export async function listOrders(
  companyId: number,
  db: DrizzleDb = defaultDb,
): Promise<OrderItem[]> {
  const rows = await db
    .select({
      id: subscriptionOrders.id,
      companyId: subscriptionOrders.companyId,
      planId: subscriptionOrders.planId,
      amount: subscriptionOrders.amount,
      status: subscriptionOrders.status,
      proofKey: subscriptionOrders.proofKey,
      note: subscriptionOrders.note,
      createdAt: subscriptionOrders.createdAt,
      planName: plans.name,
    })
    .from(subscriptionOrders)
    .leftJoin(plans, eq(subscriptionOrders.planId, plans.id))
    .where(eq(subscriptionOrders.companyId, companyId))
    .orderBy(desc(subscriptionOrders.id));
  return rows.map((r) => mapOrderRow(r, r.planName ?? null));
}

/** Ambil satu order milik company (validasi ownership sebelum upload). */
export async function getOrderForCompany(
  companyId: number,
  orderId: number,
  db: DrizzleDb = defaultDb,
): Promise<{ id: number; status: string } | null> {
  const rows = await db
    .select({ id: subscriptionOrders.id, status: subscriptionOrders.status })
    .from(subscriptionOrders)
    .where(and(eq(subscriptionOrders.id, orderId), eq(subscriptionOrders.companyId, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Pasang proof_key ke order (hanya kalau order PENDING milik company). */
export async function attachProof(input: {
  companyId: number;
  orderId: number;
  key: string;
  db?: DrizzleDb;
}): Promise<AttachProofResult> {
  const db = input.db ?? defaultDb;
  try {
    const order = await getOrderForCompany(input.companyId, input.orderId, db);
    if (!order) return { kind: 'fail-not-found' };
    if (order.status !== 'pending') return { kind: 'fail-not-pending' };

    await db
      .update(subscriptionOrders)
      .set({ proofKey: input.key })
      .where(
        and(
          eq(subscriptionOrders.id, input.orderId),
          eq(subscriptionOrders.companyId, input.companyId),
        ),
      );
    return { kind: 'ok' };
  } catch {
    return { kind: 'fail-500' };
  }
}
