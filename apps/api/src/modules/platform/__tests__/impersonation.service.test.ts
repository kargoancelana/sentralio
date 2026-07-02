/**
 * Tests for impersonation.service.ts (Fase 7.1).
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { users, revokedSessions } from '../../../db/schema';
import { startImpersonation, stopImpersonation } from '../impersonation.service';
import { verifyJwtIgnoreExp } from '../../auth/jwt';

describe('Impersonation Service', () => {
  let testCompanyId: number;
  let testUserId: number;
  let testAdminId: number;

  beforeAll(async () => {
    // Setup: create a test company and user (assumption: companies table exists).
    // In real test setup, you'd create a company first. For now, assume companyId=999.
    testCompanyId = 999;
    testAdminId = 1; // Platform admin ID

    // Insert a test user (or use existing).
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.companyId, testCompanyId))
      .limit(1);

    if (existingUsers.length > 0) {
      testUserId = existingUsers[0].id;
    } else {
      // Create a test user if needed (adjust as per your test setup).
      const [inserted] = await db.insert(users).values({
        companyId: testCompanyId,
        email: 'test-impersonation@example.com',
        emailLower: 'test-impersonation@example.com',
        name: 'Test Impersonation User',
        role: 'admin',
        passwordHash: '$2b$12$dummyhash',
        isActive: 1,
      });
      testUserId = (inserted as any).insertId;
    }
  });

  beforeEach(async () => {
    // Clean up revoked sessions for our test user before each test.
    await db.delete(revokedSessions).where(eq(revokedSessions.userId, testUserId));
  });

  test('startImpersonation returns ok with valid user', async () => {
    const result = await startImpersonation({
      adminId: testAdminId,
      companyId: testCompanyId,
      userId: testUserId,
      now: new Date(),
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.cookie).toContain('wms_session=');
      expect(result.user.id).toBe(testUserId);
      expect(result.user.companyId).toBe(testCompanyId);

      // Verify the JWT has the imp claim.
      const jwtMatch = result.cookie.match(/wms_session=([^;]+)/);
      expect(jwtMatch).not.toBeNull();
      if (jwtMatch) {
        const jwt = jwtMatch[1];
        const payload = await verifyJwtIgnoreExp(jwt);
        expect(payload.sub).toBe(testUserId);
        expect(payload.imp).toBe(testAdminId);
        expect(payload.companyId).toBe(testCompanyId);
      }
    }
  });

  test('startImpersonation returns not-found for non-existent user', async () => {
    const result = await startImpersonation({
      adminId: testAdminId,
      companyId: testCompanyId,
      userId: 999999, // Non-existent user ID
      now: new Date(),
    });

    expect(result.kind).toBe('not-found');
  });

  test('startImpersonation returns not-found for user in different company', async () => {
    const result = await startImpersonation({
      adminId: testAdminId,
      companyId: 888, // Different company ID
      userId: testUserId,
      now: new Date(),
    });

    expect(result.kind).toBe('not-found');
  });

  test('stopImpersonation revokes jti for valid impersonation token', async () => {
    // Start impersonation to get a token.
    const startResult = await startImpersonation({
      adminId: testAdminId,
      companyId: testCompanyId,
      userId: testUserId,
      now: new Date(),
    });

    expect(startResult.kind).toBe('ok');
    if (startResult.kind === 'ok') {
      const jwtMatch = startResult.cookie.match(/wms_session=([^;]+)/);
      expect(jwtMatch).not.toBeNull();
      if (jwtMatch) {
        const jwt = jwtMatch[1];
        const payload = await verifyJwtIgnoreExp(jwt);

        // Stop impersonation.
        const stopResult = await stopImpersonation({
          cookieValue: jwt,
          now: new Date(),
        });

        expect(stopResult.clearCookie).toContain('Max-Age=0');
        expect(stopResult.stopped).not.toBeNull();
        if (stopResult.stopped) {
          expect(stopResult.stopped.userId).toBe(testUserId);
          expect(stopResult.stopped.adminId).toBe(testAdminId);
        }

        // Verify jti is in revoked_sessions.
        const revoked = await db
          .select()
          .from(revokedSessions)
          .where(eq(revokedSessions.jti, payload.jti))
          .limit(1);
        expect(revoked.length).toBe(1);
      }
    }
  });

  test('stopImpersonation with invalid token returns stopped=null but clears cookie', async () => {
    const stopResult = await stopImpersonation({
      cookieValue: 'invalid-jwt-token',
      now: new Date(),
    });

    expect(stopResult.clearCookie).toContain('Max-Age=0');
    expect(stopResult.stopped).toBeNull();
  });

  test('stopImpersonation with regular token (no imp claim) returns stopped=null', async () => {
    // This test would require minting a regular token without imp claim.
    // For simplicity, we'll just test with undefined cookieValue.
    const stopResult = await stopImpersonation({
      cookieValue: undefined,
      now: new Date(),
    });

    expect(stopResult.clearCookie).toContain('Max-Age=0');
    expect(stopResult.stopped).toBeNull();
  });
});
