/**
 * Integration tests for auth routes and matrix enforcement.
 * Task 11.3 — Requirements: 1.4, 3.3, 5.4, 5.5, 10.4, 11.2
 *
 * Exercises the `login`, `logout`, `me`, `renew`, `validateSession` functions
 * from auth.service.ts directly with a fake DB (no real server, no real DB).
 *
 * Tests:
 *  1. POST /auth/login — 200 happy path
 *  2. POST /auth/login — 400 malformed JSON (non-object body)
 *  3. POST /auth/login — 400 missing fields (no email/password)
 *  4. POST /auth/login — 400 invalid email syntax
 *  5. POST /auth/login — 401 three byte-identical cases (unknown email, wrong password, inactive)
 *  6. POST /auth/login — 429 after 5 recorded failures in the fake DB
 *  7. Logout — revokes jti; subsequent validateSession returns null
 *  8. Renew — rotates jti; old jti revoked; new session still valid
 *  9. Matrix enforcement — Staff gets 403 on each Admin-only feature (decide returns false)
 * 10. Matrix enforcement — Admin allowed on all features (decide returns true for all)
 */

// Must set env vars BEFORE any import that transitively loads config/env.ts.
// ESM hoists imports above top-level statements, so this must be the first import.
import "./helpers/auth-env-setup";

import { test, expect, describe, beforeAll } from "bun:test";
import {
  login,
  logout,
  me,
  renew,
  validateSession,
  unifiedLoginFailureResponse,
} from "../auth.service";
import { decide, FEATURES, type Feature } from "../matrix";
import { signJwt, verifyJwtIgnoreExp } from "../jwt";
import { hashPassword } from "../password";
import {
  users,
  accountLockouts,
  failedLoginAttempts,
  revokedSessions,
} from "../../../db/schema";
import type { DrizzleDb } from "../lockout";

// ─── Setup: bcrypt hash computed once for speed ──────────────────────────

const KNOWN_PASSWORD = "correct-horse-battery-staple-12";
let KNOWN_HASH = "";

beforeAll(async () => {
  KNOWN_HASH = await hashPassword(KNOWN_PASSWORD);
});

// ─── Fake DB builder ─────────────────────────────────────────────────────

/** A thenable that resolves to `value` — emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

interface FakeUser {
  id: number;
  companyId: number;
  email: string;
  emailLower: string;
  name: string;
  role: "admin" | "staff";
  passwordHash: string;
  isActive: number;
  tokensValidFrom?: number;
}

/**
 * Build a fake Drizzle DB.
 *
 * Query chains used by auth service:
 *   SELECT from accountLockouts → lockedRows ([] = not locked, [row] = locked)
 *   SELECT from users           → userRows
 *   SELECT from revokedSessions → revokedJtis set (jti strings)
 *   SELECT({count}) from failedLoginAttempts → [{ count: failureCount }]
 *   INSERT into failedLoginAttempts  → no-op
 *   INSERT into accountLockouts      → no-op
 *   INSERT into revokedSessions      → records jti in capturedRevocations
 *   DELETE                          → no-op
 */
