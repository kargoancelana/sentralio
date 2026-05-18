import crypto from "crypto";
import { env } from "../config/env";

const algorithm = "aes-256-cbc";

// Validate and convert TOKEN_SECRET_KEY
// Key should be 64 hex characters (representing 32 bytes)
let key: Buffer;
try {
  // Try to parse as hex string first (recommended format)
  if (env.tokenSecretKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(env.tokenSecretKey)) {
    key = Buffer.from(env.tokenSecretKey, "hex");
  } else {
    // Fallback: treat as UTF-8 string (legacy support)
    key = Buffer.from(env.tokenSecretKey, "utf-8");
  }
  
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_SECRET_KEY must be exactly 32 bytes (256 bits). Current length: ${key.length} bytes.\n` +
      `Generate a secure key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n` +
      `Then set TOKEN_SECRET_KEY to the generated 64-character hex string.`
    );
  }
} catch (err: any) {
  throw new Error(`Invalid TOKEN_SECRET_KEY: ${err.message}`);
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  // Definisikan parameter sesuai standar bawaan
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(text: string): string {
  // Jika format string mentah (legacy) yang digunakan, 
  // gracefully fall back or throw error
  if (!text.includes(":")) {
    throw new Error("Invalid encrypted format. Expected iv:encrypted_hex");
  }

  const [ivHex, encrypted] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
