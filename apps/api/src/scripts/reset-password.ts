/**
 * Reset Password CLI Script
 *
 * Resets the password for a single WMS user identified by email.
 * The new password is bcrypt-hashed (cost 12) and stored in `users.password_hash`.
 *
 * Usage:
 *   bun run apps/api/src/scripts/reset-password.ts --email user@example.com --password 'new-password-123'
 *
 * Exit codes:
 *   0  — success; prints only the matched user's stored email
 *   2  — missing or empty --email / --password argument
 *   3  — password length outside the allowed range [10, 128]
 *   4  — email matched 0 or >1 users (ambiguous or not found)
 *   1  — unexpected runtime error
 *
 * Security:
 *   - Never logs the plaintext password or the produced hash.
 *   - Only one line is written to stdout on success: the stored email.
 */

// Load environment variables first — using dotenv directly to avoid pulling in
// the full env.ts which performs AUTH_JWT_SECRET / AUTH_ALLOWED_ORIGINS
// fail-fast validation that this script does not need (Req 7.1, design note).
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(import.meta.dir, "../../../..", ".env") });
config(); // fallback: local .env

import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { users } from "../db/schema";

// ─── Argument Parsing ──────────────────────────────────────────

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
const passwordArg = getArg("password");

// Exit 2: missing or empty arguments
if (!emailArg || emailArg.trim() === "") {
  process.stderr.write(
    "Usage: bun run reset-password.ts --email <email> --password <password>\n" +
      "Error: --email is required and must not be empty.\n"
  );
  process.exit(2);
}

if (!passwordArg || passwordArg === "") {
  process.stderr.write(
    "Usage: bun run reset-password.ts --email <email> --password <password>\n" +
      "Error: --password is required and must not be empty.\n"
  );
  process.exit(2);
}

// Exit 3: password length outside [10, 128]
if (passwordArg.length < 10 || passwordArg.length > 128) {
  process.stderr.write(
    `Error: password must be between 10 and 128 characters (got ${passwordArg.length}).\n`
  );
  process.exit(3);
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  // Normalize email for lookup (trim + ASCII lowercase)
  const emailNormalized = emailArg!.trim().toLowerCase();

  // Build a minimal DB pool without importing env.ts (which has auth validation)
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
    // Look up users where email_lower = normalized email (Req 7.3)
    const matched = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.emailLower, emailNormalized));

    // Exit 4: 0 or >1 matches (Req 7.5)
    if (matched.length === 0) {
      process.stderr.write(
        `Error: no user found with email matching '${emailArg}'.\n`
      );
      process.exit(4);
    }

    if (matched.length > 1) {
      process.stderr.write(
        `Error: ${matched.length} users found with email matching '${emailArg}'. ` +
          "Cannot update ambiguous match.\n"
      );
      process.exit(4);
    }

    const user = matched[0];

    // Hash the password with cost factor 12 (Req 7.2, 7.6) — never log password or hash
    const hash = await bcrypt.hash(passwordArg!, 12);

    // Update password_hash for the matched user (Req 7.1)
    await db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, user.id));

    // Print only the matched user's stored email, then exit 0 (Req 7.6, 7.7)
    process.stdout.write(user.email + "\n");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: unexpected failure — ${message}\n`);
  process.exit(1);
});
