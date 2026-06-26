/**
 * Register_Service — self-service pendaftaran company baru (Fase 4.2a).
 *
 * Alur (blueprint 6.1 langkah 1): register HANYA bikin
 *   - 1 company status 'pending'
 *   - 1 admin user (is_active = 1) milik company itu
 * Pilih plan + submit order + upload bukti DILAKUKAN TERPISAH setelah login
 * (lihat subscription-order.service.ts). TIDAK ada order/subscription di sini.
 *
 * Boot-safety: tidak ada top-level side-effect; DB client injectable untuk test.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { companies, users } from '../../db/schema';
import type { DrizzleDb } from './lockout';
import { isValidEmailSyntax, normalizeEmail } from './email';
import { isValidUsernameSyntax, normalizeUsername } from './username';
import { validatePasswordPolicy } from './password-policy';
import { hashPassword } from './password';

export interface RegisterInput {
  companyName: unknown;
  name: unknown; // nama lengkap admin
  email: unknown;
  username?: unknown; // opsional
  password: unknown;
  now: Date;
  db?: DrizzleDb;
}

export type RegisterResult =
  | { kind: 'ok'; companyId: number; userId: number; slug: string }
  | { kind: 'fail-validation'; field: string; message: string }
  | { kind: 'fail-email-taken' }
  | { kind: 'fail-username-taken' }
  | { kind: 'fail-500' };

/** slugify sederhana: lowercase ASCII, non-alnum -> '-', trim. */
function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // buang diacritic
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Cari slug unik: base, base-2, base-3, ... (cek tabel companies). */
async function uniqueSlug(base: string, db: DrizzleDb): Promise<string> {
  const root = base || 'company';
  let candidate = root;
  let n = 1;
  // uniqueIndex uniq_companies_slug tetap jadi pengaman akhir di DB.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function registerCompany(input: RegisterInput): Promise<RegisterResult> {
  const db = input.db ?? defaultDb;

  // 1. Validasi field wajib.
  if (typeof input.companyName !== 'string' || input.companyName.trim().length === 0) {
    return { kind: 'fail-validation', field: 'companyName', message: 'Nama perusahaan wajib diisi.' };
  }
  if (input.companyName.trim().length > 100) {
    return { kind: 'fail-validation', field: 'companyName', message: 'Nama perusahaan maksimal 100 karakter.' };
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return { kind: 'fail-validation', field: 'name', message: 'Nama wajib diisi.' };
  }
  if (input.name.trim().length > 100) {
    return { kind: 'fail-validation', field: 'name', message: 'Nama maksimal 100 karakter.' };
  }
  if (typeof input.email !== 'string' || !isValidEmailSyntax(input.email)) {
    return { kind: 'fail-validation', field: 'email', message: 'Format email tidak valid.' };
  }

  // username opsional; kalau diisi harus valid.
  let usernameValue: string | null = null;
  let usernameLowerValue: string | null = null;
  if (input.username !== undefined && input.username !== null && input.username !== '') {
    if (typeof input.username !== 'string' || !isValidUsernameSyntax(input.username)) {
      return {
        kind: 'fail-validation',
        field: 'username',
        message: 'Username 3–32 karakter, hanya huruf, angka, titik, dan garis bawah.',
      };
    }
    usernameValue = input.username.trim();
    usernameLowerValue = normalizeUsername(input.username);
  }

  const pw = validatePasswordPolicy(input.password);
  if (!pw.ok) {
    return { kind: 'fail-validation', field: 'password', message: pw.message! };
  }

  const emailLower = normalizeEmail(input.email);

  try {
    // 2. Email unik (global).
    const emailExisting = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailLower, emailLower))
      .limit(1);
    if (emailExisting.length > 0) {
      return { kind: 'fail-email-taken' };
    }

    // 3. Username unik (global) kalau diisi.
    if (usernameLowerValue) {
      const usernameExisting = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.usernameLower, usernameLowerValue))
        .limit(1);
      if (usernameExisting.length > 0) {
        return { kind: 'fail-username-taken' };
      }
    }

    // 4. Slug unik dari nama perusahaan.
    const slug = await uniqueSlug(slugify(input.companyName), db);

    // 5. Hash password.
    const passwordHash = await hashPassword(input.password as string);

    // 6. Insert company (pending) lalu admin user.
    //    NOTE drizzle/mysql2: hasil insert = [ResultSetHeader], ambil insertId.
    const [companyInsert] = await db
      .insert(companies)
      .values({ name: input.companyName.trim(), slug, status: 'pending' });
    const companyId = (companyInsert as { insertId: number }).insertId;

    const [userInsert] = await db.insert(users).values({
      companyId,
      email: (input.email as string).trim(),
      emailLower,
      username: usernameValue,
      usernameLower: usernameLowerValue,
      name: (input.name as string).trim(),
      role: 'admin',
      passwordHash,
      isActive: 1,
    });
    const userId = (userInsert as { insertId: number }).insertId;

    return { kind: 'ok', companyId, userId, slug };
  } catch {
    // Termasuk race pada uniqueIndex (email/username/slug). Pre-check di atas
    // sudah nutup kasus umum; sisanya aman dipetakan ke 500.
    return { kind: 'fail-500' };
  }
}