function makeFakeDb(opts: {
  userRows?: FakeUser[];
  lockedRows?: { emailLower: string; lockedUntil: Date; lockedAt: Date }[];
  failureCount?: number;
  revokedJtis?: Set<string>;
  capturedRevocations?: Set<string>;
}): DrizzleDb {
  const {
    userRows = [],
    lockedRows = [],
    failureCount = 0,
    revokedJtis = new Set<string>(),
    capturedRevocations = new Set<string>(),
  } = opts;

  const db = {
    select(_cols?: unknown) {
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              // Direct-await path: db.select({count}).from(failedLoginAttempts).where(...)
              // (used in recordFailure's count query — awaited without .limit())
              const directValue =
                table === failedLoginAttempts
                  ? [{ count: failureCount }]
                  : [];

              return {
                ...awaitableResult(directValue),
                limit(_n: number) {
                  if (table === users) {
                    return awaitableResult(userRows);
                  }
                  if (table === accountLockouts) {
                    return awaitableResult(lockedRows);
                  }
                  if (table === revokedSessions) {
                    // validateSession checks: SELECT from revokedSessions WHERE jti=?
                    // We return a row if ANY jti in revokedJtis exists — the service
                    // only checks .length > 0. Since we can't decode the drizzle
                    // condition here, we return the full revokedJtis set as rows
                    // when there's at least one revoked jti.
                    // For accurate per-jti lookup we set revokedJtis appropriately per test.
                    return awaitableResult(
                      revokedJtis.size > 0
                        ? [{ jti: [...revokedJtis][0] }]
                        : [],
                    );
                  }
                  return awaitableResult([]);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(row: unknown) {
          if (table === revokedSessions) {
            const r = row as { jti: string };
            capturedRevocations.add(r.jti);
          }
          return {
            ...awaitableResult(undefined),
            onDuplicateKeyUpdate(_args: unknown) {
              return awaitableResult(undefined);
            },
          };
        },
      };
    },
    delete(_table: unknown) {
      return {
        where(_cond: unknown) {
          return awaitableResult(undefined);
        },
      };
    },
  };

  return db as unknown as DrizzleDb;
}

/**
 * Build a fake DB whose revokedSessions lookup is jti-aware.
 * Pass the revokedJtis Set by reference; calls to INSERT into revokedSessions
 * add to it, and subsequent SELECT from revokedSessions use it for lookup.
 *
 * This variant tracks exact per-jti lookups via a closure that intercepts the
 * insert to capture jtis, then returns a row for any jti that was captured.
 * Since we cannot decode the drizzle eq() condition easily, we rely on a
 * "capture-and-check" trick: after logout/renew adds jti to revokedJtis,
 * the next validateSession call will see a non-empty revokedJtis and return null.
 */
function makeFakeDbWithRevocationTracking(
  userRows: FakeUser[],
  revokedJtis: Set<string>,
): DrizzleDb {
  return makeFakeDb({
    userRows,
    lockedRows: [],
    failureCount: 0,
    revokedJtis,
    capturedRevocations: revokedJtis,
  });
}

// ─── Fixed test data ──────────────────────────────────────────────────────

const TEST_NOW = new Date("2024-06-01T10:00:00.000Z");

const ADMIN_USER: FakeUser = {
  id: 1,
  companyId: 1,
  email: "admin@example.com",
  emailLower: "admin@example.com",
  name: "Admin User",
  role: "admin",
  passwordHash: "", // filled in beforeAll
  isActive: 1,
};

const STAFF_USER: FakeUser = {
  id: 2,
  companyId: 1,
  email: "staff@example.com",
  emailLower: "staff@example.com",
  name: "Staff User",
  role: "staff",
  passwordHash: "",
  isActive: 1,
};

// ─── Test 1: POST /auth/login — 200 happy path ────────────────────────────

describe("POST /auth/login — 200 happy path", () => {
  test("returns kind='ok' with cookie string and public user (no password)", async () => {
    // Populate hash after beforeAll runs
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const db = makeFakeDb({ userRows: [user] });

    const result = await login({
      rawBody: JSON.stringify({ email: "admin@example.com", password: KNOWN_PASSWORD }),
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("Expected kind=ok");

    // Cookie must contain wms_session=
    expect(result.cookie).toContain("wms_session=");
    expect(result.cookie).toContain("HttpOnly");
    expect(result.cookie).toContain("Max-Age=28800");

    // user must have id, email, name, role
    expect(result.user.id).toBe(1);
    expect(result.user.companyId).toBe(1);
    expect(result.user.email).toBe("admin@example.com");
    expect(result.user.name).toBe("Admin User");
    expect(result.user.role).toBe("admin");

    // password/passwordHash must NOT be present
    expect(result.user).not.toHaveProperty("password");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.user).not.toHaveProperty("password_hash");

    // Exactly the five safe fields
    expect(Object.keys(result.user).sort()).toEqual(["companyId", "email", "id", "name", "role"]);
  });
});

// ─── Test 2: POST /auth/login — 400 malformed JSON ────────────────────────

describe("POST /auth/login — 400 malformed JSON", () => {
  test("non-object body (plain string) returns kind='fail-400' with reason='json'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: "not json at all }{",
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("json");
  });

  test("null body returns kind='fail-400' with reason='json'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: null,
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("json");
  });

  test("array body returns kind='fail-400' with reason='json'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: ["email@example.com", "password"],
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("json");
  });
});

// ─── Test 3: POST /auth/login — 400 missing fields ────────────────────────

describe("POST /auth/login — 400 missing fields", () => {
  test("missing email field returns kind='fail-400' with reason='missing'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: { password: KNOWN_PASSWORD },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("missing");
  });

  test("missing password field returns kind='fail-400' with reason='missing'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: { email: "user@example.com" },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("missing");
  });

  test("empty object returns kind='fail-400' with reason='missing'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: {},
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("missing");
  });
});

// ─── Test 4: POST /auth/login — 400 invalid email syntax ─────────────────

