/**
 * Auth_Service — credential verification and session issuance.
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 8.1, 8.3
 *
 * This module owns the login path. It enforces a STRICT order of checks so the
 * pre-credential structural validation (Req 1.5/1.6) happens before any lockout
 * check, user lookup, or bcrypt comparison, and so the three credential-failure
 * cases (unknown email, wrong password, inactive user) are indistinguishable
 * (Req 1.4).
 *
 * The DB client is injectable (defaults to the real Drizzle client) so tests can
 * supply a fake.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { users, revokedSessions } from '../../db/schema';
import { isValidEmailSyntax, normalizeEmail } from './email';
import { isLockedOut, recordFailure, clearFailures, type DrizzleDb } from './lockout';
import { signJwt, verifyJwtIgnoreExp } from './jwt';
import { buildSessionCookie } from './cookie';
import { verifyPassword, hashPassword } from './password';
import { validatePasswordPolicy } from './password-policy';
// ───────────────────────────────────────────────────────────────────────────
// Result types
// ───────────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: number;
  companyId: number;
  email: string;
  name: string;
  role: 'admin' | 'staff';
}

/** Successful login: issued JWT + canonical Set-Cookie directive. */
export interface LoginOk {
  kind: 'ok';
  user: PublicUser;
  jwt: string;
  cookie: string;
}

/** Unified 401: unknown email / wrong password / inactive user (indistinguishable). */
export interface LoginFail {
  kind: 'fail-401';
}

/** Active lockout (429): no password verify, no failure increment. */
export interface LoginLocked {
  kind: 'fail-429';
}

/** Pre-credential structural validation failure (400). */
export interface LoginInvalidInput {
  kind: 'fail-400';
  reason: 'json' | 'missing' | 'email_syntax';
}

/** Internal failure during session issuance (500): no cookie, no partial state. */
export interface LoginInternal {
  kind: 'fail-500';
}

export type LoginResult =
  | LoginOk
  | LoginFail
  | LoginLocked
  | LoginInvalidInput
  | LoginInternal;

// ───────────────────────────────────────────────────────────────────────────
// Unified failure response builder (Req 1.4)
//
// The route layer (task 11) uses this single builder for ALL three credential
// failure cases so the (status, headers, body) tuple is byte-identical. There
// is no Set-Cookie, no WWW-Authenticate, and no identifying error code.
// ───────────────────────────────────────────────────────────────────────────

export interface UnifiedFailure {
  status: 401;
  headers: { 'Content-Type': string };
  body: string;
}

export function unifiedLoginFailureResponse(): UnifiedFailure {
  return {
    status: 401 as const,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ok: false, error: 'invalid_credentials' }),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Login
// ───────────────────────────────────────────────────────────────────────────

/**
 * A valid, constant bcrypt hash used as a comparison target when the email is
 * unknown. Performing a bcrypt comparison against this dummy hash keeps the
 * timing/behavior of the unknown-email branch close to the wrong-password
 * branch, avoiding a trivial timing oracle. This is best-effort only — bcrypt
 * timing is not perfectly constant — but it removes the gross "no hash work at
 * all" difference for unknown emails.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$MIQcvZWv2/2u4.6keldTjOeWCoiE7DozucLL0dZSetuSFnGwLKZt6';

export interface LoginInput {
  /** Raw request body — either a JSON string or an already-parsed object. */
  rawBody: unknown;
  /** Source IP of the request, recorded on a counted failure. */
  ip: string;
  /** Injected clock. */
  now: Date;
  /** Injectable DB client (defaults to the real Drizzle client). */
  db?: DrizzleDb;
}

interface ParsedCredentials {
  email: string;
  password: string;
}

/**
 * Parse + structurally validate the raw body.
 * Returns the credentials on success, or a 400 result describing the reason.
 */
function parseAndValidateBody(
  rawBody: unknown,
): ParsedCredentials | LoginInvalidInput {
  // Step 1: JSON-parse. Accept either a raw string (parse it) or an already
  // parsed object. Anything else (null, number, array, parse failure) → 'json'.
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

  // Step 2: Required-field check — email and password must both be strings.
  const record = body as Record<string, unknown>;
  const { email, password } = record;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return { kind: 'fail-400', reason: 'missing' };
  }

  // Step 3: Email syntax (validated on the raw, un-normalized value per Req 1.6).
  if (!isValidEmailSyntax(email)) {
    return { kind: 'fail-400', reason: 'email_syntax' };
  }

  return { email, password };
}

