/**
 * Users service — admin-managed account creation and management.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2
 *
 * password and password_hash are NEVER returned from any function here.
 */

import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { users } from '../../db/schema';
import { isValidEmailSyntax, normalizeEmail } from '../auth/email';
import { isValidUsernameSyntax, normalizeUsername } from '../auth/username';
import { hashPassword } from '../auth/password';
import { validatePasswordPolicy } from '../auth/password-policy';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/** Public user shape — never includes password or password_hash. */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'staff';
}

/** Full user shape for listing — includes isActive, never includes password. */
export interface UserListItem {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  isActive: boolean;
}

export interface CreateUserData {
  email: string;
  name: string;
  role: string;
  password: string;
  /** Optional login handle. When provided: validated + must be globally unique. */
  username?: string | null;
  /**
   * Owning company for the new user. The /users route always passes the
   * authenticated admin's companyId so the new user lands in the SAME company
   * as the admin who created them. Defaults to 1 (default company) when omitted
   * so existing single-tenant callers/tests keep working.
   */
  companyId?: number;
}

export interface UpdateUserData {
  name?: string;
  role?: string;
  isActive?: boolean;
}

export interface CreateUserOk {
  ok: true;
  user: PublicUser;
}

export interface CreateUserFail {
  ok: false;
  errors: Record<string, string>;
}

export type CreateUserResult = CreateUserOk | CreateUserFail;

/** Injectable DB client type for testability. */
export type DrizzleDb = typeof defaultDb;

// ───────────────────────────────────────────────────────────────────────────
// listUsers
// ───────────────────────────────────────────────────────────────────────────

/**
 * List all users. Never includes password or password_hash.
 * Requirement: 6.1
 */
export async function listUsers(companyId: number, db: DrizzleDb = defaultDb): Promise<UserListItem[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.companyId, companyId));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'staff',
    isActive: row.isActive === 1,
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// createUser
// ───────────────────────────────────────────────────────────────────────────

/**
 * Validate and create a new user.
 *
 * Validation order (Req 6.4):
 *  1. email: RFC-syntax valid, <= 254 chars, case-insensitive unique
 *  2. name: trimmed length 1–100
 *  3. role: exactly 'admin' or 'staff'
 *  4. password: length 10–128
 *
 * On success: bcrypt hash (cost >= 12), insert, return { ok: true, user: { id, email, name, role } }.
 * On failure: return { ok: false, errors: { field: reason } }.
 *
 * password and password_hash are NEVER returned (Req 6.7, 7.2).
 * Requirements: 6.4, 6.5, 6.6, 6.7, 7.1
 */
