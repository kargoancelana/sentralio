import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';

export interface AuthJwtPayload {
  sub: number;                  // users.id
  role: 'admin' | 'staff';
  companyId: number | null;     // users.company_id — dibawa di token (Fase 1.2). null untuk token lama (pra-1.2).
  scope: 'tenant';              // scope token — token terbitan tenant selalu 'tenant' (Fase 1.2). Platform pakai signer terpisah.
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
 * Sign a new JWT with the given payload.
 * Sets iat from `now`, exp = iat + 28800, and generates a fresh jti.
 * Uses HS256 algorithm only.
 */
export async function signJwt(
  payload: Omit<AuthJwtPayload, 'iat' | 'exp' | 'jti' | 'scope' | 'companyId'> & {
    companyId?: number;
  },
  now: Date,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + SESSION_DURATION_SECONDS;
  const jti = randomUUID();

  return new SignJWT({
    sub: String(payload.sub),  // jose expects sub as string in standard claims
    role: payload.role,
    companyId: payload.companyId,  // klaim dibawa (Fase 1.2); JSON.stringify membuang key ini saat undefined
    scope: 'tenant',               // signer tenant selalu cap scope 'tenant' (Fase 1.2)
    iat,
    exp,
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(getSecret());
}

/**
 * Validate and coerce the standard/custom claims of a decoded jose payload into
 * a strongly-typed AuthJwtPayload. Throws on any missing/invalid claim.
 */
function extractClaims(payload: Record<string, unknown>): AuthJwtPayload {
  const sub = payload.sub;
  const role = payload.role;
  const companyId = payload.companyId;
  const iat = payload.iat;
  const exp = payload.exp;
  const jti = payload.jti;

  if (typeof sub !== 'string' && typeof sub !== 'number') {
    throw new Error('JWT missing or invalid sub claim');
  }
  if (role !== 'admin' && role !== 'staff') {
    throw new Error('JWT missing or invalid role claim');
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

  // companyId DIBAWA tapi tidak diwajibkan pada Fase 1.2: sesi tenant yang
  // terbit sebelum 1.2 (tanpa klaim companyId) harus tetap lolos validasi
  // (tidak ada force-logout). Token sejak 1.2 selalu menyertakan companyId
  // numerik. Cross-check/enforcement ditunda ke fase berikutnya.
  // scope dinormalkan ke 'tenant' di sini: ini verifier tenant, dan token
  // ber-scope platform (yang tidak punya klaim `role`) sudah ditolak oleh cek
  // role di atas. Enforcement cross-scope (403) adalah fase berikutnya.
  return {
    sub: Number(sub),
    role: role as 'admin' | 'staff',
    companyId: typeof companyId === 'number' ? companyId : null,
    scope: 'tenant',
    iat,
    exp,
    jti,
  };
}

/**
 * Verify and decode a JWT.
 * Throws on invalid signature, expired token, alg:none, or any non-HS256 algorithm.
 * Returns the decoded AuthJwtPayload.
 */
export async function verifyJwt(token: string): Promise<AuthJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
  });

  return extractClaims(payload as Record<string, unknown>);
}

/**
 * Verify a JWT's signature and required claims WITHOUT enforcing the `exp`
 * (expiry) check against the wall clock.
 *
 * This exists so session validation can perform the Requirement 10.1 zero-skew
 * expiry check against an INJECTED clock (`now`) rather than the process wall
 * clock. jose's `jwtVerify` always validates `exp` against the real `Date.now()`
 * (subject to `clockTolerance`), which makes injected-clock testing impossible
 * and couples expiry semantics to the host clock.
 *
 * We disable jose's built-in expiry check by passing `currentDate: new Date(0)`
 * (the Unix epoch): since every issued token has a positive `exp`, the built-in
 * `exp <= currentDate` comparison can never trip, leaving signature + algorithm
 * verification intact. Callers MUST perform their own `exp` check against their
 * injected `now`.
 */
export async function verifyJwtIgnoreExp(token: string): Promise<AuthJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
    currentDate: new Date(0),
  });

  return extractClaims(payload as Record<string, unknown>);
}
