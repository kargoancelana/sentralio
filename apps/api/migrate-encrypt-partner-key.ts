/**
 * Migration Script: Encrypt Partner Key
 * 
 * This script encrypts all existing plaintext partner_key values in the database.
 * Run this ONCE after deploying the code changes.
 * 
 * Usage:
 *   bun run migrate-encrypt-partner-key.ts
 */

import { db, pool } from "./src/db/client";
import { shopeeCredentials } from "./src/db/schema";
import { encrypt, decrypt } from "./src/utils/crypto";
import { eq } from "drizzle-orm";

async function migrateEncryptPartnerKey() {
  console.log("[migrate] Starting partner_key encryption migration...");

  try {
    // Get all credentials
    const allCreds = await db.select().from(shopeeCredentials);
    
    if (allCreds.length === 0) {
      console.log("[migrate] No credentials found in database.");
      return;
    }

    console.log(`[migrate] Found ${allCreds.length} credential(s) to migrate.`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const cred of allCreds) {
      try {
        // Check if partner_key is already encrypted (contains ":")
        if (cred.partnerKey.includes(":")) {
          console.log(`[migrate] Shop ${cred.shopId}: partner_key already encrypted, skipping.`);
          skipped++;
          continue;
        }

        // Encrypt the plaintext partner_key
        const encryptedPartnerKey = encrypt(cred.partnerKey);

        // Update database
        await db.update(shopeeCredentials)
          .set({
            partnerKey: encryptedPartnerKey,
            updatedAt: new Date()
          })
          .where(eq(shopeeCredentials.id, cred.id));

        console.log(`[migrate] Shop ${cred.shopId}: partner_key encrypted successfully.`);
        migrated++;

        // Verify encryption/decryption works
        const decrypted = decrypt(encryptedPartnerKey);
        if (decrypted !== cred.partnerKey) {
          throw new Error("Encryption verification failed!");
        }
      } catch (err: any) {
        console.error(`[migrate] Shop ${cred.shopId}: ERROR - ${err.message}`);
        errors++;
      }
    }

    console.log("\n[migrate] Migration complete!");
    console.log(`  - Migrated: ${migrated}`);
    console.log(`  - Skipped (already encrypted): ${skipped}`);
    console.log(`  - Errors: ${errors}`);

    if (errors > 0) {
      console.error("\n[migrate] ⚠️ Some credentials failed to migrate. Please check the errors above.");
      process.exit(1);
    } else {
      console.log("\n[migrate] ✅ All credentials migrated successfully!");
    }
  } catch (error: any) {
    console.error("[migrate] FATAL ERROR:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateEncryptPartnerKey();
