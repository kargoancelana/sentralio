import './helpers/auth-env-setup';
import { test, expect, describe } from 'bun:test';
import {
  createResetToken,
  verifyResetToken,
  completeReset,
  sha256hex,
} from '../password-reset.service';
import { users, passwordResetTokens } from '../../../db/schema';

function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

interface MockSelectOptions {
  userRows?: any[];
  tokenRows?: any[];
}

function makeFakeDb(opts: MockSelectOptions = {}) {
  const { userRows = [], tokenRows = [] } = opts;
  const calls = {
    selectCount: 0,
    insertCount: 0,
    updateCount: 0,
    deleteCount: 0,
    inserts: [] as any[],
    updates: [] as any[],
    deletes: [] as any[],
  };

  const db = {
    select(_cols?: unknown) {
      calls.selectCount++;
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                ...awaitableResult(table === users ? userRows : tokenRows),
                limit(_n: number) {
                  return awaitableResult(table === users ? userRows : tokenRows);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      calls.insertCount++;
      return {
        values(row: unknown) {
          calls.inserts.push({ table, row });
          return awaitableResult({ insertId: 99 });
        },
      };
    },
    update(table: unknown) {
      calls.updateCount++;
      return {
        set(row: unknown) {
          calls.updates.push({ table, row });
          return {
            where(_cond: unknown) {
              return awaitableResult(undefined);
            },
          };
        },
      };
    },
    delete(table: unknown) {
      calls.deleteCount++;
      return {
        where(cond: unknown) {
          calls.deletes.push({ table, cond });
          return awaitableResult(undefined);
        },
      };
    },
  };

  return { db: db as any, calls };
}

describe('password-reset.service', () => {
  const NOW = Date.now();

  describe('createResetToken', () => {
    test('success: user exists', async () => {
      const { db, calls } = makeFakeDb({
        userRows: [{ id: 42, companyId: 1 }],
      });

      const result = await createResetToken(
        {
          userId: 42,
          companyId: 1,
          adminId: 10,
          now: NOW,
        },
        db,
      );

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') throw new Error('expected ok');

      expect(result.resetUrl).toContain('/reset-password?token=');
      expect(result.expiresAt.getTime()).toBe(NOW + 3600_000);

      // Verify DB interactions
      expect(calls.deleteCount).toBe(1); // Deleted old tokens
      expect(calls.inserts.length).toBe(1); // Inserted new token
      expect(calls.inserts[0].table).toBe(passwordResetTokens);
      expect(calls.inserts[0].row.userId).toBe(42);
      expect(calls.inserts[0].row.createdByAdminId).toBe(10);

      expect(calls.updates.length).toBe(1); // Bumps users.tokensValidFrom
      expect(calls.updates[0].table).toBe(users);
      expect(calls.updates[0].row.tokensValidFrom).toBe(Math.floor(NOW / 1000));
    });

    test('failure: user not found / different company', async () => {
      const { db, calls } = makeFakeDb({
        userRows: [],
      });

      const result = await createResetToken(
        {
          userId: 42,
          companyId: 1,
          adminId: 10,
          now: NOW,
        },
        db,
      );

      expect(result.kind).toBe('not-found');
      expect(calls.deleteCount).toBe(0);
      expect(calls.inserts.length).toBe(0);
      expect(calls.updates.length).toBe(0);
    });
  });

  describe('verifyResetToken', () => {
    test('valid token', async () => {
      const token = 'my-token';
      const tokenHash = sha256hex(token);
      const { db } = makeFakeDb({
        tokenRows: [{ id: 1, expiresAt: new Date(NOW + 1000), usedAt: null }],
      });

      const result = await verifyResetToken({ token, now: NOW }, db);
      expect(result.valid).toBe(true);
    });

    test('invalid: expired', async () => {
      const token = 'my-token';
      const { db } = makeFakeDb({
        tokenRows: [{ id: 1, expiresAt: new Date(NOW - 1000), usedAt: null }],
      });

      const result = await verifyResetToken({ token, now: NOW }, db);
      expect(result.valid).toBe(false);
    });

    test('invalid: already used', async () => {
      const token = 'my-token';
      const { db } = makeFakeDb({
        tokenRows: [{ id: 1, expiresAt: new Date(NOW + 1000), usedAt: new Date(NOW) }],
      });

      const result = await verifyResetToken({ token, now: NOW }, db);
      expect(result.valid).toBe(false);
    });

    test('invalid: token not found', async () => {
      const token = 'my-token';
      const { db } = makeFakeDb({
        tokenRows: [],
      });

      const result = await verifyResetToken({ token, now: NOW }, db);
      expect(result.valid).toBe(false);
    });
  });

  describe('completeReset', () => {
    test('success', async () => {
      const token = 'my-token';
      const { db, calls } = makeFakeDb({
        tokenRows: [{ id: 1, userId: 42, expiresAt: new Date(NOW + 1000), usedAt: null }],
      });

      const result = await completeReset(
        {
          token,
          newPassword: 'StrongPassword!123',
          now: NOW,
        },
        db,
      );

      expect(result.kind).toBe('ok');

      // Verify user password updated and sessions invalidated
      const userUpdate = calls.updates.find((u) => u.table === users);
      expect(userUpdate).toBeDefined();
      expect(userUpdate!.row.tokensValidFrom).toBe(Math.floor(NOW / 1000));
      expect(userUpdate!.row.passwordHash).toBeDefined();

      // Verify token marked used
      const tokenUpdate = calls.updates.find((u) => u.table === passwordResetTokens);
      expect(tokenUpdate).toBeDefined();
      expect(tokenUpdate!.row.usedAt.getTime()).toBe(NOW);

      // Verify other tokens deleted
      expect(calls.deleteCount).toBe(1);
      expect(calls.deletes[0].table).toBe(passwordResetTokens);
    });

    test('failure: expired token', async () => {
      const token = 'my-token';
      const { db, calls } = makeFakeDb({
        tokenRows: [{ id: 1, userId: 42, expiresAt: new Date(NOW - 1000), usedAt: null }],
      });

      const result = await completeReset(
        {
          token,
          newPassword: 'StrongPassword!123',
          now: NOW,
        },
        db,
      );

      expect(result.kind).toBe('invalid-token');
      expect(calls.updateCount).toBe(0);
    });

    test('failure: already used token', async () => {
      const token = 'my-token';
      const { db, calls } = makeFakeDb({
        tokenRows: [{ id: 1, userId: 42, expiresAt: new Date(NOW + 1000), usedAt: new Date(NOW - 1000) }],
      });

      const result = await completeReset(
        {
          token,
          newPassword: 'StrongPassword!123',
          now: NOW,
        },
        db,
      );

      expect(result.kind).toBe('invalid-token');
      expect(calls.updateCount).toBe(0);
    });

    test('failure: validation (weak password)', async () => {
      const token = 'my-token';
      const { db, calls } = makeFakeDb({
        tokenRows: [{ id: 1, userId: 42, expiresAt: new Date(NOW + 1000), usedAt: null }],
      });

      const result = await completeReset(
        {
          token,
          newPassword: '123', // too short, no uppercase, no special
          now: NOW,
        },
        db,
      );

      expect(result.kind).toBe('validation');
      if (result.kind !== 'validation') throw new Error('expected validation');
      expect(result.message).toContain('minimal');
      expect(calls.updateCount).toBe(0);
    });
  });
});
