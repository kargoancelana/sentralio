/**
 * Platform_Auth_Service — login + validasi sesi untuk portal Super Admin.
 *
 * Cermin dari modules/auth/auth.service.ts (login + validateSession + me) tapi:
 *  - identitas dari tabel platform_admins (GLOBAL, tanpa company_id)
 *  - token pakai scope:'platform' (signPlatformJwt)
 *  - cookie platform_session
 *  - reuse bcrypt (verifyPassword), lockout (failed_login_attempts/account_lockouts),
 *    dan util email tenant.
 *
 * Catatan: belum ada denylist/revocation server-side untuk platform (tabel
 * revoked_sessions FK-nya ke users.id). Logout portal bersifat stateless
 * (clear cookie). Revocation menyusul di fase berikutnya.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { platformAdmins } from '../../db/schema';
import { isValidEmailSyntax, normalizeEmail } from '../auth/email';
import { isLockedOut, recordFailure, clearFailures, type DrizzleDb } from '../auth/lockout';
import { signPlatformJwt, verifyPlatformJwtIgnoreExp } from './platform-jwt';
import { buildPlatformSessionCookie } from './platform-cookie';
import { verifyPassword } from '../auth/password';

export interface PublicPlatformAdmin {
  id: number;
  email: string;
  name: string;
}

export interface PlatformLoginOk {
  kind: 'ok';
  admin: PublicPlatformAdmin;
  jwt: string;
  cookie: string;
}
export interface PlatformLoginFail { kind: 'fail-401'; }
export interface PlatformLoginLocked { kind: 'fail-429'; }
export interface PlatformLoginInvalidInput {
  kind: 'fail-400';
  reason: 'json' | 'missing' | 'email_syntax';
}
export interface PlatformLoginInternal { kind: 'fail-500'; }

export type PlatformLoginResult =
  | PlatformLoginOk
  | PlatformLoginFail
  | PlatformLoginLocked
  | PlatformLoginInvalidInput
  | PlatformLoginInternal;

/** Hash bcrypt dummy untuk menyamakan timing saat email tidak dikenal. */
const DUMMY_PASSWORD_HASH =
  '$2b$12$MIQcvZWv2/2u4.6keldTjOeWCoiE7DozucLL0dZSetuSFnGwLKZt6';

export interface PlatformLoginInput {
  rawBody: unknown;
  ip: string;
  now: Date;
  db?: DrizzleDb;
}

interface ParsedCredentials {
  email: string;
  password: string;
}

function parseAndValidateBody(
  rawBody: unknown,
): ParsedCredentials | PlatformLoginInvalidInput {
  let body: unknown;
  if (typeof rawBody === 'string') {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { kind: 'fail-400', reason: 'json' };
    }
  } else {
    body = rawBody;
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { kind: 'fail-400', reason: 'json' };
  }

  const record = body as Record<string, unknown>;
  const { email, password } = record;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return { kind: 'fail-400', reason: 'missing' };
  }

  if (!isValidEmailSyntax(email)) {
    return { kind: 'fail-400', reason: 'email_syntax' };
  }

  return { email, password };
}

/**
 * Login Super Admin platform. Urutan SAMA dengan auth tenant:
 *  1. JSON-parse        -> 400 'json'
 *  2. Required-field    -> 400 'missing'
 *  3. Email syntax      -> 400 'email_syntax'
 *  4. Normalize email
 *  5. Lockout check     -> 429 (tanpa verify password, tanpa increment)
 *  6. Lookup platform_admins by email_lower
 *  7. bcrypt compare (dummy hash kalau admin tidak ada)
 *  8. unknown/wrong/inactive -> recordFailure + unified 401
 *  9. success           -> clearFailures + signPlatformJwt + cookie (500 on error)
 */
export async function platformLogin(input: PlatformLoginInput): Promise<PlatformLoginResult> {
  const { ip, now } = input;
  const db = input.db ?? defaultDb;

  const parsed = parseAndValidateBody(input.rawBody);
  if ('kind' in parsed) {
    return parsed;
  }

  const emailLower = normalizeEmail(parsed.email);
  const deps = { db, now };

  if (await isLockedOut(emailLower, deps)) {
    return { kind: 'fail-429' };
  }

  const rows = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.emailLower, emailLower))
    .limit(1);
  const admin = rows[0];

  const passwordOk = admin
    ? await verifyPassword(parsed.password, admin.passwordHash)
    : await verifyPassword(parsed.password, DUMMY_PASSWORD_HASH);

  const isInactive = admin ? admin.isActive !== 1 : false;
  if (!admin || !passwordOk || isInactive) {
    await recordFailure(emailLower, ip, deps);
    return { kind: 'fail-401' };
  }

  try {
    await clearFailures(emailLower, deps);
    const jwt = await signPlatformJwt({ sub: admin.id }, now);
    const cookie = buildPlatformSessionCookie(jwt);

    return {
      kind: 'ok',
      admin: { id: admin.id, email: admin.email, name: admin.name },
      jwt,
      cookie,
    };
  } catch {
    return { kind: 'fail-500' };
  }
}

// ─── Validasi sesi + me ───────────────────────────────────────

export interface PlatformSessionContext {
  admin: PublicPlatformAdmin;
  jti: string;
  exp: number;
}

interface PlatformSessionInput {
  cookieValue: string | undefined;
  now: Date;
  db?: DrizzleDb;
}

/**
 * Validasi cookie sesi platform. Urutan:
 *   a. verify signature (HS256) + scope:'platform' -> throw => null
 *   b. exp > now zero-skew (injected clock) -> null kalau expired
 *   c. admin ada (platform_admins.id = sub) -> null kalau tidak
 *   d. admin.is_active === 1 -> null kalau nonaktif
 *   e. iat >= tokens_valid_from -> null kalau lebih lama
 * (belum ada denylist jti untuk platform.)
 */
export async function validatePlatformSession(
  input: PlatformSessionInput,
): Promise<PlatformSessionContext | null> {
  const { cookieValue, now } = input;
  const db = input.db ?? defaultDb;

  if (!cookieValue) {
    return null;
  }

  let payload;
  try {
    payload = await verifyPlatformJwtIgnoreExp(cookieValue);
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowSeconds) {
    return null;
  }

  const rows = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, payload.sub))
    .limit(1);
  const admin = rows[0];
  if (!admin) {
    return null;
  }

  if (admin.isActive !== 1) {
    return null;
  }

  const tokensValidFromSec = typeof admin.tokensValidFrom === 'number' ? admin.tokensValidFrom : 0;
  if (payload.iat < tokensValidFromSec) {
    return null;
  }

  return {
    admin: { id: admin.id, email: admin.email, name: admin.name },
    jti: payload.jti,
    exp: payload.exp,
  };
}

/** Profil admin platform untuk sesi saat ini, atau null kalau sesi invalid. */
export async function platformMe(input: PlatformSessionInput): Promise<PublicPlatformAdmin | null> {
  const session = await validatePlatformSession(input);
  return session ? session.admin : null;
}
