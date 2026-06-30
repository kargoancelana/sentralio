import { describe, it, expect } from 'bun:test';
import { logAudit, serializeSnapshot } from '../audit-log.service';

/** Fake db: rekam values yang di-insert, atau lempar error kalau shouldThrow. */
function makeFakeDb(opts: { shouldThrow?: boolean } = {}) {
  const captured: { values?: Record<string, unknown> } = {};
  const db = {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        if (opts.shouldThrow) throw new Error('db down');
        captured.values = v;
      },
    }),
  } as unknown as Parameters<typeof logAudit>[0]['db'];
  return { db, captured };
}

describe('serializeSnapshot', () => {
  it('null/undefined -> null', () => {
    expect(serializeSnapshot(undefined)).toBeNull();
    expect(serializeSnapshot(null)).toBeNull();
  });
  it('object -> JSON string', () => {
    expect(serializeSnapshot({ a: 1 })).toBe('{"a":1}');
  });
  it('truncate panjang ke <= 8000 char', () => {
    const big = { s: 'x'.repeat(20000) };
    const out = serializeSnapshot(big)!;
    expect(out.length).toBe(8000);
  });
});

describe('logAudit', () => {
  it('insert values ter-normalisasi (targetId di-stringify, snapshot ke JSON)', async () => {
    const { db, captured } = makeFakeDb();
    await logAudit({
      db,
      actorType: 'platform',
      actorId: 7,
      action: 'platform.plan.update',
      targetType: 'plan',
      targetId: 42,
      before: { name: 'A' },
      after: { name: 'B' },
      ip: '1.2.3.4',
    });
    expect(captured.values).toMatchObject({
      actorType: 'platform',
      actorId: 7,
      companyId: null,
      action: 'platform.plan.update',
      targetType: 'plan',
      targetId: '42',
      beforeJson: '{"name":"A"}',
      afterJson: '{"name":"B"}',
      ip: '1.2.3.4',
    });
  });

  it('field opsional kosong -> null', async () => {
    const { db, captured } = makeFakeDb();
    await logAudit({ db, actorType: 'platform', actorId: null, action: 'platform.auth.login_failure' });
    expect(captured.values).toMatchObject({
      actorId: null,
      companyId: null,
      targetType: null,
      targetId: null,
      beforeJson: null,
      afterJson: null,
      ip: null,
    });
  });

  it('TIDAK throw walau db.insert error', async () => {
    const { db } = makeFakeDb({ shouldThrow: true });
    await expect(
      logAudit({ db, actorType: 'platform', actorId: 1, action: 'x' }),
    ).resolves.toBeUndefined();
  });
});