/**
 * Attempt to log a user in.
 *
 * Enforces this EXACT order (Req 1.5/1.6/1.7/8.1/8.3):
 *  1. JSON-parse                → 400 'json'
 *  2. Required-field check      → 400 'missing'
 *  3. Email syntax              → 400 'email_syntax'
 *  4. Normalize email
 *  5. Lockout check             → 429 (no password verify, no failure increment)
 *  6. User lookup
 *  7. bcrypt compare
 *  8. unknown / wrong / inactive → recordFailure + unified 401
 *  9. success                   → clearFailures + signJwt + cookie (500 on error)
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const { ip, now } = input;
  const db = input.db ?? defaultDb;

  // Steps 1–3: structural validation (no DB / crypto work yet).
  const parsed = parseAndValidateBody(input.rawBody);
  if ('kind' in parsed) {
    return parsed;
  }

  // Step 4: normalize the email into the canonical lookup key (Req 1.7).
  const emailLower = normalizeEmail(parsed.email);

  const deps = { db, now };

  // Step 5: lockout check — do NOT verify the password and do NOT record a
  // failure when locked (Req 8.1c, 8.3).
  if (await isLockedOut(emailLower, deps)) {
    return { kind: 'fail-429' };
  }

  // Step 6: user lookup by normalized email.
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.emailLower, emailLower))
    .limit(1);
  const user = rows[0];

  // Step 7: bcrypt compare. When the user is missing, compare against a dummy
  // hash so the unknown-email branch performs comparable hashing work (best
  // effort timing-leak mitigation). The result is necessarily false.
  const passwordOk = user
    ? await verifyPassword(parsed.password, user.passwordHash)
    : await verifyPassword(parsed.password, DUMMY_PASSWORD_HASH);

  // Step 8: unified failure for the three indistinguishable cases —
  // unknown email, wrong password, or inactive user. Record the counted
  // failure, then return the single canonical 401 marker.
  const isInactive = user ? user.isActive !== 1 : false;
  if (!user || !passwordOk || isInactive) {
    await recordFailure(emailLower, ip, deps);
    return { kind: 'fail-401' };
  }

  // Step 9: success — clear failures, sign the JWT, and build the cookie.
  // Wrap signing + persistence in try/catch: on any failure return fail-500
  // with NO cookie and NO partial persisted state (Req 1.9).
  try {
    await clearFailures(emailLower, deps);
    const jwt = await signJwt(
      { sub: user.id, role: user.role, companyId: user.companyId },
      now,
    );
    const cookie = buildSessionCookie(jwt);

    return {
      kind: 'ok',
      user: {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      jwt,
      cookie,
    };
  } catch {
    return { kind: 'fail-500' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Session validation, logout, me, and renew
// Requirements: 2.6, 2.7, 3.3, 3.5, 6.8, 10.1, 10.3, 10.4, 10.5, 10.6
// ───────────────────────────────────────────────────────────────────────────

/**
 * The authenticated context produced by a successful {@link validateSession}.
 * Carries the public user fields callers need plus the session's `jti` and
 * `exp` (unix seconds) so logout/renew can revoke the exact session.
 */
export interface SessionContext {
  user: PublicUser;
  jti: string;
  exp: number;
}

/** Shared input shape for the session-consuming operations. */
interface SessionInput {
  /** Raw `wms_session` cookie value (the JWT), or undefined when absent. */
  cookieValue: string | undefined;
  /** Injected clock. */
  now: Date;
  /** Injectable DB client (defaults to the real Drizzle client). */
  db?: DrizzleDb;
}

/**
 * Validate a session cookie value, enforcing the EXACT order from Req 2.6:
 *
 *   a. verify JWT signature (HS256) — on any throw → null
 *   b. exp > now with ZERO skew (Req 10.1) — exp <= now → null
 *   c. user exists (users.id = sub) — not found → null
 *   d. user.is_active === 1 (Req 6.8/10.6) — inactive → null
 *   e. jti NOT present in revoked_sessions — revoked → null
 *
 * Returns a {@link SessionContext} when every check passes, otherwise null.
 *
 * NOTE on the expiry check: `verifyJwt` (used on the login path) delegates the
 * `exp` check to jose against the process wall clock. Here we instead use
 * `verifyJwtIgnoreExp` (which verifies signature + claims but disables jose's
 * wall-clock expiry check) and then apply the explicit zero-skew comparison
 * `exp > Math.floor(now.getTime() / 1000)` against the INJECTED `now`. This
 * makes the expiry rule deterministic under an injected clock (required for
 * Property 8 testing) and enforces Req 10.1's "zero skew tolerance" precisely.
 */
