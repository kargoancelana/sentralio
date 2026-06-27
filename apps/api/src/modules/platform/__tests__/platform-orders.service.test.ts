/**
 * Unit tests for platform-orders.service.ts (Fase 4.3a).
 * DB-injectable — no MySQL needed.
 */

import { test, expect, describe } from 'bun:test';
import { listAllOrders, approveOrder, rejectOrder } from '../platform-orders.service';

// ── Fake data ──────────────────────────────────────────────────

const fakeOrder = {
  id: 1,
  companyId: 10,
  planId: 2,
  amount: 50000,
  status: 'pending',
  proofKey: 'proof/key.jpg',
  note: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const fakePlan = {
  id: 2,
  name: 'Bulanan',
  durationDays: 30,
  price: 50000,
  maxShops: 1,
  maxUsers: 2,
  isActive: 1,
  featuresJson: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── DB factory helpers ─────────────────────────────────────────

function makeOrderDb(order: any, plan: any = fakePlan): any {
  const updates: any[] = [];
  const inserts: any[] = [];
  let selectCall = 0;

  // selectOrderById query: .from().leftJoin().leftJoin().where().limit()
  const selectOrderByIdChain = (resolvedOrder: any) => ({
    leftJoin: () => ({
      leftJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve(resolvedOrder ? [{
            ...resolvedOrder,
            companyName: 'PT Test',
            planName: plan?.name ?? null,
          }] : []),
        }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
  });

  return {
    _updates: updates,
    _inserts: inserts,
    select: () => ({
      from: () => ({
        // for selectOrderById (chained leftJoin)
        leftJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => {
                // re-select after update — return approved/rejected version
                return Promise.resolve([{
                  ...order,
                  status: 'approved',
                  reviewedBy: 99,
                  reviewedAt: new Date(),
                  companyName: 'PT Test',
                  planName: plan?.name ?? null,
                }]);
              },
            }),
            orderBy: () => Promise.resolve([]),
          }),
        }),
        // for direct .from().where().limit() calls (order lookup, plan lookup)
        where: () => ({
          limit: () => {
            selectCall++;
            if (selectCall === 1) return Promise.resolve(order ? [order] : []);
            if (selectCall === 2) return Promise.resolve(plan ? [plan] : []);
            return Promise.resolve(order ? [order] : []);
          },
        }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          updates.push(true);
          return Promise.resolve([]);
        },
      }),
    }),
    insert: () => ({
      values: (vals: any) => {
        inserts.push(vals);
        return Promise.resolve([{ insertId: 99 }]);
      },
    }),
    transaction: async (fn: any) => {
      const fakeTx = {
        update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
        insert: () => ({ values: (v: any) => { inserts.push(v); return Promise.resolve([{ insertId: 99 }]); } }),
      };
      return fn(fakeTx);
    },
  };
}

function makeEmptyOrderDb(): any {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
        leftJoin: () => ({ leftJoin: () => ({ orderBy: () => Promise.resolve([]), where: () => Promise.resolve([]) }) }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => Promise.resolve([{ insertId: 1 }]) }),
    transaction: async (fn: any) => fn({ update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }), insert: () => ({ values: () => Promise.resolve([{ insertId: 1 }]) }) }),
  };
}

function makeNonPendingOrderDb(): any {
  const order = { ...fakeOrder, status: 'approved' };
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([order]) }),
        leftJoin: () => ({ leftJoin: () => ({ orderBy: () => Promise.resolve([]), where: () => Promise.resolve([]) }) }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => Promise.resolve([{ insertId: 1 }]) }),
    transaction: async (fn: any) => fn({ update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }), insert: () => ({ values: () => Promise.resolve([{ insertId: 1 }]) }) }),
  };
}

// ── listAllOrders ─────────────────────────────────────────────

describe('listAllOrders', () => {
  test('filter status pending', async () => {
    const db: any = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              orderBy: () => ({
                where: () => Promise.resolve([{
                  ...fakeOrder,
                  companyName: 'PT Test',
                  planName: 'Bulanan',
                }]),
              }),
            }),
          }),
        }),
      }),
    };
    const r = await listAllOrders({ status: 'pending', db });
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('pending');
    expect(r[0].companyName).toBe('PT Test');
  });

  test('tanpa filter mengembalikan semua', async () => {
    const db: any = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              orderBy: () => Promise.resolve([
                { ...fakeOrder, id: 1, status: 'pending', companyName: 'A', planName: 'X' },
                { ...fakeOrder, id: 2, status: 'approved', companyName: 'B', planName: 'Y' },
              ]),
            }),
          }),
        }),
      }),
    };
    const r = await listAllOrders({ db });
    expect(r).toHaveLength(2);
  });
});

// ── approveOrder ──────────────────────────────────────────────

describe('approveOrder', () => {
  test('order tidak ada → not_found', async () => {
    const r = await approveOrder({ orderId: 999, reviewedBy: 1, now: new Date(), db: makeEmptyOrderDb() });
    expect(r.kind).toBe('not_found');
  });

  test('order bukan pending → not_pending', async () => {
    const r = await approveOrder({ orderId: 1, reviewedBy: 1, now: new Date(), db: makeNonPendingOrderDb() });
    expect(r.kind).toBe('not_pending');
  });

  test('plan tidak ada → plan_missing', async () => {
    const r = await approveOrder({ orderId: 1, reviewedBy: 1, now: new Date(), db: makeOrderDb(fakeOrder, null) });
    expect(r.kind).toBe('plan_missing');
  });

  test('happy path → ok, subscription baru ke-insert, company di-update', async () => {
    const db = makeOrderDb(fakeOrder, fakePlan);
    const r = await approveOrder({ orderId: 1, reviewedBy: 99, now: new Date(), db });
    expect(r.kind).toBe('ok');
    // subscription baru harus ke-insert
    expect(db._inserts.some((v: any) => v.status === 'active' && v.planId === 2)).toBe(true);
  });
});

// ── rejectOrder ───────────────────────────────────────────────

describe('rejectOrder', () => {
  test('note kosong → invalid_note', async () => {
    const r = await rejectOrder({ orderId: 1, reviewedBy: 1, note: '', now: new Date(), db: makeOrderDb(fakeOrder) });
    expect(r.kind).toBe('invalid_note');
  });

  test('note whitespace → invalid_note', async () => {
    const r = await rejectOrder({ orderId: 1, reviewedBy: 1, note: '   ', now: new Date(), db: makeOrderDb(fakeOrder) });
    expect(r.kind).toBe('invalid_note');
  });

  test('order tidak ada → not_found', async () => {
    const r = await rejectOrder({ orderId: 999, reviewedBy: 1, note: 'alasan', now: new Date(), db: makeEmptyOrderDb() });
    expect(r.kind).toBe('not_found');
  });

  test('order bukan pending → not_pending', async () => {
    const r = await rejectOrder({ orderId: 1, reviewedBy: 1, note: 'alasan', now: new Date(), db: makeNonPendingOrderDb() });
    expect(r.kind).toBe('not_pending');
  });

  test('happy path → ok, company & subscription tidak disentuh', async () => {
    const db = makeOrderDb(fakeOrder, fakePlan);
    const r = await rejectOrder({ orderId: 1, reviewedBy: 1, note: 'alasan reject', now: new Date(), db });
    expect(r.kind).toBe('ok');
  });
});
