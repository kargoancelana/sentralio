import { describe, it, expect } from "bun:test";
import { resolve } from "path";
import { pathToFileURL } from "url";

/**
 * Startup fail-fast tests for env validation (Task 2.2).
 *
 * env.ts validates AUTH_JWT_SECRET and AUTH_ALLOWED_ORIGINS at module
 * evaluation time and calls process.exit(1) on failure, *before* any port
 * binding. Because the validation happens at import time and terminates the
 * process, the only reliable way to observe it is to spawn a subprocess that
 * imports env.ts under a controlled environment and assert on the exit code.
 *
 * Validates: Requirements 2.5, 9.7
 */

// Absolute path to the module under test (../env.ts relative to this dir).
const ENV_MODULE_URL = pathToFileURL(
  resolve(import.meta.dir, "..", "env.ts")
).href;

// All non-auth required env vars must be present so the subprocess reaches the
// AUTH validation block (which runs after the requiredEnv throw-check). The
// root .env already supplies these, but we set them explicitly so the test is
// deterministic regardless of the machine's .env contents.
const BASE_REQUIRED_ENV: Record<string, string> = {
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_USER: "test",
  DB_PASSWORD: "test",
  DB_NAME: "test",
  PARTNER_ID: "1",
  PARTNER_KEY: "dummy",
  SHOP_ID: "1",
  ACCESS_TOKEN: "dummy",
  REFRESH_TOKEN: "dummy",
  TOKEN_SECRET_KEY: "dummy",
};

const VALID_SECRET = "x".repeat(32); // exactly 32 UTF-8 bytes
const VALID_ORIGINS = "https://example.com";

/**
 * Spawn a subprocess that imports env.ts with a controlled environment.
 * Keys whose value is `undefined` in `overrides` are removed from the env so
 * the variable is genuinely unset in the child process.
 */
function runEnvValidation(overrides: Record<string, string | undefined>): {
  exitCode: number;
  stderr: string;
} {
  // Start from the parent env so PATH etc. are preserved, then layer the
  // required vars, then the test-specific overrides.
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v;
  }
  Object.assign(childEnv, BASE_REQUIRED_ENV);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }

  const result = Bun.spawnSync({
    cmd: ["bun", "-e", `await import(${JSON.stringify(ENV_MODULE_URL)})`],
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
  };
}

describe("env startup fail-fast: AUTH_JWT_SECRET (Req 2.5)", () => {
  it("exits non-zero when AUTH_JWT_SECRET is missing", () => {
    const { exitCode } = runEnvValidation({
      AUTH_JWT_SECRET: undefined,
      AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
    });
    expect(exitCode).not.toBe(0);
  });

  it("exits non-zero when AUTH_JWT_SECRET is shorter than 32 bytes", () => {
    const { exitCode } = runEnvValidation({
      AUTH_JWT_SECRET: "short",
      AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
    });
    expect(exitCode).not.toBe(0);
  });
});

describe("env startup fail-fast: AUTH_ALLOWED_ORIGINS (Req 9.7)", () => {
  it("exits non-zero when AUTH_ALLOWED_ORIGINS is unset", () => {
    const { exitCode } = runEnvValidation({
      AUTH_JWT_SECRET: VALID_SECRET,
      AUTH_ALLOWED_ORIGINS: undefined,
    });
    expect(exitCode).not.toBe(0);
  });

  it("exits non-zero when AUTH_ALLOWED_ORIGINS is an empty string", () => {
    const { exitCode } = runEnvValidation({
      AUTH_JWT_SECRET: VALID_SECRET,
      AUTH_ALLOWED_ORIGINS: "",
    });
    expect(exitCode).not.toBe(0);
  });

  it("exits non-zero when AUTH_ALLOWED_ORIGINS contains no valid origin", () => {
    const { exitCode } = runEnvValidation({
      AUTH_JWT_SECRET: VALID_SECRET,
      AUTH_ALLOWED_ORIGINS: "not-a-url",
    });
    expect(exitCode).not.toBe(0);
  });
});

describe("env startup: valid AUTH configuration", () => {
  it("does not exit non-zero when both AUTH vars are valid", () => {
    const { exitCode } = runEnvValidation({
      AUTH_JWT_SECRET: VALID_SECRET,
      AUTH_ALLOWED_ORIGINS: VALID_ORIGINS,
    });
    // env.ts only builds the config object on success; it neither binds a port
    // nor connects to the database, so a clean import should exit 0.
    expect(exitCode).toBe(0);
  });
});
