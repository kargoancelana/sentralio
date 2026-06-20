import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';

export interface PlatformJwtPayload {
  sub: number;                  // platform_admins.id
  scope: 'platform';            // membedakan token platform dari token tenant
  iat: number;                  // unix seconds
  exp: number;                  // = iat + 28800 (8h)
  jti: string;                  // UUIDv4
}

const SESSION_DURATION_SECONDS = 28_800; // 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a platform JWT. Sets iat from `now`, exp = iat + 28800, fresh jti,
 * and a fixed scope:'platform' claim. HS256 only.
 */
export async function signPlatformJwt(
  payload: Omit<PlatformJwtPayload, 'iat' | 'exp' | 'jti' | 'scope'>,
  now: Date,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + SESSION_DURATION_SECONDS;
  const jti = randomUUID();

  return new SignJWT({
    sub: String(payload.sub),
    scope: 'platform',
    iat,
    exp,
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret());
}

function extractClaims(payload: Record<string, unknown>): PlatformJwtPayload {
  const sub = payload.sub;
  const scope = payload.scope;
  const iat = payload.iat;
  const exp = payload.exp;
  const jti = payload.jti;

  if (typeof sub !== 'string' && typeof sub !== 'number') {
    throw new Error('JWT missing or invalid sub claim');
  }
  if (scope !== 'platform') {
    throw new Error('JWT missing or invalid scope claim');
  }
  if (typeof iat !== 'number') {
    throw new Error('JWT missing or invalid iat claim');
  }
  if (typeof exp !== 'number') {
    throw new Error('JWT missing or invalid exp claim');
  }
  if (typeof jti !== 'string') {
    throw new Error('JWT missing or invalid jti claim');
  }

  return {
    sub: Number(sub),
    scope: 'platform',
    iat,
    exp,
    jti,
  };
}

/**
 * Verify a platform JWT signature + claims WITHOUT enforcing jose's wall-clock
 * exp check (uses currentDate epoch 0). Caller MUST do its own zero-skew exp
 * check against an injected `now`. Rejects any token whose scope !== 'platform'.
 */
export async function verifyPlatformJwtIgnoreExp(token: string): Promise<PlatformJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
    currentDate: new Date(0),
  });

  return extractClaims(payload as Record<string, unknown>);
}
