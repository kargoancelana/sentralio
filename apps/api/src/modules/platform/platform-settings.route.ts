/**
 * Platform portal settings routes (Super Admin) — prefix /platform.
 *
 *   GET  /platform/settings  -> ambil settings (payment_info + maintenance)
 *   PUT  /platform/settings  -> update settings (salah satu atau dua-duanya)
 *
 * Guard di-copy persis dari platform-plans.route.ts.
 */

import { Elysia } from 'elysia';
import { platformMe } from './platform-auth.service';
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from './platform-cookie';
import { hasValidTenantScope } from '../auth/scope-guard';
import { getSettings, updateSettings } from './platform-settings.service';
import type { PaymentInfo, MaintenanceSetting, MaintenanceLevel } from './platform-settings.service';

/** Tenant session cookie name — mirror dari auth.middleware. */
const TENANT_COOKIE_NAME = 'wms_session';

// ── validasi ──────────────────────────────────────────────────

interface ValidationResult<T> {
  ok: true;
  value: T;
}
interface ValidationError {
  ok: false;
  message: string;
}

function validatePaymentInfo(
  body: unknown,
): ValidationResult<PaymentInfo> | ValidationError {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'paymentInfo harus berupa object.' };
  }
  const b = body as Record<string, unknown>;

  const bankName = typeof b.bankName === 'string' ? b.bankName.trim() : '';
  const accountNumber = typeof b.accountNumber === 'string' ? b.accountNumber.trim() : '';
  const accountHolder = typeof b.accountHolder === 'string' ? b.accountHolder.trim() : '';
  const instructions = typeof b.instructions === 'string' ? b.instructions.trim() : '';
  const supportContact = typeof b.supportContact === 'string' ? b.supportContact.trim() : '';
  const note = typeof b.note === 'string' ? b.note.trim() : '';

  // Semua field string; maxlen validasi.
  if (bankName.length > 255) return { ok: false, message: 'bankName maksimal 255 karakter.' };
  if (accountNumber.length > 255) return { ok: false, message: 'accountNumber maksimal 255 karakter.' };
  if (accountHolder.length > 255) return { ok: false, message: 'accountHolder maksimal 255 karakter.' };
  if (instructions.length > 5000) return { ok: false, message: 'instructions maksimal 5000 karakter.' };
  if (supportContact.length > 255) return { ok: false, message: 'supportContact maksimal 255 karakter.' };
  if (note.length > 2000) return { ok: false, message: 'note maksimal 2000 karakter.' };

  return {
    ok: true,
    value: { bankName, accountNumber, accountHolder, instructions, supportContact, note },
  };
}

function validateMaintenance(
  body: unknown,
): ValidationResult<MaintenanceSetting> | ValidationError {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'maintenance harus berupa object.' };
  }
  const b = body as Record<string, unknown>;

  const level = typeof b.level === 'string' ? b.level.trim() : '';
  if (!['off', 'banner', 'full'].includes(level)) {
    return { ok: false, message: "level harus 'off', 'banner', atau 'full'." };
  }

  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (message.length > 2000) {
    return { ok: false, message: 'message maksimal 2000 karakter.' };
  }

  return { ok: true, value: { level: level as MaintenanceLevel, message } };
}

function validateSettingsInput(
  body: unknown,
): ValidationResult<{ paymentInfo?: PaymentInfo; maintenance?: MaintenanceSetting }> | ValidationError {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Body harus berupa JSON object.' };
  }
  const b = body as Record<string, unknown>;

  let paymentInfo: PaymentInfo | undefined;
  let maintenance: MaintenanceSetting | undefined;

  // Validasi paymentInfo kalau ada.
  if (b.paymentInfo !== undefined) {
    const pResult = validatePaymentInfo(b.paymentInfo);
    if (!pResult.ok) return pResult;
    paymentInfo = pResult.value;
  }

  // Validasi maintenance kalau ada.
  if (b.maintenance !== undefined) {
    const mResult = validateMaintenance(b.maintenance);
    if (!mResult.ok) return mResult;
    maintenance = mResult.value;
  }

  // Minimal salah satu harus ada.
  if (!paymentInfo && !maintenance) {
    return { ok: false, message: 'Minimal salah satu (paymentInfo atau maintenance) harus disertakan.' };
  }

  return { ok: true, value: { paymentInfo, maintenance } };
}

// ── route ─────────────────────────────────────────────────────

export const platformSettingsRoutes = new Elysia({ prefix: '/platform' })
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

    return { platformAdmin: admin, platformAuthError: null };
  })
  .onBeforeHandle(({ platformAuthError, set }) => {
    if (platformAuthError) {
      return {
        ok: false,
        error: platformAuthError,
        message:
          platformAuthError === 'wrong_scope'
            ? 'Portal platform membutuhkan sesi Super Admin, bukan sesi tenant.'
            : 'Tidak ter-autentikasi. Silakan login sebagai Super Admin.',
      };
    }
  })

  // GET /platform/settings
  .get('/settings', async ({ set }) => {
    set.status = 200;
    const settings = await getSettings();
    return { ok: true, settings };
  })

  // PUT /platform/settings
  .put('/settings', async ({ body, set }) => {
    const validation = validateSettingsInput(body);
    if (!validation.ok) {
      set.status = 400;
      return { ok: false, error: 'validation', message: validation.message };
    }

    await updateSettings(validation.value);
    const settings = await getSettings();
    set.status = 200;
    return { ok: true, settings };
  });
