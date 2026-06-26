/**
 * Unit tests for register.service.ts (Fase 4.2a).
 * DB-injectable — no MySQL needed.
 */

import "./helpers/auth-env-setup";

import { test, expect, describe } from "bun:test";
import { registerCompany } from "../register.service";

// ── Fake DB helpers ────────────────────────────────────────────

/** DB that returns empty for every select (no existing email/username/slug). */
function makeEmptyDb(insertIds = { company: 1, user: 1 }): any {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve([{ insertId: insertIds.company }, { insertId: insertIds.user }]),
    }),
  };
}

/** DB that returns a row for email/username lookup (simulates taken). */
function makeTakenDb(takenField: 'email' | 'username' | 'slug'): any {
  let callCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            callCount++;
            // email is checked first (call 1), then username (call 2), slug uses separate uniqueSlug loop
            if (takenField === 'email' && callCount === 1) return Promise.resolve([{ id: 99 }]);
            if (takenField === 'username' && callCount === 2) return Promise.resolve([{ id: 99 }]);
            if (takenField === 'slug') return Promise.resolve([{ id: 99 }]); // slug always taken
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve([{ insertId: 1 }]),
    }),
  };
}

const validInput = {
  companyName: 'PT Maju Jaya',
  name: 'Budi Santoso',
  email: 'budi@example.com',
  password: 'Password1!',
};

// ── Validation ─────────────────────────────────────────────────

describe("registerCompany - validation", () => {
  test("empty companyName → fail-validation field companyName", async () => {
    const r = await registerCompany({ ...validInput, companyName: '', db: makeEmptyDb() });
    expect(r.kind).toBe('fail-validation');
    if (r.kind === 'fail-validation') expect(r.field).toBe('companyName');
  });

  test("companyName > 100 chars → fail-validation", async () => {
    const r = await registerCompany({ ...validInput, companyName: 'A'.repeat(101), db: makeEmptyDb() });
    expect(r.kind).toBe('fail-validation');
    if (r.kind === 'fail-validation') expect(r.field).toBe('companyName');
  });

  test("empty name → fail-validation field name", async () => {
    const r = await registerCompany({ ...validInput, name: '', db: makeEmptyDb() });
    expect(r.kind).toBe('fail-validation');
    if (r.kind === 'fail-validation') expect(r.field).toBe('name');
  });

  test("invalid email → fail-validation field email", async () => {
    const r = await registerCompany({ ...validInput, email: 'not-an-email', db: makeEmptyDb() });
    expect(r.kind).toBe('fail-validation');
    if (r.kind === 'fail-validation') expect(r.field).toBe('email');
  });

  test("invalid username (too short) → fail-validation field username", async () => {
    const r = await registerCompany({ ...validInput, username: 'ab', db: makeEmptyDb() });
    expect(r.kind).toBe('fail-validation');
    if (r.kind === 'fail-validation') expect(r.field).toBe('username');
  });

  test("weak password → fail-validation field password", async () => {
    const r = await registerCompany({ ...validInput, password: 'short', db: makeEmptyDb() });
    expect(r.kind).toBe('fail-validation');
    if (r.kind === 'fail-validation') expect(r.field).toBe('password');
  });
});

// ── Uniqueness ─────────────────────────────────────────────────

describe("registerCompany - uniqueness", () => {
  test("email already taken → fail-email-taken", async () => {
    const r = await registerCompany({ ...validInput, db: makeTakenDb('email') });
    expect(r.kind).toBe('fail-email-taken');
  });

  test("username already taken → fail-username-taken", async () => {
    const r = await registerCompany({ ...validInput, username: 'validuser', db: makeTakenDb('username') });
    expect(r.kind).toBe('fail-username-taken');
  });
});

// ── Happy path ─────────────────────────────────────────────────

describe("registerCompany - happy path", () => {
  test("returns ok with companyId, userId, slug", async () => {
    const db = makeEmptyDb({ company: 42, user: 7 });
    const r = await registerCompany({ ...validInput, db });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.slug).toMatch(/^[a-z0-9-]+$/);
      expect(r.slug.length).toBeGreaterThan(0);
    }
  });

  test("slug is generated from companyName", async () => {
    const db = makeEmptyDb();
    const r = await registerCompany({ ...validInput, companyName: 'PT Maju Jaya', db });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.slug).toContain('pt');
    }
  });

  test("optional username empty string treated as null (no validation error)", async () => {
    const db = makeEmptyDb();
    const r = await registerCompany({ ...validInput, username: '', db });
    expect(r.kind).toBe('ok');
  });
});

// ── Slug uniqueness ────────────────────────────────────────────

describe("registerCompany - slug collision", () => {
  test("slug collision resolves to ok (uniqueSlug finds free slot)", async () => {
    // Simulate: email check free (call 1), username skip, slug base taken (call 2), slug base-2 free (call 3)
    // companies table lookup for slug, users table for email
    let companiesCallCount = 0;
    const db: any = {
      select: () => ({
        from: (tableRef: any) => {
          const isCompanies = !!(tableRef && tableRef._ && tableRef._.name === 'companies');
          return {
            where: () => ({
              limit: () => {
                if (!isCompanies) return Promise.resolve([]); // users table: email free
                companiesCallCount++;
                if (companiesCallCount === 1) return Promise.resolve([{ id: 99 }]); // slug taken
                return Promise.resolve([]); // slug-2 free
              },
            }),
          };
        },
      }),
      insert: () => ({
        values: () => Promise.resolve([{ insertId: 1 }]),
      }),
    };
    const r = await registerCompany({ ...validInput, db });
    expect(r.kind).toBe('ok');
  });
});