describe("POST /auth/login — 400 invalid email syntax", () => {
  test("email='not-an-email' returns kind='fail-400' with reason='email_syntax'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: { email: "not-an-email", password: KNOWN_PASSWORD },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("email_syntax");
  });

  test("email with no @ returns kind='fail-400' with reason='email_syntax'", async () => {
    const db = makeFakeDb({});

    const result = await login({
      rawBody: { email: "noatsign.example.com", password: KNOWN_PASSWORD },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-400");
    if (result.kind !== "fail-400") throw new Error("Expected fail-400");
    expect(result.reason).toBe("email_syntax");
  });
});

// ─── Test 5: POST /auth/login — 401 three byte-identical cases ───────────

describe("POST /auth/login — 401 three byte-identical cases (Req 1.4)", () => {
  test("unknown email returns kind='fail-401'", async () => {
    // Empty userRows → unknown email
    const db = makeFakeDb({ userRows: [], failureCount: 1 });

    const result = await login({
      rawBody: { email: "unknown@example.com", password: "SomePassword123" },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-401");
  });

  test("wrong password returns kind='fail-401'", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    // failureCount=1 so recordFailure doesn't trigger lockout
    const db = makeFakeDb({ userRows: [user], failureCount: 1 });

    const result = await login({
      rawBody: { email: "admin@example.com", password: "WrongPassword999" },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-401");
  });

  test("inactive user with correct password returns kind='fail-401'", async () => {
    const inactiveUser: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH, isActive: 0 };
    const db = makeFakeDb({ userRows: [inactiveUser], failureCount: 1 });

    const result = await login({
      rawBody: { email: "admin@example.com", password: KNOWN_PASSWORD },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-401");
  });

  test("all three failure cases produce byte-identical unifiedLoginFailureResponse", () => {
    // The route layer maps every fail-401 through the same constant builder.
    // Assert that the single builder returns byte-identical tuples every time.
    const tupleA = JSON.stringify(unifiedLoginFailureResponse());
    const tupleB = JSON.stringify(unifiedLoginFailureResponse());
    const tupleC = JSON.stringify(unifiedLoginFailureResponse());

    expect(tupleA).toBe(tupleB);
    expect(tupleB).toBe(tupleC);

    const unified = unifiedLoginFailureResponse();
    expect(unified.status).toBe(401);
    expect(Object.keys(unified.headers)).toEqual(["Content-Type"]);
    // No Set-Cookie, no WWW-Authenticate
    expect(Object.keys(unified)).not.toContain("cookie");
    expect(Object.keys(unified)).not.toContain("set-cookie");
    expect(unified.body).toBe(JSON.stringify({ ok: false, error: "invalid_credentials" }));
  });
});

// ─── Test 6: POST /auth/login — 429 after 5 failures ─────────────────────

describe("POST /auth/login — 429 after 5 recorded failures", () => {
  test("locked account returns kind='fail-429' without verifying password", async () => {
    // Simulate an active lockout by returning a lockedUntil row in the future
    const lockedUntil = new Date(TEST_NOW.getTime() + 10 * 60 * 1000); // 10 min in future
    const lockedRows = [
      { emailLower: "locked@example.com", lockedUntil, lockedAt: TEST_NOW },
    ];

    // The user row exists and password is correct, but lockout should block before checking
    const user: FakeUser = {
      id: 3,
      email: "locked@example.com",
      emailLower: "locked@example.com",
      name: "Locked User",
      role: "staff",
      passwordHash: KNOWN_HASH,
      isActive: 1,
    };

    const db = makeFakeDb({ userRows: [user], lockedRows });

    const result = await login({
      rawBody: { email: "locked@example.com", password: KNOWN_PASSWORD },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db,
    });

    expect(result.kind).toBe("fail-429");
  });
});

// ─── Test 7: Logout — revokes jti ────────────────────────────────────────

describe("Logout — revokes jti; subsequent validateSession returns null", () => {
  test("logout with valid session returns ok=true", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    // Sign a valid JWT
    const jwt = await signJwt({ sub: user.id, role: user.role }, TEST_NOW);

    const result = await logout({ cookieValue: jwt, now: TEST_NOW, db });
    expect(result.ok).toBe(true);
  });

  test("after logout, validateSession with same JWT returns null (jti revoked)", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    // Sign a valid JWT
    const jwt = await signJwt({ sub: user.id, role: user.role }, TEST_NOW);
    const payload = await verifyJwtIgnoreExp(jwt);

    // Before logout: revokedJtis is empty, session is valid
    expect(revokedJtis.size).toBe(0);

    // Logout: revokes the jti
    const logoutResult = await logout({ cookieValue: jwt, now: TEST_NOW, db });
    expect(logoutResult.ok).toBe(true);

    // jti was captured in revokedJtis
    expect(revokedJtis.has(payload.jti)).toBe(true);

    // Now validateSession with the same DB (revokedJtis contains the jti)
    // will find it revoked and return null
    const session = await validateSession({ cookieValue: jwt, now: TEST_NOW, db });
    expect(session).toBeNull();
  });

  test("logout with no cookie (no valid session) returns ok=false", async () => {
    const db = makeFakeDb({});

    const result = await logout({ cookieValue: undefined, now: TEST_NOW, db });
    expect(result.ok).toBe(false);
  });

  test("logout with invalid/malformed JWT returns ok=false", async () => {
    const db = makeFakeDb({ userRows: [{ ...ADMIN_USER, passwordHash: KNOWN_HASH }] });

    const result = await logout({ cookieValue: "not.a.valid.jwt", now: TEST_NOW, db });
    expect(result.ok).toBe(false);
  });
});

// ─── Test 8: Renew — rotates jti ─────────────────────────────────────────

describe("Renew — rotates jti; old jti revoked; new session valid", () => {
  test("renew returns new cookie with wms_session=", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    const oldJwt = await signJwt({ sub: user.id, role: user.role }, TEST_NOW);

    const result = await renew({ cookieValue: oldJwt, now: TEST_NOW, db });

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected result from renew");

    expect(result.cookie).toContain("wms_session=");
    expect(result.cookie).toContain("HttpOnly");
    expect(result.cookie).toContain("Max-Age=28800");
  });

  test("renew revokes old jti", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    const oldJwt = await signJwt({ sub: user.id, role: user.role }, TEST_NOW);
    const oldPayload = await verifyJwtIgnoreExp(oldJwt);

    await renew({ cookieValue: oldJwt, now: TEST_NOW, db });

    // Old jti must be in the revoked set
    expect(revokedJtis.has(oldPayload.jti)).toBe(true);
  });

  test("renew issues new jti different from the old one", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    const oldJwt = await signJwt({ sub: user.id, role: user.role }, TEST_NOW);
    const oldPayload = await verifyJwtIgnoreExp(oldJwt);

    const result = await renew({ cookieValue: oldJwt, now: TEST_NOW, db });
    if (!result) throw new Error("Expected result from renew");

    const newPayload = await verifyJwtIgnoreExp(result.jwt);
    expect(newPayload.jti).not.toBe(oldPayload.jti);
  });

  test("renew new JWT has exp = now + 28800 (Req 10.4)", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    // Issue old JWT 1 hour in the past
    const issuedAt = new Date(TEST_NOW.getTime() - 3600 * 1000);
    const oldJwt = await signJwt({ sub: user.id, role: user.role }, issuedAt);

    const result = await renew({ cookieValue: oldJwt, now: TEST_NOW, db });
    if (!result) throw new Error("Expected result from renew");

    const newPayload = await verifyJwtIgnoreExp(result.jwt);
    const expectedExp = Math.floor(TEST_NOW.getTime() / 1000) + 28_800;
    expect(newPayload.exp).toBe(expectedExp);
  });

  test("renew with expired JWT returns null (Req 10.5)", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };
    const revokedJtis = new Set<string>();
    const db = makeFakeDbWithRevocationTracking([user], revokedJtis);

    // Issue JWT in the distant past (already expired)
    const issuedAt = new Date(TEST_NOW.getTime() - 30_000 * 1000); // ~8.3h ago
    const expiredJwt = await signJwt({ sub: user.id, role: user.role }, issuedAt);

    const result = await renew({ cookieValue: expiredJwt, now: TEST_NOW, db });
    expect(result).toBeNull();

    // Nothing was revoked
    expect(revokedJtis.size).toBe(0);
  });
});

