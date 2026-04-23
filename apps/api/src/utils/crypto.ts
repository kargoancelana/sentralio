import crypto from "crypto";
import { env } from "../config/env";

const algorithm = "aes-256-cbc";
// Secret key kita persis 32 bytes (256 bits)
const key = Buffer.from(env.tokenSecretKey, "utf-8");

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
