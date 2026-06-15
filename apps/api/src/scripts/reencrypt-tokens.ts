// Re-encrypt Shopee tokens: CBC (legacy) → GCM (new format).
// Jalankan: bun run apps/api/src/scripts/reencrypt-tokens.ts
//
// PERINGATAN: BACKUP tabel shopee_credentials sebelum menjalankan script ini.
//   mysqldump -u <user> -p <db> shopee_credentials > shopee_credentials_backup.sql

import { db } from "../db/client";
import { shopeeCredentials } from "../db/schema";
import { encrypt, decrypt } from "../utils/crypto";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db.select().from(shopeeCredentials);
  let migrated = 0;
  for (const r of rows) {
    try {
      for (const field of ["accessToken", "refreshToken"] as const) {
        const val = (r as any)[field] as string;
        if (!val) continue;
        if (val.split(":").length === 3) continue; // sudah GCM — lewati
        const plain = decrypt(val);   // baca via CBC legacy
        const reEnc = encrypt(plain); // tulis ulang via GCM
        await db.update(shopeeCredentials)
          .set({ [field]: reEnc } as any)
          .where(eq(shopeeCredentials.id, r.id));
        migrated++;
      }
    } catch (e: any) {
      console.error(`Gagal migrasi shop_id=${(r as any).shopId}: ${e.message}`);
    }
  }
  console.log(`Selesai. Field termigrasi: ${migrated}`);
  process.exit(0);
}

main();