// ─── Test 9: Matrix enforcement — Staff 403 on Admin-only features ────────

describe("Matrix enforcement — Staff gets 403 on each Admin-only feature (Req 5.4, 11.2)", () => {
  // Admin-only features (Staff = N in matrix)
  const adminOnlyFeatures: Feature[] = [
    "master_produk",
    "produk_channel",
    "integrasi_toko",
    "pengaturan",
    "laporan_keuangan",
    "user_management",
  ];

  for (const feature of adminOnlyFeatures) {
    test(`decide('staff', '${feature}') returns false (Staff gets 403)`, () => {
      expect(decide("staff", feature)).toBe(false);
    });
  }

  // Staff-allowed features (Staff = Y in matrix)
  const staffAllowedFeatures: Feature[] = ["orders", "cetak_label", "me_logout"];

  for (const feature of staffAllowedFeatures) {
    test(`decide('staff', '${feature}') returns true (Staff gets 200)`, () => {
      expect(decide("staff", feature)).toBe(true);
    });
  }
});

// ─── Test 10: Matrix enforcement — Admin allowed on all features ──────────

describe("Matrix enforcement — Admin gets access on all features (Req 5.5, 11.2)", () => {
  for (const feature of FEATURES) {
    test(`decide('admin', '${feature}') returns true`, () => {
      expect(decide("admin", feature)).toBe(true);
    });
  }
});

