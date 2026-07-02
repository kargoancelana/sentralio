/**
 * Unit tests for Impersonation Guard Middleware (Fase 7.2).
 *
 * Tests pure functions (no DB/JWT dependency):
 * - normalizeImpersonationPath
 * - isBlockedImpersonationRoute
 */

import { describe, expect, test } from 'bun:test';
import {
  normalizeImpersonationPath,
  isBlockedImpersonationRoute,
} from '../impersonation-guard.middleware';

describe('normalizeImpersonationPath', () => {
  test('strips /api prefix', () => {
    expect(normalizeImpersonationPath('/api/auth/change-password')).toBe('/auth/change-password');
    expect(normalizeImpersonationPath('/api/subscription/orders')).toBe('/subscription/orders');
  });

  test('strips query string', () => {
    expect(normalizeImpersonationPath('http://x/api/subscription/orders?a=1')).toBe(
      '/subscription/orders',
    );
    expect(normalizeImpersonationPath('/api/auth/me?refresh=1')).toBe('/auth/me');
  });

  test('strips trailing slash', () => {
    expect(normalizeImpersonationPath('/subscription/orders/')).toBe('/subscription/orders');
    expect(normalizeImpersonationPath('/api/auth/logout/')).toBe('/auth/logout');
  });

  test('handles /api alone', () => {
    expect(normalizeImpersonationPath('/api')).toBe('/');
    expect(normalizeImpersonationPath('/api/')).toBe('/');
  });

  test('handles paths without /api prefix', () => {
    expect(normalizeImpersonationPath('/auth/login')).toBe('/auth/login');
    expect(normalizeImpersonationPath('/subscription/status')).toBe('/subscription/status');
  });

  test('handles full URLs', () => {
    expect(normalizeImpersonationPath('http://localhost:3000/api/auth/me')).toBe('/auth/me');
    expect(
      normalizeImpersonationPath('https://sentralio.my.id/api/subscription/orders/123/proof'),
    ).toBe('/subscription/orders/123/proof');
  });
});

describe('isBlockedImpersonationRoute', () => {
  test('blocks POST /auth/change-password', () => {
    expect(isBlockedImpersonationRoute('POST', '/auth/change-password')).toBe(true);
  });

  test('blocks POST /subscription/orders', () => {
    expect(isBlockedImpersonationRoute('POST', '/subscription/orders')).toBe(true);
  });

  test('blocks POST /subscription/orders/:id/proof (numeric ID)', () => {
    expect(isBlockedImpersonationRoute('POST', '/subscription/orders/12/proof')).toBe(true);
    expect(isBlockedImpersonationRoute('POST', '/subscription/orders/999/proof')).toBe(true);
  });

  test('allows GET /subscription/orders (list, not create)', () => {
    expect(isBlockedImpersonationRoute('GET', '/subscription/orders')).toBe(false);
  });

  test('allows POST /subscription/coupons/validate (read-only preview)', () => {
    expect(isBlockedImpersonationRoute('POST', '/subscription/coupons/validate')).toBe(false);
  });

  test('allows POST /subscription/orders/:id/proof with non-numeric ID', () => {
    expect(isBlockedImpersonationRoute('POST', '/subscription/orders/abc/proof')).toBe(false);
    expect(isBlockedImpersonationRoute('POST', '/subscription/orders/12abc/proof')).toBe(false);
  });

  test('allows POST /auth/login', () => {
    expect(isBlockedImpersonationRoute('POST', '/auth/login')).toBe(false);
  });

  test('allows POST /auth/logout', () => {
    expect(isBlockedImpersonationRoute('POST', '/auth/logout')).toBe(false);
  });

  test('allows non-POST methods on sensitive paths', () => {
    expect(isBlockedImpersonationRoute('GET', '/auth/change-password')).toBe(false);
    expect(isBlockedImpersonationRoute('PUT', '/subscription/orders')).toBe(false);
    expect(isBlockedImpersonationRoute('DELETE', '/subscription/orders/12/proof')).toBe(false);
  });

  test('allows other POST routes', () => {
    expect(isBlockedImpersonationRoute('POST', '/orders')).toBe(false);
    expect(isBlockedImpersonationRoute('POST', '/products')).toBe(false);
    expect(isBlockedImpersonationRoute('POST', '/shopee/auth')).toBe(false);
  });
});
