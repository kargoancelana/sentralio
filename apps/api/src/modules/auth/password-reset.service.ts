import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { users, passwordResetTokens } from '../../db/schema';
import { hashPassword } from './password';
import { validatePasswordPolicy } from './password-policy';
import { env } from '../../config/env';

export type DrizzleDb = typeof defaultDb;

export function sha256hex(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreateResetTokenParams {
  userId: number;
  companyId: number;
  adminId: number;
  now: number;
}

export type CreateResetTokenResult =
  | { kind: 'not-found' }
  | { kind: 'ok'; resetUrl: string; expiresAt: Date };

export async function createResetToken(
  params: CreateResetTokenParams,
  db: DrizzleDb = defaultDb,
): Promise<CreateResetTokenResult> {
  const { userId, companyId, adminId, now } = params;

  // 1. Cari user where id=userId AND companyId=companyId
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
    .limit(1);

  if (userRows.length === 0 || !userRows[0]) {
    return { kind: 'not-found' };
  }

  // 2. Hapus token unused milik user (delete where userId AND usedAt IS NULL)
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt),
      ),
    );

  // 3. token = randomBytes(32).toString('base64url')
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256hex(token);
  const expiresAt = new Date(now + 3600_000); // 1 hour expiration

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
    createdByAdminId: adminId,
    createdAt: new Date(now),
  });

  // 4. Update users.tokensValidFrom = Math.floor(now/1000) where id=userId
  await db
    .update(users)
    .set({
      tokensValidFrom: Math.floor(now / 1000),
    })
    .where(eq(users.id, userId));

  // 5. base = env.frontendUrl || 'http://localhost:5173'
  const base = env.frontendUrl || 'http://localhost:5173';
  return {
    kind: 'ok',
    resetUrl: `${base}/reset-password?token=${token}`,
    expiresAt,
  };
}

export interface VerifyResetTokenParams {
  token: string;
  now: number;
}

export async function verifyResetToken(
  params: VerifyResetTokenParams,
  db: DrizzleDb = defaultDb,
): Promise<{ valid: boolean }> {
  const { token, now } = params;
  const tokenHash = sha256hex(token);

  const tokenRows = await db
    .select({
      id: passwordResetTokens.id,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (tokenRows.length === 0 || !tokenRows[0]) {
    return { valid: false };
  }

  const row = tokenRows[0];
  const isUnused = row.usedAt === null;
  const isNotExpired = row.expiresAt.getTime() > now;

  return { valid: isUnused && isNotExpired };
}

export interface CompleteResetParams {
  token: string;
  newPassword: string;
  now: number;
}

export type CompleteResetResult =
  | { kind: 'ok' }
  | { kind: 'invalid-token' }
  | { kind: 'validation'; message: string };

export async function completeReset(
  params: CompleteResetParams,
  db: DrizzleDb = defaultDb,
): Promise<CompleteResetResult> {
  const { token, newPassword, now } = params;
  const tokenHash = sha256hex(token);

  // 1. Cari by tokenHash
  const tokenRows = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (tokenRows.length === 0 || !tokenRows[0]) {
    return { kind: 'invalid-token' };
  }

  const row = tokenRows[0];
  const isUnused = row.usedAt === null;
  const isNotExpired = row.expiresAt.getTime() > now;

  if (!isUnused || !isNotExpired) {
    return { kind: 'invalid-token' };
  }

  // 2. validatePasswordPolicy(newPassword)
  const validation = validatePasswordPolicy(newPassword);
  if (!validation.ok) {
    return { kind: 'validation', message: validation.message || 'Validation error' };
  }

  // 3. hashPassword(newPassword)
  const passwordHash = await hashPassword(newPassword);

  // Update users.passwordHash + tokensValidFrom=Math.floor(now/1000) where id=row.userId
  await db
    .update(users)
    .set({
      passwordHash,
      tokensValidFrom: Math.floor(now / 1000),
    })
    .where(eq(users.id, row.userId));

  // 4. set usedAt=new Date(now) pada token
  await db
    .update(passwordResetTokens)
    .set({
      usedAt: new Date(now),
    })
    .where(eq(passwordResetTokens.id, row.id));

  // hapus token lain milik user
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, row.userId),
        ne(passwordResetTokens.id, row.id),
      ),
    );

  return { kind: 'ok' };
}
