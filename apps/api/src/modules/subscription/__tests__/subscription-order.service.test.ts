/**
 * Unit tests for subscription-order.service.ts (Fase 4.2a).
 * DB-injectable — no MySQL needed.
 */

import { test, expect, describe } from "bun:test";
import { createOrder, attachProof } from "../subscription-order.service";

// ── Fake DB helpers ────────────────────────────────────────────

const fakePlan = { id: 1, name: 'Bulanan', price: 50000, isActive: 1, durationDays: 30 };

/** DB with a valid active plan, no pending orders. */
function makeCleanDb(plan = fakePlan): any {
  const pendingOrders: any[] = [];
  const insertedOrders: any[] = [];
  let nextId = 100;

  return {
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: () => {
            // Plan lookup
            if (table?._?.name === 'plans' || (table && String(table).includes('plans'))) {
              return Promise.resolve([plan]);
            }
            // Pending check / getOrderForCompany
            return Promise.resolve([...pendingOrders, ...insertedOrders].slice(0, 1));
          },
        }),
        leftJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: any) => {
        const id = nextId++;
        insertedOrders.push({ ...vals, id, createdAt: new Date() });
        return Promise.resolve([{ insertId: id }]);
      },
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  };
}

/** Returns a fixed set of rows based on what's queried. */
function makeDbWithPendingOrder(): any {
  const pendingOrder = { id: 5, companyId: 1, planId: 1, amount: 50000, status: 'pending', proofKey: null, note: null, createdAt: new Date() };
  let selectCall = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCall++;
            if (selectCall === 1) return Promise.resolve([fakePlan]); // plan lookup
            return Promise.resolve([pendingOrder]); // pending order exists
          },
        }),
        leftJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([pendingOrder]),
          }),
        }),
      }),
    }),
    insert: () => ({ values: () => Promise.resolve([{ insertId: 99 }]) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  };
}

function makeDbForAttach(orderStatus: string): any {
  const order = { id: 10, companyId: 1, status: orderStatus };
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([order]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  };
}

// ── createOrder ────────────────────────────────────────────────

describe("createOrder", () => {
  test("planId bukan angka → fail-validation", async () => {
    const r = await createOrder({ companyId: 1, planId: 'abc', db: makeCleanDb() });
    expect(r.kind).toBe('fail-validation');
  });

  test("planId <= 0 → fail-validation", async () => {
    const r = await createOrder({ companyId: 1, planId: 0, db: makeCleanDb() });
    expect(r.kind).toBe('fail-validation');
  });

  test("plan tidak ada / nonaktif → fail-plan-not-found", async () => {
    const db: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    };
    const r = await createOrder({ companyId: 1, planId: 99, db });
    expect(r.kind).toBe('fail-plan-not-found');
  });

  test("plan isActive=0 → fail-plan-not-found", async () => {
    const inactivePlan = { ...fakePlan, isActive: 0 };
    const db: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([inactivePlan]) }) }) }),
    };
    const r = await createOrder({ companyId: 1, planId: 1, db });
    expect(r.kind).toBe('fail-plan-not-found');
  });

  test("sudah ada order pending → fail-pending-exists", async () => {
    const r = await createOrder({ companyId: 1, planId: 1, db: makeDbWithPendingOrder() });
    expect(r.kind).toBe('fail-pending-exists');
  });

  test("happy path → ok + amount === plan.price + status pending", async () => {
    // Need a db that: plan found, no pending, insert returns id, re-select returns row
    let selectCall = 0;
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              selectCall++;
              if (selectCall === 1) return Promise.resolve([fakePlan]); // plan
              if (selectCall === 2) return Promise.resolve([]); // no pending
              return Promise.resolve([{ id: 1, companyId: 1, planId: 1, amount: 50000, status: 'pending', proofKey: null, note: null, createdAt: new Date() }]);
            },
          }),
        }),
      }),
      insert: () => ({ values: () => Promise.resolve([{ insertId: 1 }]) }),
    };
    const r = await createOrder({ companyId: 1, planId: 1, db });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.order.amount).toBe(50000);
      expect(r.order.status).toBe('pending');
    }
  });
});

// ── attachProof ────────────────────────────────────────────────

describe("attachProof", () => {
  test("order tidak ada → fail-not-found", async () => {
    const db: any = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    };
    const r = await attachProof({ companyId: 1, orderId: 99, key: 'proof/key.jpg', db });
    expect(r.kind).toBe('fail-not-found');
  });

  test("order bukan pending → fail-not-pending", async () => {
    const r = await attachProof({ companyId: 1, orderId: 10, key: 'proof/key.jpg', db: makeDbForAttach('approved') });
    expect(r.kind).toBe('fail-not-pending');
  });

  test("happy path → ok", async () => {
    const r = await attachProof({ companyId: 1, orderId: 10, key: 'proof/key.jpg', db: makeDbForAttach('pending') });
    expect(r.kind).toBe('ok');
  });
});
