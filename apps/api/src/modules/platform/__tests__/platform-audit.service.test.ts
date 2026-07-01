/**
 * Unit tests for platform-audit.service.ts (Fase 6.2).
 * DB-injectable — no MySQL needed.
 */

import { test, expect, describe } from 'bun:test';
import { listAuditLogs, listAuditActions } from '../platform-audit.service';

// ── Fake data ──────────────────────────────────────────────────

const fakeAuditRow = {
  id: 1,
  actorType: 'platform' as const,
  actorId: 10,
  companyId: 5,
  action: 'platform.orders.approve',
  targetType: 'subscription_order',
  targetId: '123',
  beforeJson: '{"status":"pending"}',
  afterJson: '{"status":"approved"}',
  ip: '127.0.0.1',
  createdAt: new Date('2026-01-15T10:00:00Z'),
};

const fakeCompany = {
  id: 5,
  name: 'PT Test Company',
};

// ── DB factory helpers ─────────────────────────────────────────

function makeAuditDb(rows: any[], total: number = rows.length, actions: string[] = []): any {
  return {
    select: (fields?: any) => {
      // Check if this is a count query
      if (fields && fields.count !== undefined) {
        return {
          from: () => ({
            where: () => Promise.resolve([{ count: total }]),
          }),
        };
      }
      return {
        from: () => ({
          leftJoin: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve(rows.map(r => ({
                  ...r,
                  companyName: r.companyId === 5 ? 'PT Test Company' : null,
                }))),
                where: () => ({
                  offset: () => Promise.resolve(rows.map(r => ({
                    ...r,
                    companyName: r.companyId === 5 ? 'PT Test Company' : null,
                  }))),
                }),
              }),
            }),
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => Promise.resolve(rows.map(r => ({
                    ...r,
                    companyName: r.companyId === 5 ? 'PT Test Company' : null,
                  }))),
                }),
              }),
            }),
          }),
          where: () => Promise.resolve([{ count: total }]),
        }),
      };
    },
    selectDistinct: () => ({
      from: () => ({
        orderBy: () => Promise.resolve(actions.map(a => ({ action: a }))),
      }),
    }),
  };
}

// ── listAuditLogs ─────────────────────────────────────────────

describe('listAuditLogs', () => {
  test('tanpa filter mengembalikan semua rows dengan default pagination', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db });
    
    expect(r.rows).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(50);
    expect(r.rows[0].action).toBe('platform.orders.approve');
    expect(r.rows[0].companyName).toBe('PT Test Company');
  });

  test('dengan companyId filter', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db, companyId: 5 });
    
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].companyId).toBe(5);
  });

  test('dengan action filter', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db, action: 'platform.orders.approve' });
    
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].action).toBe('platform.orders.approve');
  });

  test('dengan dateFrom dan dateTo filter', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const dateFrom = new Date('2026-01-01');
    const dateTo = new Date('2026-01-31');
    
    const r = await listAuditLogs({ db, dateFrom, dateTo });
    
    expect(r.rows).toHaveLength(1);
  });

  test('pageSize di-clamp ke max 50', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db, pageSize: 100 });
    
    expect(r.pageSize).toBe(50);
  });

  test('pageSize di-clamp ke min 1', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db, pageSize: -5 });
    
    expect(r.pageSize).toBe(1);
  });

  test('page di-clamp ke min 1', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db, page: 0 });
    
    expect(r.page).toBe(1);
  });

  test('createdAt direturn sebagai ISO string', async () => {
    const db = makeAuditDb([fakeAuditRow], 1);
    const r = await listAuditLogs({ db });
    
    expect(typeof r.rows[0].createdAt).toBe('string');
    expect(r.rows[0].createdAt).toBe('2026-01-15T10:00:00.000Z');
  });

  test('company null (aksi global) → companyName null', async () => {
    const globalAudit = { ...fakeAuditRow, companyId: null };
    const db = makeAuditDb([globalAudit], 1);
    const r = await listAuditLogs({ db });
    
    expect(r.rows[0].companyId).toBeNull();
    expect(r.rows[0].companyName).toBeNull();
  });

  test('pagination dengan page 2', async () => {
    const rows = [fakeAuditRow, { ...fakeAuditRow, id: 2 }];
    const db = makeAuditDb(rows, 100);
    const r = await listAuditLogs({ db, page: 2, pageSize: 10 });
    
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(10);
    expect(r.total).toBe(100);
  });
});

// ── listAuditActions ──────────────────────────────────────────

describe('listAuditActions', () => {
  test('mengembalikan array action ter-sort', async () => {
    const actions = ['company.login', 'platform.orders.approve', 'platform.plans.update'];
    const db = makeAuditDb([], 0, actions);
    const r = await listAuditActions({ db });
    
    expect(r).toHaveLength(3);
    expect(r).toEqual(actions);
  });

  test('empty database mengembalikan array kosong', async () => {
    const db = makeAuditDb([], 0, []);
    const r = await listAuditActions({ db });
    
    expect(r).toHaveLength(0);
  });
});