export async function validateSession(
  input: SessionInput,
): Promise<SessionContext | null> {
  const { cookieValue, now } = input;
  const db = input.db ?? defaultDb;

  // Missing/empty cookie → no session.
  if (!cookieValue) {
    return null;
  }

  // (a) Verify signature + required claims. Any failure (bad signature,
  // alg:none/non-HS256, malformed, missing claims) → null.
  let payload;
  try {
    payload = await verifyJwtIgnoreExp(cookieValue);
  } catch {
    return null;
  }

  // (b) Explicit zero-skew expiry check against the injected clock (Req 10.1).
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowSeconds) {
    return null;
  }

  // (c) User lookup by sub (users.id).
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  const user = rows[0];
  if (!user) {
    return null;
  }

  // (d) Active check (Req 6.8 / 10.6). Inactive users are rejected — this is the
  // mechanism by which toggling is_active = false revokes all live sessions.
  if (user.isActive !== 1) {
    return null;
  }

  // (d2) Password-change revocation: sessions issued before tokens_valid_from
  // are invalid. Changing a password bumps tokens_valid_from to now (unix
  // seconds), so all previously-issued JWTs (older iat) are rejected here.
  const tokensValidFromSec = typeof user.tokensValidFrom === 'number' ? user.tokensValidFrom : 0;
  if (payload.iat < tokensValidFromSec) {
    return null;
  }

  // (e) Denylist check — a logged-out / rotated jti is server-side invalidated.
  const revoked = await db
    .select()
    .from(revokedSessions)
    .where(eq(revokedSessions.jti, payload.jti))
    .limit(1);
  if (revoked.length > 0) {
    return null;
  }

  return {
    user: {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    jti: payload.jti,
    exp: payload.exp,
  };
}

/**
 * Log out the session carried by `cookieValue`.
 *
 * Validates the session first (Req 3.5): if there is no valid session this
 * returns `{ ok: false }` and the route maps that to a 401 with NO
 * cookie-clearing `Set-Cookie` header. When the session is valid the `jti` is
 * inserted into `revoked_sessions` (Req 3.3) so any later request presenting
 * the same token is rejected by {@link validateSession}. The insert is
 * idempotent (duplicate `jti` is a no-op) so repeated logouts are safe.
 */
export async function logout(
  input: SessionInput,
): Promise<{ ok: true } | { ok: false }> {
  const { now } = input;
  const db = input.db ?? defaultDb;

  const session = await validateSession({ ...input, db });
  if (!session) {
    return { ok: false };
  }

  await revokeJti(db, session.user.id, session.jti, session.exp, now);

  return { ok: true };
}

/**
 * Return the public profile for the current session, or null when the session
 * is invalid. Thin wrapper over {@link validateSession}.
 */
export async function me(input: SessionInput): Promise<PublicUser | null> {
  const session = await validateSession(input);
  return session ? session.user : null;
}

/** Number of seconds a freshly issued session is valid (8 hours). */
const SESSION_DURATION_SECONDS = 28_800;

/**
 * Renew (rotate) the session carried by `cookieValue`.
 *
 * Reuses {@link validateSession}; if the session is invalid/expired/inactive
 * this returns null and the route maps it to a 401 with NO cookie mutation
 * (Req 10.5). On success it:
 *   1. revokes the OLD jti (insert into revoked_sessions), then
 *   2. signs a NEW JWT (fresh jti/iat, exp = now + 28800) for the same sub/role,
 *   3. builds the canonical session cookie (Req 10.3, 10.4).
 *
 * If any step throws, null is returned so the route responds 401 rather than
 * leaving a partially-applied rotation surfaced to the client.
 */
export async function renew(
  input: SessionInput,
): Promise<{ jwt: string; cookie: string; user: PublicUser } | null> {
  const { now } = input;
  const db = input.db ?? defaultDb;

  const session = await validateSession({ ...input, db });
  if (!session) {
    return null;
  }

  try {
    // Revoke the old jti first so the prior token cannot be reused after
    // rotation. Then mint the replacement.
    await revokeJti(db, session.user.id, session.jti, session.exp, now);

    const jwt = await signJwt(
      {
        sub: session.user.id,
        role: session.user.role,
        companyId: session.user.companyId,
      },
      now,
    );
    const cookie = buildSessionCookie(jwt);

    return { jwt, cookie, user: session.user };
  } catch {
    return null;
  }
}

