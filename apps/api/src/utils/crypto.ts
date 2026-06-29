import crypto from "crypto";
import { env } from "../config/env";

const GCM_ALGORITHM = "aes-256-gcm";
const LEGACY_CBC_ALGORITHM = "aes-256-cbc";

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

// Encrypt with AES-256-GCM. Output format: iv:authTag:ciphertext (hex).
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12); // 96-bit nonce, standar untuk GCM
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// Decrypt. Supports new GCM (3 parts) and legacy CBC (2 parts) formats.
export function decrypt(text: string): string {
  // Guard against empty/null token before checking format
  if (!text || text.trim() === "") {
    throw new Error("Cannot decrypt empty token. Token may have been cleared during disconnect.");
  }

  if (!text.includes(":")) {
    throw new Error("Invalid encrypted format. Expected iv:authTag:ciphertext or legacy iv:ciphertext");
  }

  const parts = text.split(":");

  // New format: aes-256-gcm -> iv:authTag:ciphertext
  if (parts.length === 3) {
    const ivHex      = parts[0] as string;
    const authTagHex = parts[1] as string;
    const encrypted  = parts[2] as string;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(GCM_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8"); // throw kalau authTag tidak cocok (tampered)
    return decrypted;
  }

  // Legacy format: aes-256-cbc -> iv:ciphertext (backward-compat token lama)
  if (parts.length === 2) {
    const ivHex     = parts[0] as string;
    const encrypted = parts[1] as string;
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(LEGACY_CBC_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  throw new Error("Invalid encrypted format. Unexpected number of segments.");
}
