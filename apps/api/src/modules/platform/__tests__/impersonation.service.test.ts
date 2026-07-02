/**
 * Tests for impersonation.service.ts (Fase 7.1).
 * 
 * Uses mock DB to avoid touching real database during tests.
 */

import { describe, test, expect, mock } from 'bun:test';
import { startImpersonation, stopImpersonation } from '../impersonation.service';
import { signJwt, verifyJwtIgnoreExp } from '../../auth/jwt';

// Mock user data
const mockUser = {
  id: 123,
  companyId: 456,
  email: 'test@example.com',
  emailLower: 'test@example.com',
  name: 'Test User',
  role: 'admin' as const,
  isActive: 1,
  passwordHash: 'hash',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAdminId = 999;

describe('Impersonation Service', () => {
  test('startImpersonation returns ok with valid user', async () => {
    // Mock DB that returns the user
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockUser])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
    } as any;

    const result = await startImpersonation({
      adminId: mockAdminId,
      companyId: mockUser.companyId,
      userId: mockUser.id,
      now: new Date(),
      db: mockDb,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.cookie).toContain('wms_session=');
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.companyId).toBe(mockUser.companyId);

      // Verify the JWT has the imp claim.
      const jwtMatch = result.cookie.match(/wms_session=([^;]+)/);
      expect(jwtMatch).not.toBeNull();
      if (jwtMatch && jwtMatch[1]) {
        const jwt = jwtMatch[1];
        const payload = await verifyJwtIgnoreExp(jwt);
        expect(payload.sub).toBe(mockUser.id);
        expect(payload.imp).toBe(mockAdminId);
        expect(payload.companyId).toBe(mockUser.companyId);
      }
    }
  });

  test('startImpersonation returns not-found for non-existent user', async () => {
    // Mock DB that returns no user
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])), // Empty result
          })),
        })),
      })),
    } as any;

    const result = await startImpersonation({
      adminId: mockAdminId,
      companyId: mockUser.companyId,
      userId: 999999, // Non-existent user ID
      now: new Date(),
      db: mockDb,
    });

    expect(result.kind).toBe('not-found');
  });

  test('startImpersonation returns not-found for user in different company', async () => {
    // Mock DB that returns user but with different companyId
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])), // No match for company filter
          })),
        })),
      })),
    } as any;

    const result = await startImpersonation({
      adminId: mockAdminId,
      companyId: 888, // Different company ID
      userId: mockUser.id,
      now: new Date(),
      db: mockDb,
    });

    expect(result.kind).toBe('not-found');
  });

  test('stopImpersonation revokes jti for valid impersonation token', async () => {
    // First, start impersonation to get a token
    const mockDbStart = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockUser])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
    } as any;

    const startResult = await startImpersonation({
      adminId: mockAdminId,
      companyId: mockUser.companyId,
      userId: mockUser.id,
      now: new Date(),
      db: mockDbStart,
    });

    expect(startResult.kind).toBe('ok');
    if (startResult.kind === 'ok') {
      const jwtMatch = startResult.cookie.match(/wms_session=([^;]+)/);
      expect(jwtMatch).not.toBeNull();
      if (jwtMatch) {
        const jwt = jwtMatch[1];
        const payload = await verifyJwtIgnoreExp(jwt);

        // Mock DB for stop operation
        const mockDbStop = {
          insert: mock(() => ({
            values: mock(() => Promise.resolve()),
          })),
        } as any;

        // Stop impersonation
        const stopResult = await stopImpersonation({
          cookieValue: jwt,
          now: new Date(),
          db: mockDbStop,
        });

        expect(stopResult.clearCookie).toContain('Max-Age=0');
        expect(stopResult.stopped).not.toBeNull();
        if (stopResult.stopped) {
          expect(stopResult.stopped.userId).toBe(mockUser.id);
          expect(stopResult.stopped.adminId).toBe(mockAdminId);
        }

        // Verify insert was called to revoke the jti
        expect(mockDbStop.insert).toHaveBeenCalled();
      }
    }
  });

  test('stopImpersonation with invalid token returns stopped=null but clears cookie', async () => {
    const mockDb = {
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
    } as any;

    const stopResult = await stopImpersonation({
      cookieValue: 'invalid-jwt-token',
      now: new Date(),
      db: mockDb,
    });

    expect(stopResult.clearCookie).toContain('Max-Age=0');
    expect(stopResult.stopped).toBeNull();
  });

  test('stopImpersonation with regular token (no imp claim) returns stopped=null but clears cookie', async () => {
    // Mint a regular token WITHOUT imp claim
    const regularToken = await signJwt({
      sub: mockUser.id,
      companyId: mockUser.companyId,
      role: mockUser.role,
      // NO imp claim - this is a regular session token
    }, new Date());

    const mockDb = {
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
    } as any;

    const stopResult = await stopImpersonation({
      cookieValue: regularToken,
      now: new Date(),
      db: mockDb,
    });

    // Should clear cookie but return stopped=null (no impersonation to stop)
    expect(stopResult.clearCookie).toContain('Max-Age=0');
    expect(stopResult.stopped).toBeNull();
  });

  test('stopImpersonation with undefined cookie clears cookie and returns stopped=null', async () => {
    const mockDb = {
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
    } as any;

    const stopResult = await stopImpersonation({
      cookieValue: undefined,
      now: new Date(),
      db: mockDb,
    });

    expect(stopResult.clearCookie).toContain('Max-Age=0');
    expect(stopResult.stopped).toBeNull();
  });
});
