/**
 * Platform portal orders routes (Super Admin) — prefix /platform.
 *
 *   GET  /platform/orders                    -> list order lintas company (filter ?status=)
 *   GET  /platform/orders/pending-count      -> { count: number } buat badge dashboard
 *   GET  /platform/orders/:id/proof-url      -> presigned URL bukti transfer
 *   POST /platform/orders/:id/approve        -> approve order → aktifkan subscription + company
 *   POST /platform/orders/:id/reject         -> reject order + simpan note alasan
 *
 * Guard di-copy persis dari platform-companies.route.ts.
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import {
  listAllOrders,
  getOrderProofKey,
  approveOrder,
  rejectOrder,
} from './platform-orders.service';
import { isStorageConfigured, getProofPresignedUrl } from '../../services/storage.service';

/** Tenant session cookie name — mirror dari auth.middleware. */
const TENANT_COOKIE_NAME = 'wms_session';

export const platformOrdersRoutes = new Elysia({ prefix: '/platform' })
  .derive(async ({ cookie, set }) => {
    const sessionCookie = cookie[PLATFORM_COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === 'string' && sessionCookie.value !== ''
        ? sessionCookie.value
        : undefined;

    const admin = await platformMe({ cookieValue, now: new Date() });

    if (!admin) {
      const tenantCookie = cookie[TENANT_COOKIE_NAME];
      const tenantCookieValue =
        tenantCookie && typeof tenantCookie.value === 'string' && tenantCookie.value !== ''
          ? tenantCookie.value
          : undefined;
      const wrongScope = await hasValidTenantScope(tenantCookieValue);

      set.headers['Set-Cookie'] = buildPlatformClearCookie();
      set.status = wrongScope ? 403 : 401;
      return {
        platformAdmin: null as unknown as { id: number; email: string; name: string },
        platformAuthError: (wrongScope ? 'wrong_scope' : 'unauthorized') as
          | 'wrong_scope'
          | 'unauthorized',
      };
    }

    return { platformAdmin: admin, platformAuthError: undefined };
  })
  .onBeforeHandle(({ platformAdmin, platformAuthError, set }) => {
    if (!platformAdmin) {
      if (!set.status || set.status === 200) {
        set.status = 401;
      }
      if (platformAuthError === 'wrong_scope') {
        return {
          ok: false,
          error: 'wrong_scope',
          message:
            'This session belongs to the app and cannot access the Super Admin portal.',
        };
      }
      return { ok: false, error: 'unauthorized', message: 'A valid platform session is required.' };
    }
  })

  // GET /platform/orders?status=pending|approved|rejected
  .get('/orders', async ({ query, set }) => {
    const rawStatus = query.status as string | undefined;
    const validStatuses = ['pending', 'approved', 'rejected'] as const;
    const status = validStatuses.includes(rawStatus as any)
      ? (rawStatus as 'pending' | 'approved' | 'rejected')
      : undefined;

    const orders = await listAllOrders({ status });
    set.status = 200;
    return { ok: true, orders };
  })

  // GET /platform/orders/pending-count
  .get('/orders/pending-count', async ({ set }) => {
    const orders = await listAllOrders({ status: 'pending' });
    set.status = 200;
    return { ok: true, count: orders.length };
  })

  // GET /platform/orders/:id/proof-url
  .get('/orders/:id/proof-url', async ({ params, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const result = await getOrderProofKey(id);
    if (!result) {
      set.status = 404;
      return { ok: false, error: 'not_found' };
    }
    if (!result.proofKey) {
      set.status = 404;
      return { ok: false, error: 'no_proof' };
    }
    if (!isStorageConfigured()) {
      set.status = 503;
      return { ok: false, error: 'storage_not_configured' };
    }

    const url = getProofPresignedUrl(result.proofKey);
    set.status = 200;
    return { ok: true, url };
  })

  // POST /platform/orders/:id/approve
  .post('/orders/:id/approve', async ({ params, platformAdmin, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const result = await approveOrder({ orderId: id, reviewedBy: platformAdmin.id, now: new Date() });

    switch (result.kind) {
      case 'ok':
        set.status = 200;
        return { ok: true, order: result.order };
      case 'not_found':
        set.status = 404;
        return { ok: false, error: 'not_found' };
      case 'not_pending':
        set.status = 409;
        return { ok: false, error: 'order_not_pending' };
      case 'plan_missing':
        set.status = 400;
        return { ok: false, error: 'plan_missing' };
    }
  })

  // POST /platform/orders/:id/reject
  .post('/orders/:id/reject', async ({ params, body, platformAdmin, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const { note } = (body ?? {}) as { note?: unknown };
    const noteStr = typeof note === 'string' ? note : '';

    const result = await rejectOrder({
      orderId: id,
      reviewedBy: platformAdmin.id,
      note: noteStr,
      now: new Date(),
    });

    switch (result.kind) {
      case 'ok':
        set.status = 200;
        return { ok: true, order: result.order };
      case 'not_found':
        set.status = 404;
        return { ok: false, error: 'not_found' };
      case 'not_pending':
        set.status = 409;
        return { ok: false, error: 'order_not_pending' };
      case 'invalid_note':
        set.status = 400;
        return { ok: false, error: 'invalid_note', message: 'Alasan reject wajib diisi.' };
    }
  });
