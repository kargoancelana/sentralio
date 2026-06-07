/**
 * CLI: reactivate-user
 *
 * Operator recovery tool to set a user's is_active back to 1 (active) when an
 * account has been locked out — e.g. an admin accidentally deactivated their
 * own account through the UI and can no longer log in.
 *
 * Usage:
 *   bun run src/scripts/reactivate-user.ts --email user@example.com
 *
 * Exit codes:
 *   0  success (account reactivated, or already active)
 *   2  missing/empty --email argument
 *   4  email matches 0 or >1 users
 *
 * Never prints or logs passwords/hashes.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { normalizeEmail } from "../modules/auth/email";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const emailArg = parseArg("--email");

  if (!emailArg || emailArg.trim() === "") {
    console.error("Usage: bun run src/scripts/reactivate-user.ts --email <email>");
    process.exit(2);
  }

  const emailLower = normalizeEmail(emailArg);

  const matches = await db
    .select({ id: users.id, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.emailLower, emailLower));

  if (matches.length !== 1) {
    console.error(
      `Error: expected exactly 1 user for email '${emailArg}', found ${matches.length}.`,
    );
    process.exit(4);
  }

  const user = matches[0];

  if (user.isActive === 1) {
    console.log(`${user.email} is already active.`);
    process.exit(0);
  }

  await db.update(users).set({ isActive: 1 }).where(eq(users.id, user.id));
  console.log(`Reactivated: ${user.email}`);
  process.exit(0);
}

main();
