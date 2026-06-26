/**
 * Storage Service — upload & presigned URL untuk bukti transfer (Fase 4).
 *
 * Pakai Bun native S3Client. BOOT-SAFETY: tidak ada top-level throw —
 * S3 client di-init LAZY di dalam fungsi, bukan saat import.
 * Server boot tanpa env S3 → aman (belum ada yang panggil fungsi ini di 4.1).
 *
 * Flow:
 *   uploadProof()          → validasi tipe+ukuran → upload privat → return key
 *   getProofPresignedUrl() → presign GET URL ber-TTL (default 5 menit)
 */

import { S3Client } from "bun";
import { env } from "../config/env";
import { randomUUID } from "crypto";

// Tipe file yang diizinkan untuk bukti transfer
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "application/pdf": "pdf",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Magic bytes (file signature) per content-type. JANGAN percaya content-type /
// ekstensi dari client doang — verifikasi byte awal file benar-benar cocok.
const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png":  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
};

/** True kalau byte awal `bytes` cocok dengan signature untuk `contentType`. */
function matchesMagicBytes(contentType: string, bytes: Uint8Array): boolean {
  const sig = MAGIC_BYTES[contentType];
  if (!sig) return false;
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

// ── Lazy singleton ────────────────────────────────────────────
// Client TIDAK dibuat saat import — dibuat saat pertama dipakai.
// Mencegah crash boot kalau env S3 belum diisi.
let _client: S3Client | null = null;

/** Cek apakah semua env S3 sudah dikonfigurasi. */
export function isStorageConfigured(): boolean {
  return Boolean(env.s3Bucket && env.s3AccessKeyId && env.s3SecretAccessKey);
}

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error("storage_not_configured");
  }
  if (!_client) {
    _client = new S3Client({
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
      bucket: env.s3Bucket,
      region: env.s3Region,
      ...(env.s3Endpoint ? { endpoint: env.s3Endpoint } : {}),
    });
  }
  return _client;
}

// ── Types ─────────────────────────────────────────────────────

export interface UploadProofInput {
  companyId: number;
  bytes: Uint8Array | ArrayBuffer;
  contentType: string;
}

// ── Functions ─────────────────────────────────────────────────

/**
 * Validasi tipe + ukuran file, upload PRIVAT ke object storage, return object key.
 *
 * Throws:
 *   'invalid_file_type'     — contentType bukan JPG/PNG/PDF
 *   'file_too_large'        — ukuran > 5MB atau 0 byte
 *   'storage_not_configured' — env S3 belum diisi
 */
export async function uploadProof(input: UploadProofInput): Promise<{ key: string }> {
  const ext = ALLOWED_TYPES[input.contentType];
  if (!ext) throw new Error("invalid_file_type");

  const size = input.bytes instanceof ArrayBuffer
    ? input.bytes.byteLength
    : (input.bytes as Uint8Array).byteLength;

  if (size <= 0 || size > MAX_BYTES) throw new Error("file_too_large");

  // Verifikasi magic bytes: byte awal file HARUS cocok dengan content-type yang
  // diklaim. Mencegah file disamarkan (mis. file lain di-rename jadi image/jpeg).
  const u8 = input.bytes instanceof ArrayBuffer ? new Uint8Array(input.bytes) : input.bytes;
  if (!matchesMagicBytes(input.contentType, u8)) {
    throw new Error("invalid_file_type");
  }

  const key = `subscription-proofs/company-${input.companyId}/${randomUUID()}.${ext}`;
  const client = getClient();

  await client.file(key).write(input.bytes, { type: input.contentType });

  return { key };
}

/**
 * Generate presigned GET URL ber-TTL pendek untuk menampilkan bukti transfer.
 *
 * @param key      Object key dari DB (kolom proof_key)
 * @param ttlSeconds  TTL dalam detik, default 300 (5 menit)
 *
 * Throws:
 *   'missing_key'            — key kosong/null
 *   'storage_not_configured' — env S3 belum diisi
 */
export function getProofPresignedUrl(key: string, ttlSeconds = 300): string {
  if (!key) throw new Error("missing_key");
  return getClient().presign(key, { expiresIn: ttlSeconds, method: "GET" });
}
