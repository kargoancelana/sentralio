# Security Checklist — Sentralio

Dokumen internal audit keamanan. Tiap kontrol disertai **status** + **bukti** (path file + fungsi/baris kode).

## Status Legend

- ✅ **Ada** — Kontrol telah diimplementasikan penuh
- ⚠️ **Sebagian** — Kontrol ada tapi belum lengkap
- ❌ **Belum** — Kontrol belum diimplementasikan

---

## 1. Isolasi Data Multi-Tenant

**Status:** ✅ Ada

**Deskripsi:** Setiap query database harus di-scope dengan `company_id` untuk mencegah data leakage antar tenant.

**Bukti:**
- **Test suite integrasi:** `apps/api/src/services/__tests__/tenant-isolation.integration.test.ts`
  - 41 test cases memverifikasi isolasi pada tabel: `master_products`, `shopee_orders`, `shopee_credentials`, `users`
  - Test membuktikan query dengan `company_id=A` tidak pernah mengembalikan row `company_id=B`
  - Test constraint enforcement: `uniq_active_shop`, `uniq_company_shop`
- **Script validasi:** `bun run --filter api test:isolation` (menjalankan test integrasi)
- **Hasil validasi:** 41/41 test passed (PR #233–#236, Issue #232)

---

## 2. Guard Kepemilikan Shop (Shop Ownership Guard)

**Status:** ✅ Ada

**Deskripsi:** Satu toko Shopee hanya boleh aktif di satu company. Mencegah rebutan akses toko antar tenant.

**Bukti:**
- **Implementasi:** `apps/api/src/modules/shopee/shopee-auth.route.ts`
  - Baris 60–75: Pre-check sebelum exchange token
    ```typescript
    const activeOther = await db.select({ id: shopeeCredentials.id })
      .from(shopeeCredentials)
      .where(and(
        eq(shopeeCredentials.shopId, shopIdNum),
        eq(shopeeCredentials.status, "connected"),
        ne(shopeeCredentials.companyId, user.companyId),
      )).limit(1);
    if (activeOther.length > 0) {
      set.status = 409;
      return {
        success: false,
        error: "shop_owned_by_other",
        message: "Toko ini sedang terhubung ke akun Sentralio lain..."
      };
    }
    ```
  - Baris 172–184: Race condition guard (catch `ER_DUP_ENTRY` dari constraint `uniq_active_shop`)
- **Issue reference:** #191

---

## 3. Enkripsi Token Shopee At-Rest

**Status:** ✅ Ada

**Deskripsi:** Token Shopee (`access_token`, `refresh_token`, `partner_key`) dienkripsi sebelum disimpan ke database menggunakan AES-256-GCM.

**Bukti:**
- **Modul kriptografi:** `apps/api/src/utils/crypto.ts`
  - Algoritma: `aes-256-gcm` (baris 4)
  - Fungsi: `encrypt()` (baris 31–40) — output format `iv:authTag:ciphertext`
  - Fungsi: `decrypt()` (baris 43–81) — dengan authenticated encryption (GCM auth tag)
  - Key: 32 bytes (256-bit) dari env var `TOKEN_SECRET_KEY` (baris 19–25)
- **Penggunaan:**
  - `apps/api/src/modules/shopee/shopee-auth.route.ts` (baris 135, 138–139) — encrypt saat menyimpan credentials
  - `apps/api/src/services/shopee-auth.ts` — decrypt saat membaca token untuk API calls
- **Validasi key:** `apps/api/src/config/env.ts` (baris 20–29) — `TOKEN_SECRET_KEY` wajib ada di `requiredEnv`

---

## 4. Password Hashing

**Status:** ✅ Ada

**Deskripsi:** Password user di-hash menggunakan bcrypt dengan cost factor 12 sebelum disimpan. Plaintext password tidak pernah disimpan atau di-log.

**Bukti:**
- **Modul hashing:** `apps/api/src/modules/auth/password.ts`
  - Algoritma: bcrypt (via `bcryptjs`)
  - Cost factor: 12 (baris 8: `export const BCRYPT_COST = 12;`)
  - Fungsi: `hashPassword(password: string)` (baris 14–17)
  - Fungsi: `verifyPassword(password: string, hash: string)` (baris 24–27)
- **Penggunaan:**
  - `apps/api/src/modules/users/users.service.ts` (baris 75) — hash saat create user
  - `apps/api/src/modules/auth/auth.service.ts` (baris 92) — verify saat login
  - `apps/api/src/modules/auth/password-reset.service.ts` — hash saat reset password
  - `apps/api/src/scripts/create-admin.ts` — hash saat bootstrap admin
  - `apps/api/src/scripts/reset-password.ts` — hash saat CLI reset password
- **Schema:** `apps/api/src/db/schema.ts` (baris 35, 170) — kolom `password_hash` VARCHAR(100), **bukan** `password`
- **No-leak validation:** Test memastikan response API tidak pernah return `password` atau `password_hash` (contoh: `apps/api/src/modules/users/__tests__/users.integration.test.ts` baris 39–41)

---

## 5. JWT Session Management

**Status:** ✅ Ada

**Deskripsi:** Sesi autentikasi menggunakan JWT (signed dengan HS256), dengan secret key minimal 32 bytes dan mekanisme revocation.

**Bukti:**
- **Modul JWT:** `apps/api/src/modules/auth/jwt.ts`
  - Library: `jose` (industry-standard JWT library)
  - Algoritma: HS256 (HMAC-SHA256)
  - Fungsi: `signJwt()` (baris 24+) — TTL 8 jam (28,800 detik)
  - Fungsi: `verifyJwt()` (baris 44+) — verifikasi signature + expiry
  - Secret: `AUTH_JWT_SECRET` dari env (harus ≥32 UTF-8 bytes)
- **Secret validation:** `apps/api/src/config/env.ts`
  - Baris 39–47: Fail-fast validation saat boot
    ```typescript
    const jwtSecret = process.env.AUTH_JWT_SECRET;
    if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
      console.error("[FATAL] AUTH_JWT_SECRET is missing or too short...");
      process.exit(1);
    }
    ```
  - Test suite: `apps/api/src/modules/auth/__tests__/env-validation.test.ts` (18 test cases)
- **Revocation:** `apps/api/src/modules/auth/auth.service.ts`
  - Tabel: `revoked_sessions` menyimpan jti (JWT ID) yang di-revoke
  - Fungsi: `revokeJti()` dipanggil saat renew session (baris 164) dan logout
  - Mekanisme: `tokens_valid_from` di tabel `users` untuk invalidate semua sesi sebelum timestamp tertentu (contoh: saat ganti password)

---

## 6. Audit Log

**Status:** ✅ Ada

**Deskripsi:** Sistem mencatat aksi sensitif (platform & company) ke tabel `audit_log` untuk traceability.

**Bukti:**
- **Tabel:** `audit_log` di database (kolom: actor, company, action, target, IP, before/after JSON, timestamp)
- **Service:** `apps/api/src/modules/platform/audit-log.service.ts`
  - Fungsi: `logAudit()` — write audit entry
  - Fungsi: `extractAuditIp()` — extract IP dari request
- **Query service:** `apps/api/src/modules/platform/platform-audit.service.ts`
  - Fungsi: `listAuditLogs()` — query dengan filter (company, action, date range)
  - Fungsi: `listAuditActions()` — list distinct actions untuk dropdown
- **API endpoint:** `apps/api/src/modules/platform/platform-audit.route.ts`
  - `GET /platform/audit` — list audit log (filter + pagination)
  - `GET /platform/audit/actions` — list distinct actions
- **Frontend viewer:** `apps/web/src/pages/platform/PlatformAudit.tsx`
  - Halaman Super Admin untuk view audit log (read-only)
  - Filter: Company ID, Action, Date Range
  - Pagination: 50 rows/page
  - Modal: View before/after JSON

---

## 7. Impersonation Guardrail

**Status:** ✅ Ada

**Deskripsi:** Saat Super Admin impersonate user, sistem menampilkan banner peringatan dan menonaktifkan aksi sensitif (ganti password, ubah langganan).

**Bukti:**
- **Backend service:** `apps/api/src/modules/platform/impersonation.service.ts`
  - Fungsi: `startImpersonation()` — mint JWT dengan claim `imp: platformAdminId`
  - Fungsi: `stopImpersonation()` — revoke impersonation JWT, restore platform session
- **JWT signing:** `apps/api/src/modules/auth/jwt.ts`
  - Fungsi: `signImpersonationJwt()` — sama dengan JWT biasa tapi tambah claim `imp`
- **Middleware guard:** `apps/api/src/modules/auth/impersonation-guard.middleware.ts`
  - Block aksi sensitif saat detect `imp` claim di JWT
  - Log semua aksi impersonation ke audit_log
- **Frontend banner:** `apps/web/src/components/impersonation/ImpersonationBanner.tsx`
  - Banner muncul di top semua halaman app (bukan portal) saat impersonation aktif
  - Menampilkan: "Super Admin sedang melihat akun ini sebagai {user.name}"
  - Button: "Kembali ke Portal" untuk stop impersonation
- **Frontend guard:** Form sensitif di-disable saat impersonation:
  - `apps/web/src/components/settings/ChangePasswordForm.tsx` — disable ganti password
  - `apps/web/src/pages/Langganan.tsx` — disable create/modify subscription order

---

## 8. CORS & Allowed Origins

**Status:** ✅ Ada

**Deskripsi:** CORS dikonfigurasi dengan whitelist origin yang diizinkan untuk mencegah unauthorized cross-origin requests.

**Bukti:**
- **Validasi env:** `apps/api/src/config/env.ts`
  - Baris 49–73: Fail-fast validation `AUTH_ALLOWED_ORIGINS`
    ```typescript
    const rawAllowedOrigins = process.env.AUTH_ALLOWED_ORIGINS ?? "";
    const hasValidOrigin = rawAllowedOrigins
      .split(",")
      .some((entry) => isValidOriginEntry(entry));
    
    if (!hasValidOrigin) {
      console.error("[FATAL] AUTH_ALLOWED_ORIGINS is unset...");
      process.exit(1);
    }
    ```
  - Hanya menerima origin dengan protocol `http://` atau `https://`
- **Test suite:** `apps/api/src/modules/auth/__tests__/env-validation.test.ts`
  - Test case: reject invalid origins (ftp://, plain domain, empty)
  - Test case: accept valid origins (https://, http://localhost)

---

## 9. Input Validation

**Status:** ⚠️ Sebagian

**Deskripsi:** Validasi input di API routes menggunakan schema (Elysia + TypeBox).

**Bukti:**
- **Schema validation:** Elysia routes menggunakan `t.Object()` untuk validate request body
  - Contoh: `apps/api/src/modules/shopee/shopee-auth.route.ts` (baris 224–227)
  - Contoh: `apps/api/src/modules/users/users.route.ts` — validate email, password, role
- **Email validation:** `apps/api/src/modules/auth/email.ts`
  - Fungsi: `isValidEmailSyntax()` — regex-based email validation
  - Fungsi: `normalizeEmail()` — lowercase + trim
- **Password policy:** `apps/api/src/modules/auth/password-policy.ts`
  - Minimal 10 karakter, maksimal 128
  - Harus ada: lowercase, uppercase, digit, special char
  - Fungsi: `validatePasswordPolicy()`

**Catatan:** Belum ada sanitasi universal untuk semua input string (XSS, SQL injection prevention rely on parameterized queries dari Drizzle ORM).

---

## 10. Rate Limiting / Login Lockout

**Status:** ✅ Ada

**Deskripsi:** Sistem melindungi endpoint login dari brute-force dengan lockout mechanism.

**Bukti:**
- **Service:** `apps/api/src/modules/auth/lockout.ts`
  - Fungsi: `isLockedOut(email)` — cek apakah user sedang di-lockout
  - Fungsi: `recordFailure(email, ip)` — catat failed login attempt
  - Fungsi: `clearFailures(email)` — clear setelah login sukses
- **Tabel:**
  - `failed_login_attempts` — catat tiap attempt (email, IP, timestamp)
  - `account_lockouts` — lockout active saat threshold tercapai
- **Logic:** `apps/api/src/modules/auth/auth.service.ts`
  - Baris ~65: Check lockout sebelum credential validation
  - Baris ~95: Record failure saat wrong password / unknown email
  - Baris ~108: Clear failures saat login success
- **Test:** `apps/api/src/modules/auth/__tests__/lockout.logging.property.test.ts`

**Catatan:** Belum ada rate limiting global untuk endpoint lain (hanya login yang dilindungi).

---

## 11. S3 Presigned URL

**Status:** ⚠️ Sebagian

**Deskripsi:** Upload file (bukti transfer) menggunakan presigned URL dengan TTL terbatas, bukan direct S3 credentials di frontend.

**Bukti:**
- **Service:** `apps/api/src/services/storage.service.ts`
  - Fungsi: `generatePresignedUploadUrl()` — generate presigned PUT URL (TTL 15 menit)
  - Library: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- **API:** `apps/api/src/modules/master/master-outgoing.route.ts`
  - Endpoint: `POST /master-outgoing/presigned-url`
  - Generate presigned URL untuk bucket `{company_id}/transfer-evidence/`

**Catatan:** Presigned URL hanya untuk upload. Download masih via proxy API endpoint (belum presigned GET URL). Validasi S3 credentials dilakukan lazy (saat digunakan), bukan saat boot.

---

## 12. Database Connection Security

**Status:** ⚠️ Sebagian

**Deskripsi:** Koneksi database menggunakan credentials dari env vars, dengan parameterized queries untuk mencegah SQL injection.

**Bukti:**
- **Credentials:** `apps/api/src/config/env.ts` (baris 20–29)
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` wajib ada (`requiredEnv`)
- **ORM:** Drizzle ORM dengan MySQL2 driver (`apps/api/src/db/client.ts`)
  - Semua query menggunakan parameterized statements (protection dari SQL injection built-in)
  - Contoh: `eq(users.id, userId)` di-compile jadi `WHERE id = ?` dengan param binding

**Catatan:** 
- Belum ada TLS/SSL enforcement untuk koneksi DB (tergantung config MySQL server)
- Credentials di-load dari `.env` plaintext (belum ada secrets manager integration)

---

## 13. Error Handling & Information Disclosure

**Status:** ⚠️ Sebagian

**Deskripsi:** Error responses tidak boleh leak sensitive info (stack trace, internal paths, credentials).

**Bukti:**
- **Unified error response:** API menggunakan pattern `{ ok: false, error: "error_code", message: "User-friendly message" }`
  - Contoh: `apps/api/src/modules/auth/auth.service.ts` (baris 102) — unified 401 untuk unknown email / wrong password / inactive user (timing-attack resistant)
- **No password in logs:** Hash/password tidak pernah di-log
  - Contoh: `apps/api/src/scripts/create-admin.ts` (comment baris 38: "never log password or hash")
  - Test: `apps/api/src/modules/auth/__tests__/lockout.logging.property.test.ts` (baris 128–132) — assert password tidak muncul di log

**Catatan:**
- Belum ada global error handler yang scrub stack traces di production
- 500 errors bisa leak internal error messages (misal: database connection failed)

---

## 14. Security Headers

**Status:** ❌ Belum

**Deskripsi:** HTTP security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) untuk melindungi frontend dari XSS, clickjacking, dll.

**Status saat ini:** Belum ada middleware yang set security headers di response.

**Rekomendasi:** Tambahkan middleware di `apps/api/src/index.ts` untuk set:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (jika production pakai HTTPS)

---

## 15. Dependency Scanning

**Status:** ❌ Belum

**Deskripsi:** Automated scanning untuk known vulnerabilities di npm packages.

**Status saat ini:** Belum ada CI/CD step untuk dependency scanning.

**Rekomendasi:** 
- Jalankan `bun audit` secara berkala
- Tambahkan GitHub Dependabot alerts
- Integrate `npm audit` atau Snyk di CI pipeline

---

## Summary

| Kontrol | Status | Prioritas Fix |
|---------|--------|---------------|
| Isolasi Data Multi-Tenant | ✅ Ada | - |
| Guard Kepemilikan Shop | ✅ Ada | - |
| Enkripsi Token Shopee | ✅ Ada | - |
| Password Hashing | ✅ Ada | - |
| JWT Session Management | ✅ Ada | - |
| Audit Log | ✅ Ada | - |
| Impersonation Guardrail | ✅ Ada | - |
| CORS & Allowed Origins | ✅ Ada | - |
| Input Validation | ⚠️ Sebagian | Medium |
| Rate Limiting / Login Lockout | ✅ Ada (login only) | Low |
| S3 Presigned URL | ⚠️ Sebagian | Low |
| Database Connection Security | ⚠️ Sebagian | Medium |
| Error Handling | ⚠️ Sebagian | Medium |
| Security Headers | ❌ Belum | High |
| Dependency Scanning | ❌ Belum | Medium |

**Kesimpulan:** Postur keamanan dasar sudah solid (isolasi tenant, enkripsi, autentikasi, audit). Area improvement: security headers, input sanitasi universal, dan dependency scanning.
