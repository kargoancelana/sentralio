/**
 * Unit tests for storage.service.ts — magic bytes validation (Fase 4.2a).
 * Does NOT require S3 credentials: magic bytes check happens BEFORE getClient().
 * We rely on the fact that isStorageConfigured() returns false in test env
 * (no S3 env vars), so getClient() would throw 'storage_not_configured' — but
 * we assert the error is 'invalid_file_type' or 'file_too_large' which happen BEFORE
 * getClient() is called.
 */

import { test, expect, describe } from "bun:test";
import { uploadProof } from "../storage.service";

// JPEG magic bytes: FF D8 FF
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
// PDF magic bytes: %PDF-
const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
// Fake bytes (not matching any magic)
const fakeBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

describe("uploadProof - magic bytes validation", () => {
  test("JPEG bytes + wrong content-type (image/png) → invalid_file_type", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: jpegBytes, contentType: 'image/png' })
    ).rejects.toThrow('invalid_file_type');
  });

  test("fake bytes + image/jpeg → invalid_file_type", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: fakeBytes, contentType: 'image/jpeg' })
    ).rejects.toThrow('invalid_file_type');
  });

  test("fake bytes + application/pdf → invalid_file_type", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: fakeBytes, contentType: 'application/pdf' })
    ).rejects.toThrow('invalid_file_type');
  });

  test("content-type outside allow-list → invalid_file_type", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: jpegBytes, contentType: 'image/gif' })
    ).rejects.toThrow('invalid_file_type');
  });

  test("empty bytes → file_too_large (size=0)", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: new Uint8Array(0), contentType: 'image/jpeg' })
    ).rejects.toThrow('file_too_large');
  });

  test("bytes > 5MB → file_too_large", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    await expect(
      uploadProof({ companyId: 1, bytes: big, contentType: 'image/jpeg' })
    ).rejects.toThrow('file_too_large');
  });

  test("valid JPEG magic bytes + correct type → passes magic check (throws storage_not_configured, not invalid_file_type)", async () => {
    // Magic check passes, then getClient() throws 'storage_not_configured' (no S3 env in test).
    // This proves the magic bytes check itself passed.
    await expect(
      uploadProof({ companyId: 1, bytes: jpegBytes, contentType: 'image/jpeg' })
    ).rejects.toThrow('storage_not_configured');
  });

  test("valid PNG magic bytes + correct type → passes magic check", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: pngBytes, contentType: 'image/png' })
    ).rejects.toThrow('storage_not_configured');
  });

  test("valid PDF magic bytes + correct type → passes magic check", async () => {
    await expect(
      uploadProof({ companyId: 1, bytes: pdfBytes, contentType: 'application/pdf' })
    ).rejects.toThrow('storage_not_configured');
  });
});
