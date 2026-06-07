/**
 * Integration tests for the reset-password CLI script.
 *
 * These tests invoke the script as a subprocess using Bun.spawnSync and verify
 * exit codes and output for the argument-validation paths (exit 2, exit 3).
 * These paths execute entirely before any DB connection is attempted, so dummy
 * DB env vars are sufficient.
 *
 * Requirements: 7.4, 7.5, 7.6, 7.7
 */

import { describe, it, expect } from "bun:test";
import { join } from "path";

// Absolute path to the script under test
const SCRIPT = join(import.meta.dir, "../reset-password.ts");

// Minimal env: real DB access is not exercised by argument-validation tests.
// We provide dummy values so any env-reading code that runs early doesn't throw
// unexpected errors before the arg-validation exit paths are reached.
const DUMMY_ENV: Record<string, string> = {
  ...process.env,
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_USER: "dummy",
  DB_PASSWORD: "dummy",
  DB_NAME: "dummy",
};

/**
 * Run the script with the given CLI arguments and return the result.
 */
function runScript(args: string[]) {
  return Bun.spawnSync(["bun", "run", SCRIPT, ...args], {
    env: DUMMY_ENV,
    stdout: "pipe",
    stderr: "pipe",
  });
}

/**
 * Filter dotenvx noise from stdout.
 * dotenvx prints "✔ injected env ..." lines to stdout — strip those so tests
 * can assert on the actual script output only.
 */
function cleanStdout(raw: Uint8Array): string {
  const text = new TextDecoder().decode(raw);
  return text
    .split("\n")
    .filter((line) => !line.includes("injected env") && !line.includes("dotenvx"))
    .join("\n")
    .trim();
}

// ─── Exit 2: missing / empty arguments ────────────────────────────────────────

describe("reset-password CLI — exit 2 (missing/empty arguments)", () => {
  it("exits with code 2 when --email is missing", () => {
    // Req 7.7: missing --email → exit non-zero (2) + usage message
    const result = runScript(["--password", "validpassword123"]);

    expect(result.exitCode).toBe(2);
    // Error message goes to stderr
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    // stdout should be empty on error
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 2 when --password is missing", () => {
    // Req 7.7: missing --password → exit non-zero (2) + usage message
    const result = runScript(["--email", "user@example.com"]);

    expect(result.exitCode).toBe(2);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 2 when --email is empty string", () => {
    // Req 7.7: empty --email value → exit non-zero (2) + usage message
    const result = runScript(["--email", "", "--password", "validpassword123"]);

    expect(result.exitCode).toBe(2);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 2 when both --email and --password are missing", () => {
    // Req 7.7: both args absent → exit non-zero (2) + usage message
    const result = runScript([]);

    expect(result.exitCode).toBe(2);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 2 when --password is empty string", () => {
    // Req 7.7: empty --password value → exit non-zero (2) + usage message
    const result = runScript(["--email", "user@example.com", "--password", ""]);

    expect(result.exitCode).toBe(2);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });
});

// ─── Exit 3: password length outside [10, 128] ────────────────────────────────

describe("reset-password CLI — exit 3 (password length validation)", () => {
  it("exits with code 3 when password is too short (< 10 chars)", () => {
    // Req 7.4: password shorter than 10 chars → exit non-zero (3) + error message
    const result = runScript([
      "--email",
      "user@example.com",
      "--password",
      "short",  // 5 chars
    ]);

    expect(result.exitCode).toBe(3);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 3 when password is exactly 9 chars (boundary)", () => {
    // Req 7.4: 9 chars is still too short (minimum is 10)
    const result = runScript([
      "--email",
      "user@example.com",
      "--password",
      "123456789",  // 9 chars
    ]);

    expect(result.exitCode).toBe(3);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 3 when password is too long (> 128 chars)", () => {
    // Req 7.4: password longer than 128 chars → exit non-zero (3) + error message
    const longPassword = "a".repeat(129);  // 129 chars
    const result = runScript([
      "--email",
      "user@example.com",
      "--password",
      longPassword,
    ]);

    expect(result.exitCode).toBe(3);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });

  it("exits with code 3 when password is exactly 129 chars (boundary)", () => {
    // Req 7.4: 129 chars is just over the 128-char maximum
    const longPassword = "b".repeat(129);
    const result = runScript([
      "--email",
      "user@example.com",
      "--password",
      longPassword,
    ]);

    expect(result.exitCode).toBe(3);
    const stderr = new TextDecoder().decode(result.stderr);
    expect(stderr.length).toBeGreaterThan(0);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(stdout).toBe("");
  });
});

// ─── Stderr content sanity check ──────────────────────────────────────────────

describe("reset-password CLI — stderr content", () => {
  it("stderr contains usage hint when --email is missing", () => {
    const result = runScript(["--password", "validpassword123"]);
    const stderr = new TextDecoder().decode(result.stderr);

    // The script should print a usage or error message
    expect(stderr).toContain("--email");
  });

  it("stderr contains password length info when password is too short", () => {
    const result = runScript([
      "--email",
      "user@example.com",
      "--password",
      "tooshort",  // 8 chars
    ]);
    const stderr = new TextDecoder().decode(result.stderr);

    // The script should mention the invalid length or the allowed range
    expect(stderr.toLowerCase()).toMatch(/password|length|10|128/i);
  });

  it("stderr contains password length info when password is too long", () => {
    const longPassword = "x".repeat(200);
    const result = runScript([
      "--email",
      "user@example.com",
      "--password",
      longPassword,
    ]);
    const stderr = new TextDecoder().decode(result.stderr);

    expect(stderr.toLowerCase()).toMatch(/password|length|10|128/i);
  });
});
