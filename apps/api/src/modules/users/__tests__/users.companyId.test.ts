/**
 * Fase 1.4b - createUser multi-tenant + username support.
 *
 * Verifies that createUser:
 *   1. Passes the caller-provided companyId into the inserted row.
 *   2. Defaults companyId to 1 when omitted (back-compat for single-tenant callers).
 *   3. Stores username + normalized usernameLower when a valid username is given.
 *   4. Stores null username/usernameLower when no username is given.
 *   5. Rejects an invalid username syntax with errors.username.
 *   6. Rejects a duplicate username (global) with errors.username.
 *
 * Uses a capturing fake DB that records the row passed to insert().values().
 * select().from().where().limit() returns the next entry of `selectResults`
 * (defaults to [] when out of range), so the email-uniqueness SELECT (1st) and
 * the username-uniqueness SELECT (2nd) can be controlled independently.
 */

// Must set env vars before any import that transitively loads config/env.ts
import '../../auth/__tests__/helpers/auth-env-setup';

import { test, expect, describe } from 'bun:test';
import { createUser } from '../users.service';
import type { DrizzleDb } from '../users.service';

/** A thenable that resolves to `value` - emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

function makeDb(selectResults: Array<Array<{ id: number }>> = []) {
  let i = 0;
  const captured: { row?: Record<string, unknown> } = {};
  const db = {
    select(_cols?: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                limit(_n: number) {
                  const res = selectResults[i] ?? [];
                  i++;
                  return awaitableResult(res);
                },
              };
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          captured.row = row;
          return awaitableResult([{ insertId: 1 }]);
        },
      };
    },
  } as unknown as DrizzleDb;
  return { db, captured };
}

describe('createUser - companyId', () => {
  test('passes the provided companyId into the inserted row', async () => {
    const { db, captured } = makeDb([]);
    const result = await createUser(
      { email: 'a@example.com', name: 'A', role: 'staff', password: 'SecurePass1!', companyId: 2 },
      db,
    );
    expect(result.ok).toBe(true);
    expect(captured.row?.companyId).toBe(2);
  });

  test('defaults companyId to 1 when omitted', async () => {
    const { db, captured } = makeDb([]);
    const result = await createUser(
      { email: 'b@example.com', name: 'B', role: 'staff', password: 'SecurePass1!' },
      db,
    );
    expect(result.ok).toBe(true);
    expect(captured.row?.companyId).toBe(1);
  });
});

describe('createUser - username', () => {
  test('stores username + normalized usernameLower when valid', async () => {
    const { db, captured } = makeDb([]);
    const result = await createUser(
      {
        email: 'c@example.com',
        name: 'C',
        role: 'staff',
        password: 'SecurePass1!',
        username: 'Toko.Budi_01',
        companyId: 3,
      },
      db,
    );
    expect(result.ok).toBe(true);
    expect(captured.row?.username).toBe('Toko.Budi_01');
    expect(captured.row?.usernameLower).toBe('toko.budi_01');
  });

  test('stores null username/usernameLower when omitted', async () => {
    const { db, captured } = makeDb([]);
    const result = await createUser(
      { email: 'd@example.com', name: 'D', role: 'staff', password: 'SecurePass1!' },
      db,
    );
    expect(result.ok).toBe(true);
    expect(captured.row?.username).toBe(null);
    expect(captured.row?.usernameLower).toBe(null);
  });

  test('rejects invalid username syntax with errors.username', async () => {
    const { db } = makeDb([]);
    const result = await createUser(
      { email: 'e@example.com', name: 'E', role: 'staff', password: 'SecurePass1!', username: 'ab' },
      db,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok=false');
    expect(result.errors).toHaveProperty('username');
  });

  test('rejects duplicate username (global) with errors.username', async () => {
    // 1st SELECT (email uniqueness) -> [] (unique); 2nd SELECT (username) -> conflict.
    const { db } = makeDb([[], [{ id: 9 }]]);
    const result = await createUser(
      {
        email: 'f@example.com',
        name: 'F',
        role: 'staff',
        password: 'SecurePass1!',
        username: 'duplikat',
      },
      db,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok=false');
    expect(result.errors).toHaveProperty('username');
    const usernameErr = result.errors.username;
    expect(usernameErr).toBeDefined();
    expect(usernameErr!.toLowerCase()).toContain('digunakan');
  });
});
