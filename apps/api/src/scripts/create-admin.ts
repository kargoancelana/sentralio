/**
 * Create Admin CLI Script
 *
 * Creates a new user (default role: admin) directly in the database. Intended
 * for bootstrapping the FIRST admin on a fresh install, where there is no
 * existing user yet and the web UI's admin-only user management is therefore
 * unreachable. Can also create additional admin/staff users from the CLI.
 *
 * The password is validated against the shared password policy (min 8 chars,
 * at least one uppercase letter, at least one special character, max 128) and
 * stored as a bcrypt hash (cost 12) in `users.password_hash`.
 *
 * Usage:
 *   bun run apps/api/src/scripts/create-admin.ts --email admin@example.com --name "Admin" --password 'YourStrongPass1!'
 *   bun run apps/api/src/scripts/create-admin.ts --email staff@example.com --name "Staff" --password 'YourStrongPass1!' --role staff
 *
 * Exit codes:
 *   0  — success; prints only the created user's stored email
 *   2  — missing or empty --email / --name / --password argument
 *   3  — invalid email syntax, invalid name length, invalid role, or password fails policy
 *   4  — a user with the same (case-insensitive) email already exists
 *   1  — unexpected runtime error
 *
 * Security:
 *   - Never logs the plaintext password or the produced hash.
 *   - Only one line is written to stdout on success: the stored email.
 */

// Load environment variables first — using dotenv directly to avoid pulling in
// the full env.ts which performs AUTH_JWT_SECRET / AUTH_ALLOWED_ORIGINS and
// Shopee-key fail-fast validation that bootstrapping the first admin does not
// need. This mirrors reset-password.ts so the script works on a fresh install
// before the Shopee/auth secrets are configured.
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(import.meta.dir, "../../../..", ".env") });
config(); // fallback: local .env

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { users } from "../db/schema";
import { isValidEmailSyntax, normalizeEmail } from "../modules/auth/email";
import { hashPassword } from "../modules/auth/password";
import { validatePasswordPolicy } from "../modules/auth/password-policy";

// ─── Argument Parsing ─────────────────────────────────

function getArg(name: string): string | undefined {
  const flag = `--${name}`;
  const args = process.argv;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    // Also support --name=value form
    if (args[i].startsWith(`${flag}=`)) {
      return args[i].slice(flag.length + 1);
    }
  }
  return undefined;
}

const emailArg = getArg("email");
const nameArg = getArg("name");
const passwordArg = getArg("password");
const roleArg = getArg("role") ?? "admin";

const USAGE =
  "Usage: bun run create-admin.ts --email <email> --name <name> --password <password> [--role admin|staff]\n";

// Exit 2: missing or empty arguments
if (!emailArg || emailArg.trim() === "") {
  process.stderr.write(USAGE + "Error: --email is required and must not be empty.\n");
  process.exit(2);
}

if (!nameArg || nameArg.trim() === "") {
  process.stderr.write(USAGE + "Error: --name is required and must not be empty.\n");
  process.exit(2);
}

if (!passwordArg || passwordArg === "") {
  process.stderr.write(USAGE + "Error: --password is required and must not be empty.\n");
  process.exit(2);
}

// Exit 3: email syntax / length
if (!isValidEmailSyntax(emailArg) || emailArg.length > 254) {
  process.stderr.write(
    `Error: '${emailArg}' is not a valid email (max 254 chars, exactly one @, domain must contain a dot).\n`
  );
  process.exit(3);
}

// Exit 3: name length (1–100 after trim)
const trimmedName = nameArg.trim();
if (trimmedName.length < 1 || trimmedName.length > 100) {
  process.stderr.write(
    `Error: name must be between 1 and 100 characters after trimming (got ${trimmedName.length}).\n`
  );
  process.exit(3);
}

// Exit 3: role must be admin or staff
if (roleArg !== "admin" && roleArg !== "staff") {
  process.stderr.write(`Error: --role must be 'admin' or 'staff' (got '${roleArg}').\n`);
  process.exit(3);
}

// Exit 3: password policy (min 8, uppercase, special char, max 128)
const policy = validatePasswordPolicy(passwordArg);
if (!policy.ok) {
  process.stderr.write(`Error: ${policy.message}\n`);
  process.exit(3);
}

// ─── Main ────────────────────────────────────────

async function main() {
  const emailLower = normalizeEmail(emailArg!);

  // Build a minimal DB pool without importing env.ts (which has auth + Shopee
  // fail-fast validation we don't need just to create a user).
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 2,
    timezone: "+07:00",
  });

  const db = drizzle(pool, { schema, mode: "default" });

  try {
    // Exit 4: case-insensitive email uniqueness
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailLower, emailLower))
      .limit(1);

    if (existing.length > 0) {
      process.stderr.write(`Error: a user with email '${emailArg}' already exists.\n`);
      process.exit(4);
    }

    // Hash with bcrypt cost 12 — never log password or hash
    const passwordHash = await hashPassword(passwordArg!);

    await db.insert(users).values({
      email: emailArg!,        // stored verbatim
      emailLower,              // normalized for lookups
      name: trimmedName,       // trimmed
      role: roleArg as "admin" | "staff",
      passwordHash,            // only the hash, never the plaintext
      isActive: 1,             // active on creation
    });

    // Print only the stored email, then exit 0
    process.stdout.write(emailArg! + "\n");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: unexpected failure — ${message}\n`);
  process.exit(1);
});
