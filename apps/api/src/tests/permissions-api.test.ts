/**
 * Integration tests for the Staff Permission Admin API.
 *
 * Tests exercise the HTTP layer end-to-end:
 *   GET  /auth/permissions
 *   PUT  /auth/permissions
 *
 * The real authMiddleware + featureGuardMiddleware are used so the full
 * auth/authorization path is exercised. validateSession is mocked so that
 * no real DB or JWT issuance is needed.
 *
 * DB interaction inside getStaffPermissions / setStaffPermissions is avoided
 * by pre-warming the in-memory cache via loadStaffPermissions with a fake DB stub.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Elysia } from 'elysia';
import {
  loadStaffPermissions,
  getStaffPermissions,
  setStaffPermissions,
  invalidateStaffPermissionsCache,
  CONFIGURABLE_STAFF_FEATURES,
} from '../modules/auth/permissions.service';
import { permissionsRoute } from '../modules/auth/permissions.route';

// ─── Mock validateSession ─────────────────────────────────────────────────────
// We replace the module-level validateSession used by authMiddleware so tests
// don't need a real DB or signed JWTs. The mock is reset per test via the
// `currentSession` variable.

let currentSession: { user: { id: number; companyId: number; email: string; name: string; role: 'admin' | 'staff' }; jti: string; exp: number } | null = null;

mock.module('../modules/auth/auth.service', () => ({
  validateSession: async () => currentSession,
  // re-export everything else as-is (not needed by these tests)
  unifiedLoginFailureResponse: () => ({ status: 401, headers: {}, body: '' }),
}));

// ─── Fake DB for cache warming ────────────────────────────────────────────────

const fakeDb = {
  select: () => ({ from: () => ({ where: async () => [] }) }),
  insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async () => {} }) }),
} as any;

/** Pre-warm the in-memory permissions cache for a companyId (no real DB). */
async function warmCompany(companyId: number): Promise<void> {
  invalidateStaffPermissionsCache(companyId);
  await loadStaffPermissions(companyId, fakeDb);
}

// ─── Test app ─────────────────────────────────────────────────────────────────

// Re-use the production route plugin so auth + validation middleware are exercised.
const app = new Elysia().use(permissionsRoute);

// ─── Helper: build a fake cookie header ──────────────────────────────────────

function cookieHeader(value: string): Record<string, string> {
  return { cookie: `wms_session=${value}` };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /auth/permissions', () => {
  const COMPANY_ID = 10;

  beforeEach(async () => {
    currentSession = null;
    await warmCompany(COMPANY_ID);
  });

  it('returns 401 when no session cookie is sent', async () => {
    const res = await app.handle(new Request('http://localhost/auth/permissions'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session cookie is invalid', async () => {
    currentSession = null; // validateSession returns null → invalid
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        headers: cookieHeader('bad-token'),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is staff (user_management is admin-only)', async () => {
    currentSession = {
      user: { id: 1, companyId: COMPANY_ID, email: 'staff@test.com', name: 'Staff', role: 'staff' },
      jti: 'jti-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        headers: cookieHeader('valid-staff-token'),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 with permissions array for admin', async () => {
    currentSession = {
      user: { id: 1, companyId: COMPANY_ID, email: 'admin@test.com', name: 'Admin', role: 'admin' },
      jti: 'jti-2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        headers: cookieHeader('valid-admin-token'),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; permissions: Array<{ feature: string; enabled: boolean }> };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.permissions)).toBe(true);
    // Every configurable feature appears exactly once
    const features = body.permissions.map((p) => p.feature);
    for (const f of CONFIGURABLE_STAFF_FEATURES) {
      expect(features).toContain(f);
    }
    // Each entry has an enabled boolean
    for (const entry of body.permissions) {
      expect(typeof entry.enabled).toBe('boolean');
    }
  });
});

describe('PUT /auth/permissions', () => {
  const COMPANY_ID = 11;

  beforeEach(async () => {
    currentSession = null;
    await warmCompany(COMPANY_ID);
  });

  it('returns 401 when no session cookie is sent', async () => {
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is staff', async () => {
    currentSession = {
      user: { id: 2, companyId: COMPANY_ID, email: 'staff2@test.com', name: 'Staff2', role: 'staff' },
      jti: 'jti-3',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        method: 'PUT',
        headers: { ...cookieHeader('valid-staff-token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 422 when body is missing required permissions field', async () => {
    currentSession = {
      user: { id: 1, companyId: COMPANY_ID, email: 'admin@test.com', name: 'Admin', role: 'admin' },
      jti: 'jti-4',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        method: 'PUT',
        headers: { ...cookieHeader('valid-admin-token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrong: 'field' }),
      }),
    );
    // Elysia returns 422 for Typebox validation errors
    expect(res.status).toBe(422);
  });

  it('returns 200 and echoes back permissions list for admin (empty update)', async () => {
    currentSession = {
      user: { id: 1, companyId: COMPANY_ID, email: 'admin@test.com', name: 'Admin', role: 'admin' },
      jti: 'jti-5',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    // Empty permissions array — setStaffPermissions loops over nothing, no DB hit
    const res = await app.handle(
      new Request('http://localhost/auth/permissions', {
        method: 'PUT',
        headers: { ...cookieHeader('valid-admin-token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; permissions: Array<{ feature: string; enabled: boolean }> };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.permissions)).toBe(true);
  });
});
