/**
 * Crypto with Key Rotation Support
 * 
 * Supports multiple encryption keys for seamless key rotation.
 * - Encrypts with the latest key (highest version)
 * - Decrypts with any registered key (backward compatible)
 */

import crypto from "crypto";
import { env } from "../config/env";

const algorithm = "aes-256-cbc";

/**
 * Encryption key configuration
 * Add new keys here when rotating
 */
interface EncryptionKey {
  version: number;
  key: Buffer;
  createdAt: string; // ISO date string for tracking
}

/**
 * Load encryption keys from environment
 * Supports multiple keys for rotation
 */
function loadEncryptionKeys(): EncryptionKey[] {
  const keys: EncryptionKey[] = [];

  // Current key (always required)
  const currentKey = env.tokenSecretKey;
  if (currentKey) {
    const keyBuffer = currentKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(currentKey)
      ? Buffer.from(currentKey, "hex")
      : Buffer.from(currentKey, "utf-8");

    if (keyBuffer.length !== 32) {
      throw new Error(
        `TOKEN_SECRET_KEY must be exactly 32 bytes. Current: ${keyBuffer.length} bytes.\n` +
        `Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }

    keys.push({
      version: 2, // Current version
      key: keyBuffer,
      createdAt: new Date().toISOString(),
    });
  }

  // Old key (for decryption only, optional)
  const oldKey = process.env.TOKEN_SECRET_KEY_V1;
  if (oldKey) {
    const keyBuffer = oldKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(oldKey)
      ? Buffer.from(oldKey, "hex")
      : Buffer.from(oldKey, "utf-8");

    if (keyBuffer.length === 32) {
      keys.push({
        version: 1, // Old version
        key: keyBuffer,
        createdAt: "2024-01-01T00:00:00Z", // Placeholder
      });
    }
  }

  if (keys.length === 0) {
    throw new Error("No encryption keys configured");
  }

  // Sort by version descending (latest first)
  keys.sort((a, b) => b.version - a.version);

  return keys;
}

// Load keys at startup
const ENCRYPTION_KEYS = loadEncryptionKeys();

/**
 * Get the latest encryption key (for encryption)
 */
function getLatestKey(): EncryptionKey {
  return ENCRYPTION_KEYS[0];
}

/**
 * Get encryption key by version (for decryption)
 */
function getKeyByVersion(version: number): EncryptionKey | undefined {
  return ENCRYPTION_KEYS.find(k => k.version === version);
}

/**
 * Encrypt text with the latest key
 * Format: v{version}:{iv_hex}:{encrypted_hex}
 */
export function encrypt(text: string): string {
  const latestKey = getLatestKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, latestKey.key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Include version in encrypted string for rotation support
  return `v${latestKey.version}:${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt text with appropriate key based on version
 * Supports both new format (v2:iv:data) and legacy format (iv:data)
 */
export function decrypt(text: string): string {
  // Parse encrypted string
  const parts = text.split(":");
  
  let version: number;
  let ivHex: string;
  let encrypted: string;

  if (parts.length === 3 && parts[0].startsWith("v")) {
    // New format: v{version}:{iv}:{encrypted}
    version = parseInt(parts[0].substring(1));
    ivHex = parts[1];
    encrypted = parts[2];
  } else if (parts.length === 2) {
    // Legacy format: {iv}:{encrypted} (assume version 1)
    version = 1;
    ivHex = parts[0];
    encrypted = parts[1];
  } else {
    throw new Error("Invalid encrypted format");
  }

  // Get appropriate key
  const keyObj = getKeyByVersion(version);
  if (!keyObj) {
    throw new Error(`Encryption key version ${version} not found. Cannot decrypt.`);
  }

  // Decrypt
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, keyObj.key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if encrypted text uses the latest key version
 */
export function isLatestVersion(encryptedText: string): boolean {
  const parts = encryptedText.split(":");
  
  if (parts.length === 3 && parts[0].startsWith("v")) {
    const version = parseInt(parts[0].substring(1));
    return version === getLatestKey().version;
  }
  
  // Legacy format is not latest
  return false;
}

/**
 * Re-encrypt text with the latest key
 * Used during key rotation
 */
export function reencrypt(encryptedText: string): string {
  // Decrypt with old key
  const plaintext = decrypt(encryptedText);
  
  // Encrypt with new key
  return encrypt(plaintext);
}

/**
 * Get current key version info (for monitoring)
 */
export function getKeyInfo() {
  return {
    currentVersion: getLatestKey().version,
    availableVersions: ENCRYPTION_KEYS.map(k => k.version),
    totalKeys: ENCRYPTION_KEYS.length,
  };
}
