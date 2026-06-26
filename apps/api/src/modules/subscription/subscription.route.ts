/**
 * Subscription Route — endpoint status langganan untuk tenant.
 *
 *   GET /subscription/status  -> { ok, active, subscription }
 *
 * Path ini di-EXEMPT dari subscription-guard (boleh diakses walau company keblokir).
 * Tujuan: frontend banner bisa fetch detail (planName, endsAt) walau company expired.
 *
 * Mount SETELAH authMiddleware, SEBELUM subscriptionGuardMiddleware.
 */

import { Elysia } from 'elysia';
import { getActiveSubscription } from '../platform/platform-subscriptions.service';

export const subscriptionRoutes = new Elysia().get(
  '/subscription/status',
  async ({ user, set }) => {
    set.status = 200;
    const sub = await getActiveSubscription(user.companyId, new Date());
    return { ok: true, active: !!sub, subscription: sub };
  },
);
