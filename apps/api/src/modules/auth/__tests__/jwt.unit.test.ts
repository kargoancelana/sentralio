/**
 * Unit tests for JWT sign/verify and cookie builders.
 *
 * Feature: user-authentication
 * Validates: Requirements 2.1, 2.2
 *
 * Covers:
 *  1. Tampered token fails verification
 *  2. alg:none is rejected
 *  3. Wrong secret rejection
 *  4. buildSessionCookie exact header string
 *  5. buildClearCookie exact header string
 */

import { test, expect, describe, beforeAll } from "bun:test";
import { signJwt, verifyJwt } from "../jwt";
import { buildSessionCookie, buildClearCookie } from "../cookie";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Use a 32+ byte secret so AUTH_JWT_SECRET validation passes
  process.env.AUTH_JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long!!";
});

// ---------------------------------------------------------------------------
// JWT verification tests
// ---------------------------------------------------------------------------

describe("JWT tampered token", () => {
  test("verifyJwt throws when the payload section is tampered", async () => {
    const token = await signJwt({ sub: 1, role: "admin" }, new Date());

    // A JWT has three parts: header.payload.signature
    const parts = token.split(".");
    expect(parts.length).toBe(3);

    // Base64url-decode the payload, mutate a field, re-encode
    const rawPayload = Buffer.from(parts[1], "base64url").toString("utf8");
    const payloadObj = JSON.parse(rawPayload) as Record<string, unknown>;

    // Change the role from 'admin' to 'staff' (or sub to a different value)
    payloadObj.role = payloadObj.role === "admin" ? "staff" : "admin";
    payloadObj.sub = "9999";

    const tamperedPayload = Buffer.from(JSON.stringify(payloadObj))
      .toString("base64url")
      .replace(/=/g, "");

    const tamperedToken = [parts[0], tamperedPayload, parts[2]].join(".");

    // Verification must throw because the signature no longer matches
    await expect(verifyJwt(tamperedToken)).rejects.toThrow();
  });
});

describe("JWT alg:none rejection", () => {
  test("verifyJwt throws for a token with alg:none header and empty signature", async () => {
    // Manually construct a JWT with {"alg":"none"} header
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
      .toString("base64url")
      .replace(/=/g, "");

    const payload = Buffer.from(
      JSON.stringify({ sub: "1", role: "admin", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 28800, jti: "test-jti" })
    )
      .toString("base64url")
      .replace(/=/g, "");

    // alg:none tokens have an empty signature part
    const noneToken = `${header}.${payload}.`;

    await expect(verifyJwt(noneToken)).rejects.toThrow();
  });

  test("verifyJwt throws for a token with alg:none header and no signature part", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" }))
      .toString("base64url")
      .replace(/=/g, "");

    const payload = Buffer.from(
      JSON.stringify({ sub: "1", role: "admin", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 28800, jti: "test-jti" })
    )
      .toString("base64url")
      .replace(/=/g, "");

    const noneToken = `${header}.${payload}`;

    await expect(verifyJwt(noneToken)).rejects.toThrow();
  });
});

describe("JWT wrong secret rejection", () => {
  test("verifyJwt throws when token is signed with a different secret", async () => {
    // Sign with the current secret
    const token = await signJwt({ sub: 1, role: "staff" }, new Date());

    // Switch to a different secret and attempt verification
    const originalSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = "completely-different-secret-32bytes-xxxx";

    try {
      await expect(verifyJwt(token)).rejects.toThrow();
    } finally {
      // Always restore the original secret
      process.env.AUTH_JWT_SECRET = originalSecret;
    }
  });
});

describe("JWT expired token rejection", () => {
  test("verifyJwt throws when exp is in the past", async () => {
    // Sign a token with `now` far in the past so exp (now + 8h) is still
    // well before the current real time, making the token already expired.
    const farPast = new Date("2020-01-01T00:00:00Z");
    const token = await signJwt({ sub: 1, role: "admin" }, farPast);

    // jose's jwtVerify rejects tokens whose exp is <= the current time.
    await expect(verifyJwt(token)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cookie builder tests
// ---------------------------------------------------------------------------

describe("buildSessionCookie exact format", () => {
  test('returns the exact canonical Set-Cookie header for a session cookie', () => {
    const result = buildSessionCookie("test.jwt.token");
    expect(result).toBe(
      "wms_session=test.jwt.token; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800"
    );
  });
});

describe("buildClearCookie exact format", () => {
  test('returns the exact canonical Set-Cookie header for clearing the session cookie', () => {
    const result = buildClearCookie();
    expect(result).toBe(
      "wms_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
    );
  });
});
