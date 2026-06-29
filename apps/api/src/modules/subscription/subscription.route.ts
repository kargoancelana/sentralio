/**
 * Subscription Route — status langganan + order langganan (self-service tenant).
 *
 *   GET  /subscription/status            -> { ok, active, subscription }
 *   POST /subscription/orders            -> buat order pending { planId }
 *   GET  /subscription/orders            -> list order milik company
 *   POST /subscription/orders/:id/proof  -> upload bukti transfer (multipart)
 *
 * SEMUA path /subscription/* di-EXEMPT dari subscription-guard (lihat
 * subscription-guard.middleware EXEMPT_PREFIXES). Tujuan: company 'pending' yang
 * belum punya langganan aktif TETAP bisa submit order + upload bukti.
 *
 * Mount SETELAH authMiddleware (butuh ctx.user), SEBELUM subscriptionGuardMiddleware.
 */

import { Elysia } from 'elysia';
import { getActiveSubscription } from '../platform/platform-subscriptions.service';
import {
  attachProof,
  createOrder,
  getOrderForCompany,
  listOrders,
} from './subscription-order.service';
import { uploadProof } from '../../services/storage.service';
import { listActivePlans } from './subscription-plan.service';
import { getPaymentInfo } from '../platform/platform-settings.service';

export const subscriptionRoutes = new Elysia()
  .get('/subscription/status', async ({ user, set }) => {
    set.status = 200;
    const sub = await getActiveSubscription(user.companyId, new Date());
    return { ok: true, active: !!sub, subscription: sub };
  })

  // List plan AKTIF untuk tenant (pilih paket sebelum buat order).
  .get('/subscription/plans', async ({ set }) => {
    set.status = 200;
    const activePlans = await listActivePlans();
    return { ok: true, plans: activePlans };
  })

  // Info pembayaran untuk tenant (bank rekening, instruksi, kontak support).
  // Company pending (belum punya langganan) tetap bisa akses (utk halaman order).
  .get('/subscription/payment-info', async ({ set }) => {
    set.status = 200;
    const paymentInfo = await getPaymentInfo();
    return { ok: true, paymentInfo };
  })

  // Buat order pending baru. Body: { planId: number }.
  .post('/subscription/orders', async ({ user, body, set }) => {
    const b = (body ?? {}) as { planId?: unknown };
    const result = await createOrder({ companyId: user.companyId, planId: b.planId });
    switch (result.kind) {
      case 'ok':
        set.status = 201;
        return { ok: true, order: result.order };
      case 'fail-validation':
        set.status = 400;
        return { ok: false, error: 'validation', message: result.message };
      case 'fail-plan-not-found':
        set.status = 404;
        return { ok: false, error: 'plan_not_found' };
      case 'fail-pending-exists':
        set.status = 409;
        return { ok: false, error: 'pending_order_exists', order: result.order };
      case 'fail-500':
        set.status = 500;
        return { ok: false, error: 'internal_error' };
    }
  })

  // List order milik company (terbaru dulu).
  .get('/subscription/orders', async ({ user, set }) => {
    set.status = 200;
    const orders = await listOrders(user.companyId);
    return { ok: true, orders };
  })

  // Upload bukti transfer untuk order (multipart/form-data, field "file").
  .post('/subscription/orders/:id/proof', async ({ user, params, body, set }) => {
    const orderId = Number(params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_order_id' };
    }

    // Validasi ownership + status SEBELUM upload (hindari objek S3 orphan).
    const order = await getOrderForCompany(user.companyId, orderId);
    if (!order) {
      set.status = 404;
      return { ok: false, error: 'order_not_found' };
    }
    if (order.status !== 'pending') {
      set.status = 409;
      return { ok: false, error: 'order_not_pending' };
    }

    // Ambil file dari multipart body. Elysia auto-parse multipart -> field jadi File.
    const file = (body as { file?: unknown } | null)?.file;
    if (!(file instanceof File)) {
      set.status = 400;
      return { ok: false, error: 'file_required' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    let key: string;
    try {
      const uploaded = await uploadProof({
        companyId: user.companyId,
        bytes,
        contentType: file.type,
      });
      key = uploaded.key;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'upload_failed';
      if (msg === 'invalid_file_type') {
        set.status = 400;
        return { ok: false, error: 'invalid_file_type' };
      }
      if (msg === 'file_too_large') {
        set.status = 400;
        return { ok: false, error: 'file_too_large' };
      }
      if (msg === 'storage_not_configured') {
        set.status = 503;
        return { ok: false, error: 'storage_not_configured' };
      }
      set.status = 500;
      return { ok: false, error: 'upload_failed' };
    }

    const result = await attachProof({ companyId: user.companyId, orderId, key });
    switch (result.kind) {
      case 'ok':
        set.status = 200;
        return { ok: true, proofKey: key };
      case 'fail-not-found':
        set.status = 404;
        return { ok: false, error: 'order_not_found' };
      case 'fail-not-pending':
        set.status = 409;
        return { ok: false, error: 'order_not_pending' };
      case 'fail-500':
        set.status = 500;
        return { ok: false, error: 'internal_error' };
    }
  });