export async function createUser(
  data: CreateUserData,
  db: DrizzleDb = defaultDb,
): Promise<CreateUserResult> {
  const errors: Record<string, string> = {};

  // 1. Validate email
  if (typeof data.email !== 'string' || !isValidEmailSyntax(data.email)) {
    errors.email = 'Format email tidak valid.';
  } else if (data.email.length > 254) {
    errors.email = 'Email maksimal 254 karakter.';
  }

  // 2. Validate name
  const trimmedName = typeof data.name === 'string' ? data.name.trim() : '';
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    errors.name = 'Nama harus 1–100 karakter.';
  }

  // 3. Validate role
  if (data.role !== 'admin' && data.role !== 'staff') {
    errors.role = 'Peran harus admin atau staff.';
  }

  // 4. Validate password against the policy (min 8, uppercase, special char)
  const pw = validatePasswordPolicy(data.password);
  if (!pw.ok) {
    errors.password = pw.message!;
  }

  // 5. Validate username syntax when provided (optional field).
  //    Empty string / null / undefined -> treated as "no username" (allowed).
  const hasUsername =
    typeof data.username === 'string' && data.username.trim().length > 0;
  if (hasUsername && !isValidUsernameSyntax(data.username as string)) {
    errors.username =
      'Username harus 3-32 karakter dan hanya boleh huruf, angka, titik, atau garis bawah.';
  }

  // If any validation failed so far, return early (Req 6.5)
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // Check for case-insensitive email uniqueness (Req 6.4)
  const emailLower = normalizeEmail(data.email);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailLower, emailLower))
    .limit(1);

  if (existing.length > 0) {
    return { ok: false, errors: { email: 'Email sudah digunakan.' } };
  }

  // Check case-insensitive username uniqueness when provided (global, Fase 1.4).
  const usernameLower = hasUsername
    ? normalizeUsername(data.username as string)
    : null;

  if (usernameLower) {
    const existingUsername = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.usernameLower, usernameLower))
      .limit(1);

    if (existingUsername.length > 0) {
      return { ok: false, errors: { username: 'Username sudah digunakan.' } };
    }
  }

  // Hash password with bcrypt cost >= 12 (Req 6.6, 7.1)
  const passwordHash = await hashPassword(data.password);

  // Insert user with is_active = 1 (Req 6.7)
  const result = await db.insert(users).values({
    companyId: data.companyId ?? 1, // owning company from caller's token (defaults to 1)
    email: data.email,          // stored verbatim
    emailLower,                 // normalized for lookups
    username: hasUsername ? (data.username as string) : null, // verbatim handle or null
    usernameLower,              // normalized handle for lookups, or null
    name: trimmedName,          // trimmed
    role: data.role as 'admin' | 'staff',
    passwordHash,               // only the hash, never the plaintext
    isActive: 1,                // always active on creation (Req 6.7)
  });

  const insertId = Number((result as any)[0]?.insertId ?? (result as any).insertId);

  // Return only id, email, name, role (Req 6.7) — never password or password_hash
  return {
    ok: true,
    user: {
      id: insertId,
      email: data.email,
      name: trimmedName,
      role: data.role as 'admin' | 'staff',
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// updateUser
// ───────────────────────────────────────────────────────────────────────────

/**
 * Update a user's name, role, and/or isActive status.
 * Cannot update password through this path (use CLI, Req 7.3).
 * Returns the updated user or null if not found.
 * Never returns password or password_hash.
 */
export async function updateUser(
  id: number,
  companyId: number,
  data: UpdateUserData,
  db: DrizzleDb = defaultDb,
): Promise<UserListItem | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      throw new Error('Name must be between 1 and 100 characters after trimming');
    }
    updateData.name = trimmedName;
  }

  if (data.role !== undefined) {
    if (data.role !== 'admin' && data.role !== 'staff') {
      throw new Error('Role must be admin or staff');
    }
    updateData.role = data.role;
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive ? 1 : 0;
  }

  if (Object.keys(updateData).length === 0) {
    // Nothing to update — just return the current user
    return getUserById(id, companyId, db);
  }

  await db.update(users).set(updateData).where(and(eq(users.id, id), eq(users.companyId, companyId)));

  return getUserById(id, companyId, db);
}

// ───────────────────────────────────────────────────────────────────────────
// setUserActive
// ───────────────────────────────────────────────────────────────────────────

/**
 * Set a user's is_active status.
 * When set to false, all future Auth_Middleware checks for that user will reject
 * existing sessions (Req 6.8, 10.6).
 * Returns the updated user or null if not found.
 */
export async function setUserActive(
  id: number,
  companyId: number,
  isActive: boolean,
  db: DrizzleDb = defaultDb,
): Promise<UserListItem | null> {
  await db
    .update(users)
    .set({ isActive: isActive ? 1 : 0 })
    .where(and(eq(users.id, id), eq(users.companyId, companyId)));

  return getUserById(id, companyId, db);
}

// ───────────────────────────────────────────────────────────────────────────
// Guards for self-lockout and last-admin protection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Count how many users are currently active admins.
 * Used to prevent deactivating or demoting the last remaining admin.
 */
export async function countActiveAdmins(companyId: number, db: DrizzleDb = defaultDb): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, 1), eq(users.companyId, companyId)));
  return rows.length;
}

/**
 * Returns the public user (id, email, name, role, isActive) for the given id,
 * or null if not found. Exposed for route-level guard checks.
 */
export async function getUserPublicById(
  id: number,
  companyId: number,
  db: DrizzleDb = defaultDb,
): Promise<UserListItem | null> {
  return getUserById(id, companyId, db);
}

/**
 * Permanently delete a user by id. Related revoked_sessions rows are removed
 * automatically via ON DELETE CASCADE. Returns the deleted user's public
 * fields, or null if the user did not exist.
 *
 * Caller is responsible for guard checks (cannot delete self / last admin).
 */
export async function deleteUser(
  id: number,
  companyId: number,
  db: DrizzleDb = defaultDb,
): Promise<UserListItem | null> {
  const existing = await getUserById(id, companyId, db);
  if (!existing) return null;

  await db.delete(users).where(and(eq(users.id, id), eq(users.companyId, companyId)));
  return existing;
}

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Look up a user by id and return the public fields.
 * Returns null when the user does not exist.
 * Never returns password or password_hash.
 */
async function getUserById(
  id: number,
  companyId: number,
  db: DrizzleDb = defaultDb,
): Promise<UserListItem | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.companyId, companyId)))
    .limit(1);

  if (rows.length === 0 || !rows[0]) return null;

  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'staff',
    isActive: row.isActive === 1,
  };
}
