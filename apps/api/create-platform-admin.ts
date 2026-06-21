import { config } from 'dotenv';
config();

import { db, pool } from './src/db/client';
import { platformAdmins } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from './src/modules/auth/password';
import { validatePasswordPolicy } from './src/modules/auth/password-policy';
import { isValidEmailSyntax, normalizeEmail } from './src/modules/auth/email';

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME ?? 'Super Admin';

  // 1. Input presence validation
  if (!email || !password) {
    console.error(
      'Usage: PLATFORM_ADMIN_EMAIL=you@example.com PLATFORM_ADMIN_PASSWORD=... ' +
      '[PLATFORM_ADMIN_NAME=...] bun run create-platform-admin.ts'
    );
    process.exit(1);
  }

  // 2. Email syntax validation
  if (!isValidEmailSyntax(email)) {
    console.error('Email tidak valid');
    process.exit(1);
  }

  // 3. Password policy validation
  const policy = validatePasswordPolicy(password);
  if (!policy.ok) {
    console.error(policy.message);
    process.exit(1);
  }

  const emailLower = normalizeEmail(email);
  const passwordHash = await hashPassword(password);

  try {
    const rows = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.emailLower, emailLower))
      .limit(1);

    const existing = rows[0];

    if (!existing) {
      // Create new platform admin
      await db.insert(platformAdmins).values({
        email,
        emailLower,
        name,
        passwordHash,
        isActive: 1,
        tokensValidFrom: 0,
      });
      console.log(`✅ Platform admin created: ${emailLower} (name="${name}")`);
    } else {
      // Update existing platform admin
      const nowSec = Math.floor(Date.now() / 1000);
      await db
        .update(platformAdmins)
        .set({
          passwordHash,
          name,
          isActive: 1,
          tokensValidFrom: nowSec,
        })
        .where(eq(platformAdmins.id, existing.id));
      console.log(
        `✅ Platform admin updated: ${emailLower} — password di-reset, sesi lama di-revoke (tokensValidFrom=${nowSec})`
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Gagal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
