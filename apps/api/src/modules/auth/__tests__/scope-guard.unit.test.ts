/**
 * Unit tests for cross-scope guard helpers (Fase 1.3).
 *
 * Pure crypto checks (no DB): a correctly-signed token of the WRONG scope is
 * detected so each portal can answer 403 instead of 401.
 */

import { test, expect, describe, beforeAll } from "bun:test";
import { signJwt } from "../jwt";
import { signPlatformJwt } from "../../platform/platform-jwt";
import { hasValidPlatformScope, hasValidTenantScope } from "../scope-guard";

beforeAll(() => {
  // 32+ byte secret so AUTH_JWT_SECRET validation passes
  process.env.AUTH_JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long!!";
});

describe("hasValidPlatformScope", () => {
  test("true for a correctly-signed platform token", async () => {
    const token = await signPlatformJwt({ sub: 1 }, new Date());
    expect(await hasValidPlatformScope(token)).toBe(true);
  });

  test("true even for an expired platform token (freshness ignored)", async () => {
    const farPast = new Date("2020-01-01T00:00:00Z");
    const token = await signPlatformJwt({ sub: 1 }, farPast);
    expect(await hasValidPlatformScope(token)).toBe(true);
  });

  test("false for a tenant token (wrong scope)", async () => {
    const token = await signJwt({ sub: 1, role: "admin", companyId: 1 }, new Date());
    expect(await hasValidPlatformScope(token)).toBe(false);
  });

  test("false for undefined", async () => {
    expect(await hasValidPlatformScope(undefined)).toBe(false);
  });

  test("false for a malformed token", async () => {
    expect(await hasValidPlatformScope("not.a.jwt")).toBe(false);
  });
});

describe("hasValidTenantScope", () => {
  test("true for a correctly-signed tenant token", async () => {
    const token = await signJwt({ sub: 1, role: "staff", companyId: 7 }, new Date());
    expect(await hasValidTenantScope(token)).toBe(true);
  });

  test("true even for an expired tenant token (freshness ignored)", async () => {
    const farPast = new Date("2020-01-01T00:00:00Z");
    const token = await signJwt({ sub: 1, role: "admin", companyId: 1 }, farPast);
    expect(await hasValidTenantScope(token)).toBe(true);
  });

  test("false for a platform token (wrong scope)", async () => {
    const token = await signPlatformJwt({ sub: 1 }, new Date());
    expect(await hasValidTenantScope(token)).toBe(false);
  });

  test("false for undefined", async () => {
    expect(await hasValidTenantScope(undefined)).toBe(false);
  });

  test("false for a malformed token", async () => {
    expect(await hasValidTenantScope("not.a.jwt")).toBe(false);
  });
});
