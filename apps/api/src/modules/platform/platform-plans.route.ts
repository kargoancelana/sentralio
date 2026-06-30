/**
 * Platform portal plans routes (Super Admin) — prefix /platform.
 *
 *   GET  /platform/plans        -> list semua plan
 *   GET  /platform/plans/:id    -> detail 1 plan
 *   POST /platform/plans        -> buat plan baru
 *   PUT  /platform/plans/:id    -> edit plan (termasuk aktif/nonaktif)
 *
 * TIDAK ada DELETE — plan cuma bisa dinonaktifin (is_active=0).
 *
 * Guard di-copy persis dari platform-companies.route.ts.
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { listPlans, getPlan, createPlan, updatePlan } from './platform-plans.service';
import type { PlanInput } from './platform-plans.service';
import { logAudit, extractAuditIp } from './audit-log.service';

/** Tenant session cookie name — mirror dari auth.middleware. */
const TENANT_COOKIE_NAME = 'wms_session';

// ── validasi ──────────────────────────────────────────────────

function validatePlanInput(
  body: unknown,
  isCreate = true,
): { ok: true; value: PlanInput } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Body harus berupa JSON object.' };
  }
  const b = body as Record<string, unknown>;

  // name
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, message: 'name tidak boleh kosong.' };
  if (name.length > 255) return { ok: false, message: 'name maksimal 255 karakter.' };

  // durationDays
  const durationDays = b.durationDays;
  if (!Number.isInteger(durationDays) || (durationDays as number) <= 0) {
    return { ok: false, message: 'durationDays harus integer > 0.' };
  }

  // price
  const price = b.price;
  if (!Number.isInteger(price) || (price as number) < 0) {
    return { ok: false, message: 'price harus integer >= 0.' };
  }

  // maxShops
  const maxShops = b.maxShops;
  if (!Number.isInteger(maxShops) || (maxShops as number) < 1) {
    return { ok: false, message: 'maxShops harus integer >= 1.' };
  }

  // maxUsers
  const maxUsers = b.maxUsers;
  if (!Number.isInteger(maxUsers) || (maxUsers as number) < 1) {
    return { ok: false, message: 'maxUsers harus integer >= 1.' };
  }

  // features (opsional, harus array of string kalau ada)
  let features: string[] | null = null;
  if (b.features !== undefined && b.features !== null) {
    if (!Array.isArray(b.features)) {
      return { ok: false, message: 'features harus array of string atau null.' };
    }
    if (b.features.some((f) => typeof f !== 'string')) {
      return { ok: false, message: 'Setiap item features harus string.' };
    }
    features = (b.features as string[]).filter((f) => f.trim() !== '');
    if (features.length === 0) features = null;
  }

  // isActive (default true saat create)
  let isActive = true;
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== 'boolean') {
      return { ok: false, message: 'isActive harus boolean.' };
    }
    isActive = b.isActive;
  } else if (!isCreate) {
    // saat update, kalau tidak dikirim, anggap tidak berubah — tapi karena kita
    // minta semua field di PUT, wajib ada
    return { ok: false, message: 'isActive wajib disertakan.' };
  }

  return {
    ok: true,
    value: {
      name,
      durationDays: durationDays as number,
      price: price as number,
      maxShops: maxShops as number,
      maxUsers: maxUsers as number,
      features,
      isActive,
    },
  };
}

// ── route ─────────────────────────────────────────────────────

export const platformPlansRoutes = new Elysia({ prefix: '/platform' })
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

  // GET /platform/plans
  .get('/plans', async ({ set }) => {
    const data = await listPlans();
    set.status = 200;
    return { ok: true, plans: data };
  })

  // GET /platform/plans/:id
  .get('/plans/:id', async ({ params, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const plan = await getPlan(id);
    if (!plan) {
      set.status = 404;
      return { ok: false, error: 'not_found' };
    }

    set.status = 200;
    return { ok: true, plan };
  })

  // POST /platform/plans
  .post('/plans', async ({ body, set, platformAdmin, request, server }) => {
    const validation = validatePlanInput(body, true);
    if (!validation.ok) {
      set.status = 400;
      return { ok: false, error: 'validation', message: validation.message };
    }

    const plan = await createPlan(validation.value);
    await logAudit({
      actorType: 'platform',
      actorId: platformAdmin.id,
      action: 'platform.plan.create',
      targetType: 'plan',
      targetId: plan.id,
      after: plan,
      ip: extractAuditIp(request, server as Parameters<typeof extractAuditIp>[1]),
    });
    set.status = 201;
    return { ok: true, plan };
  })

  // PUT /platform/plans/:id
  .put('/plans/:id', async ({ params, body, set, platformAdmin, request, server }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const validation = validatePlanInput(body, false);
    if (!validation.ok) {
      set.status = 400;
      return { ok: false, error: 'validation', message: validation.message };
    }

    const before = await getPlan(id);
    const plan = await updatePlan(id, validation.value);
    if (!plan) {
      set.status = 404;
      return { ok: false, error: 'not_found' };
    }

    await logAudit({
      actorType: 'platform',
      actorId: platformAdmin.id,
      action: 'platform.plan.update',
      targetType: 'plan',
      targetId: id,
      before,
      after: plan,
      ip: extractAuditIp(request, server as Parameters<typeof extractAuditIp>[1]),
    });
    set.status = 200;
    return { ok: true, plan };
  });
