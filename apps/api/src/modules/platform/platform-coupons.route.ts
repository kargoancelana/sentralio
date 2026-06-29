/**
 * Platform portal coupons routes (Super Admin) — prefix /platform.
 *
 *   GET  /platform/coupons        -> list semua kupon
 *   GET  /platform/coupons/:id    -> detail 1 kupon
 *   POST /platform/coupons        -> buat kupon baru
 *   PUT  /platform/coupons/:id    -> edit kupon (termasuk aktif/nonaktif)
 *
 * TIDAK ada DELETE — kupon cuma bisa dinonaktifin (is_active=0).
 *
 * Guard di-copy persis dari platform-plans.route.ts.
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { listCoupons, getCoupon, createCoupon, updateCoupon, DuplicateCouponCodeError, PlanNotFoundError } from './platform-coupons.service';
import type { CouponInput } from './platform-coupons.service';

/** Tenant session cookie name — mirror dari auth.middleware. */
const TENANT_COOKIE_NAME = 'wms_session';

// ── validasi ──────────────────────────────────────────────────

function validateCouponInput(
  body: unknown,
  isCreate = true,
): { ok: true; value: CouponInput } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Body harus berupa JSON object.' };
  }
  const b = body as Record<string, unknown>;

  // code
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  if (!code) return { ok: false, message: 'code tidak boleh kosong.' };
  if (code.length > 64) return { ok: false, message: 'code maksimal 64 karakter.' };
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return { ok: false, message: 'code hanya boleh berisi huruf, angka, underscore, dan dash.' };
  }

  // type
  const type = b.type;
  if (type !== 'percent' && type !== 'fixed') {
    return { ok: false, message: "type harus 'percent' atau 'fixed'." };
  }

  // value
  const value = b.value;
  if (!Number.isInteger(value)) {
    return { ok: false, message: 'value harus integer.' };
  }
  if (type === 'percent') {
    if ((value as number) < 1 || (value as number) > 100) {
      return { ok: false, message: 'value untuk percent harus antara 1-100.' };
    }
  } else {
    // fixed
    if ((value as number) < 1) {
      return { ok: false, message: 'value untuk fixed harus >= 1.' };
    }
  }

  // maxUses (nullable atau integer >= 1)
  let maxUses: number | null = null;
  if (b.maxUses !== undefined && b.maxUses !== null) {
    if (!Number.isInteger(b.maxUses) || (b.maxUses as number) < 1) {
      return { ok: false, message: 'maxUses harus null atau integer >= 1.' };
    }
    maxUses = b.maxUses as number;
  }

  // validFrom (nullable atau ISO string valid)
  let validFrom: string | null = null;
  if (b.validFrom !== undefined && b.validFrom !== null) {
    if (typeof b.validFrom !== 'string') {
      return { ok: false, message: 'validFrom harus string ISO atau null.' };
    }
    if (Number.isNaN(Date.parse(b.validFrom))) {
      return { ok: false, message: 'validFrom harus string ISO valid.' };
    }
    validFrom = b.validFrom;
  }

  // validUntil (nullable atau ISO string valid)
  let validUntil: string | null = null;
  if (b.validUntil !== undefined && b.validUntil !== null) {
    if (typeof b.validUntil !== 'string') {
      return { ok: false, message: 'validUntil harus string ISO atau null.' };
    }
    if (Number.isNaN(Date.parse(b.validUntil))) {
      return { ok: false, message: 'validUntil harus string ISO valid.' };
    }
    validUntil = b.validUntil;
  }

  // kalau keduanya ada, validUntil harus > validFrom
  if (validFrom && validUntil) {
    if (new Date(validUntil) <= new Date(validFrom)) {
      return { ok: false, message: 'validUntil harus lebih besar dari validFrom.' };
    }
  }

  // planId (nullable atau integer >= 1)
  let planId: number | null = null;
  if (b.planId !== undefined && b.planId !== null) {
    if (!Number.isInteger(b.planId) || (b.planId as number) < 1) {
      return { ok: false, message: 'planId harus null atau integer >= 1.' };
    }
    planId = b.planId as number;
  }

  // isActive (default true saat create)
  let isActive = true;
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== 'boolean') {
      return { ok: false, message: 'isActive harus boolean.' };
    }
    isActive = b.isActive;
  } else if (!isCreate) {
    // saat update, wajib ada
    return { ok: false, message: 'isActive wajib disertakan.' };
  }

  return {
    ok: true,
    value: {
      code,
      type: type as 'percent' | 'fixed',
      value: value as number,
      maxUses,
      validFrom,
      validUntil,
      planId,
      isActive,
    },
  };
}

// ── route ─────────────────────────────────────────────────────

export const platformCouponsRoutes = new Elysia({ prefix: '/platform' })
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

  // GET /platform/coupons
  .get('/coupons', async ({ set }) => {
    const data = await listCoupons();
    set.status = 200;
    return { ok: true, coupons: data };
  })

  // GET /platform/coupons/:id
  .get('/coupons/:id', async ({ params, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const coupon = await getCoupon(id);
    if (!coupon) {
      set.status = 404;
      return { ok: false, error: 'not_found' };
    }

    set.status = 200;
    return { ok: true, coupon };
  })

  // POST /platform/coupons
  .post('/coupons', async ({ body, set }) => {
    const validation = validateCouponInput(body, true);
    if (!validation.ok) {
      set.status = 400;
      return { ok: false, error: 'validation', message: validation.message };
    }

    try {
      const coupon = await createCoupon(validation.value);
      set.status = 201;
      return { ok: true, coupon };
    } catch (e) {
      if (e instanceof DuplicateCouponCodeError) {
        set.status = 409;
        return { ok: false, error: 'duplicate_code', message: 'Kode kupon sudah dipakai.' };
      }
      if (e instanceof PlanNotFoundError) {
        set.status = 400;
        return { ok: false, error: 'plan_not_found', message: 'Plan yang dipilih tidak ditemukan.' };
      }
      throw e;
    }
  })

  // PUT /platform/coupons/:id
  .put('/coupons/:id', async ({ params, body, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id' };
    }

    const validation = validateCouponInput(body, false);
    if (!validation.ok) {
      set.status = 400;
      return { ok: false, error: 'validation', message: validation.message };
    }

    try {
      const coupon = await updateCoupon(id, validation.value);
      if (!coupon) {
        set.status = 404;
        return { ok: false, error: 'not_found' };
      }

      set.status = 200;
      return { ok: true, coupon };
    } catch (e) {
      if (e instanceof DuplicateCouponCodeError) {
        set.status = 409;
        return { ok: false, error: 'duplicate_code', message: 'Kode kupon sudah dipakai.' };
      }
      if (e instanceof PlanNotFoundError) {
        set.status = 400;
        return { ok: false, error: 'plan_not_found', message: 'Plan yang dipilih tidak ditemukan.' };
      }
      throw e;
    }
  });
