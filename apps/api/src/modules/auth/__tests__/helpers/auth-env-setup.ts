/**
 * Side-effecting test setup module.
 *
 * Importing this module sets the auth env vars BEFORE `src/config/env.ts`
 * evaluates. `config/env.ts` calls `process.exit(1)` at module-load time when
 * `AUTH_JWT_SECRET` (>= 32 UTF-8 bytes) or `AUTH_ALLOWED_ORIGINS` are missing,
 * and ESM hoists all imports above top-level statements — so a plain top-level
 * assignment in the test file runs too late. Import this module first, before
 * any import that transitively pulls in `config/env.ts` (e.g. `auth.service`).
 */

if (!process.env.AUTH_JWT_SECRET || Buffer.byteLength(process.env.AUTH_JWT_SECRET, "utf8") < 32) {
  process.env.AUTH_JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long!!";
}

if (!process.env.AUTH_ALLOWED_ORIGINS) {
  process.env.AUTH_ALLOWED_ORIGINS = "https://example.com";
}