/**
 * Insert a `jti` into `revoked_sessions`, idempotently.
 *
 * `expires_at` is set to the JWT's `exp` (unix seconds → Date) so the row can be
 * garbage-collected once the underlying token would have expired anyway. A
 * duplicate `jti` (e.g. double logout) is treated as a no-op via
 * onDuplicateKeyUpdate.
 */
async function revokeJti(
  db: DrizzleDb,
  userId: number,
  jti: string,
  exp: number,
  now: Date,
): Promise<void> {
  await db
    .insert(revokedSessions)
    .values({
      jti,
      userId,
      revokedAt: now,
      expiresAt: new Date(exp * 1000),
    })
    .onDuplicateKeyUpdate({
      // No-op update keeps the operation idempotent without changing the
      // original revocation timestamp meaningfully.
      set: { jti },
    });
}

// ───────────────────────────────────────────────────────────────────────────
// changePassword
// ───────────────────────────────────────────────────────────────────────────

export type ChangePasswordResult =
  | { kind: 'ok'; jwt: string; cookie: string }
  | { kind: 'fail-401' }            // no valid session
  | { kind: 'fail-current' }        // current password wrong
  | { kind: 'fail-validation'; error: string }  // new password invalid
  | { kind: 'fail-500' };           // internal error

export interface ChangePasswordInput {
  cookieValue: string | undefined;
  currentPassword: unknown;
  newPassword: unknown;
  now: Date;
  db?: DrizzleDb;
}

/**
 * Change the current user's password.
 *
 * Flow:
 *   1. Validate the session (401 if invalid).
 *   2. Validate newPassword shape (10–128 chars).
 *   3. Verify currentPassword against the stored hash (fail-current if wrong).
 *   4. Hash the new password, update password_hash, and bump tokens_valid_from
 *      to `now` — this invalidates ALL other sessions for the user (their JWT
 *      iat is older than tokens_valid_from).
 *   5. Rotate the CURRENT session: sign a fresh JWT (iat = now) so the caller
 *      stays logged in, and revoke the old jti.
 */
export async function changePassword(
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const { currentPassword, newPassword, now } = input;
  const db = input.db ?? defaultDb;

  // 1. Session must be valid.
  const session = await validateSession({ cookieValue: input.cookieValue, now, db });
  if (!session) {
    return { kind: 'fail-401' };
  }

  // 2. Validate the new password against the policy (min 8, uppercase, special).
  const pw = validatePasswordPolicy(newPassword);
  if (!pw.ok) {
    return { kind: 'fail-validation', error: pw.message! };
  }
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    return { kind: 'fail-current' };
  }

  try {
    // Look up the full user row to get the current password hash.
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const user = rows[0];
    if (!user) {
      return { kind: 'fail-401' };
    }

    // 3. Verify the current password.
    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) {
      return { kind: 'fail-current' };
    }

    // 4. Hash and persist the new password; bump tokens_valid_from to revoke
    //    all other sessions (Req: revoke other sessions on password change).
    //    We use nowSec + 1 as the cutoff and stamp the rotated session's JWT
    //    with the same iat so that: (a) any session issued at or before `now`
    //    (including a near-simultaneous second device) is rejected, and
    //    (b) the freshly-rotated current session passes the iat >= cutoff check.
    const newHash = await hashPassword(newPassword);
    const cutoffSec = Math.floor(now.getTime() / 1000) + 1;
    await db
      .update(users)
      .set({ passwordHash: newHash, tokensValidFrom: cutoffSec })
      .where(eq(users.id, session.user.id));

    // 5. Rotate the current session so the caller stays authenticated.
    //    Revoke the old jti and issue a fresh JWT with iat = cutoffSec so it
    //    satisfies iat >= tokens_valid_from.
    await revokeJti(db, session.user.id, session.jti, session.exp, now);
    const jwt = await signJwt(
      {
        sub: session.user.id,
        role: session.user.role,
        companyId: session.user.companyId,
      },
      new Date(cutoffSec * 1000),
    );
    const cookie = buildSessionCookie(jwt);

    return { kind: 'ok', jwt, cookie };
  } catch {
    return { kind: 'fail-500' };
  }
}
