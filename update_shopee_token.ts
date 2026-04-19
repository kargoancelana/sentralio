import { db, pool } from "./src/db/client";
import { shopeeCredentials } from "./src/db/schema";
import { encrypt } from "./src/utils/crypto";

async function updateTokens() {
  const newAccessToken = process.argv[2];
  const newRefreshToken = process.argv[3];

  if (!newAccessToken || !newRefreshToken) {
    console.error("❌ ERROR: Argumen token hilang.");
    console.error('👉 Cara pakai: bun run update_shopee_token.ts "ACCESS_TOKEN_BARU" "REFRESH_TOKEN_BARU"');
    process.exit(1);
  }

  try {
    // Memberikan umur 4 jam untuk access token baru sebelum kadaluarsa
    const newExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); 

    await db.update(shopeeCredentials).set({
      accessToken: encrypt(newAccessToken),
      refreshToken: encrypt(newRefreshToken),
      expiresAt: newExpiresAt,
      updatedAt: new Date()
    });

    console.log("✅ SUKSES: Token berhasil dienkripsi dan diupdate ke dalam database.");
    console.log(`⏳ Akses token valid sampai: ${newExpiresAt.toISOString()}`);
  } catch (error) {
    console.error("❌ GAGAL melakukan update DB:", error);
  } finally {
    pool.end();
  }
}

updateTokens();