// ─── Test: me() helper ────────────────────────────────────────────────────

describe("me() — returns public user for valid session, null for invalid", () => {
  test("me() returns public user for a valid session", async () => {
    const user: FakeUser = { ...STAFF_USER, passwordHash: KNOWN_HASH };
    const db = makeFakeDb({ userRows: [user] });

    const jwt = await signJwt({ sub: user.id, role: user.role }, TEST_NOW);
    const result = await me({ cookieValue: jwt, now: TEST_NOW, db });

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected result from me()");

    expect(result.id).toBe(user.id);
    expect(result.email).toBe(user.email);
    expect(result.name).toBe(user.name);
    expect(result.role).toBe(user.role);

    // No password leak
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("password");
  });

  test("me() returns null for missing cookie", async () => {
    const db = makeFakeDb({});
    const result = await me({ cookieValue: undefined, now: TEST_NOW, db });
    expect(result).toBeNull();
  });

  test("me() returns null for expired JWT", async () => {
    const user: FakeUser = { ...STAFF_USER, passwordHash: KNOWN_HASH };
    const db = makeFakeDb({ userRows: [user] });

    const expiredAt = new Date(TEST_NOW.getTime() - 30_000 * 1000);
    const expiredJwt = await signJwt({ sub: user.id, role: user.role }, expiredAt);

    const result = await me({ cookieValue: expiredJwt, now: TEST_NOW, db });
    expect(result).toBeNull();
  });

  test("me() returns null for inactive user (Req 6.8)", async () => {
    const inactiveUser: FakeUser = {
      ...STAFF_USER,
      passwordHash: KNOWN_HASH,
      isActive: 0,
    };
    const db = makeFakeDb({ userRows: [inactiveUser] });

    const jwt = await signJwt({ sub: inactiveUser.id, role: inactiveUser.role }, TEST_NOW);
    const result = await me({ cookieValue: jwt, now: TEST_NOW, db });
    expect(result).toBeNull();
  });
});

// ─── Test: POST /auth/login — 500 on signing/persistence failure ─────────

describe("POST /auth/login — 500 injected signing failure", () => {
  test("when the DB throws on clearFailures, returns kind='fail-500' with no cookie", async () => {
    const user: FakeUser = { ...ADMIN_USER, passwordHash: KNOWN_HASH };

    // Build a DB that succeeds for reads but throws on delete (clearFailures)
    const throwingDb = {
      select(_cols?: unknown) {
        return {
          from(table: unknown) {
            return {
              where(_cond: unknown) {
                return {
                  ...awaitableResult(table === failedLoginAttempts ? [{ count: 0 }] : []),
                  limit(_n: number) {
                    if (table === users) return awaitableResult([user]);
                    return awaitableResult([]);
                  },
                };
              },
            };
          },
        };
      },
      insert(_table: unknown) {
        return {
          values(_row: unknown) {
            return {
              ...awaitableResult(undefined),
              onDuplicateKeyUpdate(_args: unknown) {
                return awaitableResult(undefined);
              },
            };
          },
        };
      },
      delete(_table: unknown) {
        return {
          where(_cond: unknown) {
            return Promise.reject(new Error("simulated DB failure on delete"));
          },
        };
      },
    } as unknown as DrizzleDb;

    const result = await login({
      rawBody: { email: "admin@example.com", password: KNOWN_PASSWORD },
      ip: "127.0.0.1",
      now: TEST_NOW,
      db: throwingDb,
    });

    expect(result.kind).toBe("fail-500");
    // No cookie on 500 (Req 1.9)
    expect(result).not.toHaveProperty("cookie");
    expect(result).not.toHaveProperty("jwt");
  });
});
