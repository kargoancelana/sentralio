/**
 * Unit tests for username helpers + login identifier detection (Fase 1.4).
 *
 * The pure helper tests are DB-free. The login() routing tests use an
 * "exploding" db proxy to prove that syntax validation happens BEFORE any DB
 * access (mirrors auth.service.structural.property.test.ts).
 */

import "./helpers/auth-env-setup";

import { test, expect, describe } from "bun:test";
import { normalizeUsername, isValidUsernameSyntax } from "../username";
import { login } from "../auth.service";

// Exploding db — any property access throws, proving no DB work happened.
const explodingDb = new Proxy(
  {},
  {
    get() {
      throw new Error("db must not be touched for a structural 400");
    },
  },
) as any;

const fakeInput = (rawBody: unknown) => ({
  rawBody,
  ip: "127.0.0.1",
  now: new Date("2024-01-01T00:00:00Z"),
  db: explodingDb,
});

describe("normalizeUsername", () => {
  test("trims surrounding whitespace and folds to lowercase", () => {
    expect(normalizeUsername("  Alice.01  ")).toBe("alice.01");
    expect(normalizeUsername("BOB_99")).toBe("bob_99");
  });
});

describe("isValidUsernameSyntax", () => {
  test("accepts letters, digits, underscore and dot (3–32 chars)", () => {
    expect(isValidUsernameSyntax("alice")).toBe(true);
    expect(isValidUsernameSyntax("a.b_c.123")).toBe(true);
    expect(isValidUsernameSyntax("ABC")).toBe(true);
    expect(isValidUsernameSyntax("a".repeat(32))).toBe(true);
  });

  test("rejects too short, too long, spaces, '@', and other symbols", () => {
    expect(isValidUsernameSyntax("ab")).toBe(false);            // < 3
    expect(isValidUsernameSyntax("a".repeat(33))).toBe(false);  // > 32
    expect(isValidUsernameSyntax("has space")).toBe(false);
    expect(isValidUsernameSyntax("has@at")).toBe(false);
    expect(isValidUsernameSyntax("bad-dash")).toBe(false);
    expect(isValidUsernameSyntax("")).toBe(false);
  });
});

describe("login identifier detection (pre-DB 400 routing)", () => {
  test("invalid username identifier returns fail-400 'username_syntax' without touching the db", async () => {
    const result = await login(fakeInput({ identifier: "bad name", password: "whatever" }));
    expect(result).toEqual({ kind: "fail-400", reason: "username_syntax" });
  });

  test("too-short username identifier returns fail-400 'username_syntax'", async () => {
    const result = await login(fakeInput({ identifier: "ab", password: "whatever" }));
    expect(result).toEqual({ kind: "fail-400", reason: "username_syntax" });
  });

  test("identifier containing '@' is routed to email validation ('email_syntax' when malformed)", async () => {
    const result = await login(fakeInput({ identifier: "not@valid", password: "whatever" }));
    expect(result).toEqual({ kind: "fail-400", reason: "email_syntax" });
  });

  test("missing both identifier and email returns fail-400 'missing'", async () => {
    const result = await login(fakeInput({ password: "whatever" }));
    expect(result).toEqual({ kind: "fail-400", reason: "missing" });
  });
});
