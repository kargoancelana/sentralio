/**
 * Startup fail-fast tests for env.ts auth validation.
 *
 * Asserts the process exits with a non-zero status code before binding a port
 * when AUTH_JWT_SECRET is missing/short or AUTH_ALLOWED_ORIGINS is unset/empty/invalid.
 *
 * Requirements: 2.5, 9.7
 *
 * Strategy: spawn a child Bun process that imports env.ts with a controlled,
 * fully isolated environment (no inherited env vars, no .env file interference).
 * The child calls process.exit(1) during module load when validation fails.
 */

import { test, expect } from "bun:test";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Base environment
// ---------------------------------------------------------------------------

/**
 * All required non-auth env vars with valid dummy values.
 * These satisfy the `requiredEnv` array in env.ts so that only the auth vars
 * under test can cause a non-zero exit.
 *
 * We do NOT include HOME, PATH, or any var that could cause dotenv to load
 * a real .env file with valid AUTH_* values — instead we provide auth vars
 * explicitly in each test case.
 */
const BASE_ENV: Record<string, string> = {
  // Required by env.ts
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_USER: "testuser",
  DB_PASSWORD: "testpassword",
  DB_NAME: "testdb",
  PARTNER_ID: "12345",
  PARTNER_KEY: "testpartnerkey",
  SHOP_ID: "67890",
  ACCESS_TOKEN: "testaccesstoken",
  REFRESH_TOKEN: "testrefreshtoken",
  TOKEN_SECRET_KEY: "test_token_secret_key_dummy_value",
  // Prevent dotenv from trying to find a .env file at an unexpected path
  // by setting a nonexistent path via DOTENV_CONFIG_PATH — dotenv silently
  // ignores missing files. Note: we DON'T inherit the real process.env so
  // the actual .env on disk doesn't get loaded.
  NODE_ENV: "test",
};

/** 32-char ASCII secret (32 bytes), the minimum valid value */
const VALID_JWT_SECRET = "a".repeat(32);
/** A single valid https origin */
const VALID_ORIGINS = "https://example.com";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUNNER_PATH = resolve(
  import.meta.dir,
  "helpers",
  "env-test-runner.ts",
);

/**
 * Spawns the env-test-runner script with a fully controlled environment
 * (no inherited vars — only what we pass explicitly). Returns the exit code.
 */
async function runWithEnv(env: Record<string, string>): Promise<number> {
  const proc = Bun.spawn(["bun", RUNNER_PATH], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return proc.exited;
}

// ---------------------------------------------------------------------------
// Sanity: happy path exits 0
// ---------------------------------------------------------------------------

test("exits 0 when both AUTH_JWT_SECRET and AUTH_ALLOWED_ORIGINS are valid", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).toBe(0);
});

// ---------------------------------------------------------------------------
// Requirement 2.5 — AUTH_JWT_SECRET fail-fast
// ---------------------------------------------------------------------------

test("exits non-zero when AUTH_JWT_SECRET is missing (unset)", async () => {
  // No AUTH_JWT_SECRET key in the env at all
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
    // AUTH_JWT_SECRET intentionally omitted
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_JWT_SECRET is an empty string", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: "",
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_JWT_SECRET UTF-8 byte length is 31 (one byte short)", async () => {
  // 31 ASCII characters = 31 UTF-8 bytes, just below the 32-byte minimum
  const shortSecret = "a".repeat(31);
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: shortSecret,
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_JWT_SECRET UTF-8 byte length is 1", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: "x",
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).not.toBe(0);
});

test("exits 0 when AUTH_JWT_SECRET is exactly 32 ASCII bytes (minimum valid)", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET, // "a" * 32 = 32 bytes
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).toBe(0);
});

test("exits 0 when AUTH_JWT_SECRET is longer than 32 bytes", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: "a".repeat(64),
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).toBe(0);
});

test("exits non-zero when AUTH_JWT_SECRET multi-byte chars give < 32 UTF-8 bytes (e.g. 15 × 2-byte chars = 30 bytes)", async () => {
  // Each '€' is 3 UTF-8 bytes; 10 × '€' = 30 bytes < 32
  // Each 'é' is 2 UTF-8 bytes; 15 × 'é' = 30 bytes < 32
  const twoByteChars = "\u00e9".repeat(15); // 15 × é = 30 UTF-8 bytes
  expect(Buffer.byteLength(twoByteChars, "utf8")).toBe(30);
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: twoByteChars,
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).not.toBe(0);
});

test("exits 0 when AUTH_JWT_SECRET multi-byte chars give >= 32 UTF-8 bytes (e.g. 16 × 2-byte chars = 32 bytes)", async () => {
  // 16 × 'é' = 32 UTF-8 bytes — exactly at the threshold
  const twoByteChars = "\u00e9".repeat(16); // 16 × é = 32 UTF-8 bytes
  expect(Buffer.byteLength(twoByteChars, "utf8")).toBe(32);
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: twoByteChars,
    AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
  });
  expect(code).toBe(0);
});

// ---------------------------------------------------------------------------
// Requirement 9.7 — AUTH_ALLOWED_ORIGINS fail-fast
// ---------------------------------------------------------------------------

test("exits non-zero when AUTH_ALLOWED_ORIGINS is missing (unset)", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    // AUTH_ALLOWED_ORIGINS intentionally omitted
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_ALLOWED_ORIGINS is an empty string", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "",
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_ALLOWED_ORIGINS contains only whitespace", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "   ,  ,  ",
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_ALLOWED_ORIGINS contains only an invalid (non-http/https) entry", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "not-a-url",
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_ALLOWED_ORIGINS is 'ftp://example.com' (non-http/https scheme)", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "ftp://example.com",
  });
  expect(code).not.toBe(0);
});

test("exits non-zero when AUTH_ALLOWED_ORIGINS contains only a bare hostname (no scheme)", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "example.com",
  });
  expect(code).not.toBe(0);
});

test("exits 0 when AUTH_ALLOWED_ORIGINS contains one valid https entry", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "https://example.com",
  });
  expect(code).toBe(0);
});

test("exits 0 when AUTH_ALLOWED_ORIGINS contains one valid http entry", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "http://localhost:3000",
  });
  expect(code).toBe(0);
});

test("exits 0 when AUTH_ALLOWED_ORIGINS has one valid entry mixed with invalid entries", async () => {
  // At least one valid entry should satisfy the check
  const code = await runWithEnv({
    ...BASE_ENV,
    AUTH_JWT_SECRET: VALID_JWT_SECRET,
    AUTH_ALLOWED_ORIGINS: "not-a-url,https://valid.example.com,also-invalid",
  });
  expect(code).toBe(0);
});

test("exits non-zero when both AUTH_JWT_SECRET and AUTH_ALLOWED_ORIGINS are missing", async () => {
  const code = await runWithEnv({
    ...BASE_ENV,
    // Neither auth var provided
  });
  expect(code).not.toBe(0);
});
