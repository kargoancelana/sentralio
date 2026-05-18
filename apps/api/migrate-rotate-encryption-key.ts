/**
 * Key Rotation Migration Script
 * 
 * Re-encrypts all sensitive data with the new encryption key.
 * 
 * PREREQUISITES:
 * 1. Generate new key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * 2. Set TOKEN_SECRET_KEY to new key in .env
 * 3. Set TOKEN_SECRET_KEY_V1 to old key in .env (for decryption)
 * 4. Backup database!
 * 
 * Usage:
 *   bun run migrate-rotate-encryption-key.ts
 */

import { db, pool } from "./src/db/client";
import { shopeeCredentials } from "./src/db/schema";
import { eq } from "drizzle-orm";

// Import rotation-aware crypto functions
import { decrypt, encrypt, isLatestVersion, getKeyInfo } from "./src/utils/crypto-rotation";

async function rotateEncryptionKey() {
  console.log("[rotate] Starting encryption key rotation...");
  console.log("[rotate] Key info:", getKeyInfo());

  try {
    // Get all credentials
    const allCreds = await db.select().from(shopeeCredentials);
    
    if (allCreds.length === 0) {
      console.log("[rotate] No credentials found in database.");
      return;
    }

    console.log(`[rotate] Found ${allCreds.length} credential(s) to check.`);

    let reencrypted = 0;
    let skipped = 0;
    let errors = 0;

    for (const cred of allCreds) {
      try {
        let needsUpdate = false;
        let newAccessToken = cred.accessToken;
        let newRefreshToken = cred.refreshToken;
        let newPartnerKey = cred.partnerKey;

        // Check and re-encrypt accessToken
        if (!isLatestVersion(cred.accessToken)) {
          console.log(`[rotate] Shop ${cred.shopId}: Re-encrypting accessToken...`);
          const plaintext = decrypt(cred.accessToken);
          newAccessToken = encrypt(plaintext);
          needsUpdate = true;
        }

        // Check and re-encrypt refreshToken
        if (!isLatestVersion(cred.refreshToken)) {
          console.log(`[rotate] Shop ${cred.shopId}: Re-encrypting refreshToken...`);
          const plaintext = decrypt(cred.refreshToken);
          newRefreshToken = encrypt(plaintext);
          needsUpdate = true;
        }

        // Check and re-encrypt partnerKey
        if (!isLatestVersion(cred.partnerKey)) {
          console.log(`[rotate] Shop ${cred.shopId}: Re-encrypting partnerKey...`);
          const plaintext = decrypt(cred.partnerKey);
          newPartnerKey = encrypt(plaintext);
          needsUpdate = true;
        }

        if (needsUpdate) {
          // Update database with re-encrypted values
          await db.update(shopeeCredentials)
            .set({
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
              partnerKey: newPartnerKey,
              updatedAt: new Date()
            })
            .where(eq(shopeeCredentials.id, cred.id));

          console.log(`[rotate] Shop ${cred.shopId}: ✅ Re-encrypted successfully.`);
          reencrypted++;

          // Verify re-encryption works
          decrypt(newAccessToken);
          decrypt(newRefreshToken);
          decrypt(newPartnerKey);
        } else {
          console.log(`[rotate] Shop ${cred.shopId}: Already using latest key, skipping.`);
          skipped++;
        }
      } catch (err: any) {
        console.error(`[rotate] Shop ${cred.shopId}: ERROR - ${err.message}`);
        errors++;
      }
    }

    console.log("\n[rotate] Key rotation complete!");
    console.log(`  - Re-encrypted: ${reencrypted}`);
    console.log(`  - Skipped (already latest): ${skipped}`);
    console.log(`  - Errors: ${errors}`);

    if (errors > 0) {
      console.error("\n[rotate] ⚠️ Some credentials failed to rotate. Please check the errors above.");
      process.exit(1);
    } else {
      console.log("\n[rotate] ✅ All credentials rotated successfully!");
      console.log("\n[rotate] NEXT STEPS:");
      console.log("  1. Test application to ensure everything works");
      console.log("  2. After confirming, you can remove TOKEN_SECRET_KEY_V1 from .env");
      console.log("  3. Keep database backup for at least 30 days");
    }
  } catch (error: any) {
    console.error("[rotate] FATAL ERROR:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

rotateEncryptionKey();
