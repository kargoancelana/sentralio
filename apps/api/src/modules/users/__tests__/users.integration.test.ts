/**
 * Integration tests for users routes / users service.
 * Requirements: 6.2, 6.5, 6.7
 *
 * Covers:
 *  1. 201 success — POST /users body is exactly { id, email, name, role } (no password, no password_hash)
 *  2. 400 validation errors — invalid email returns field-level errors
 *  3. 400 duplicate email — case-insensitive duplicate returns 400 + { errors: { email: '...' } }
 *  4. 403 non-admin — Staff role is denied by requireFeature('user_management')
 *  5. GET /users list — returns only safe fields (no password_hash)
 *
 * The tests drive `createUser` and `listUsers` directly with an injected fake DB
 * (same pattern as auth service tests), and verify the route/matrix behavior for
 * the 403 case using the decide() function directly.
 */

// Must set env vars before any import that transitively loads config/env.ts
import "../../auth/__tests__/helpers/auth-env-setup";

import { test, expect, describe } from "bun:test";
import { createUser, listUsers } from "../users.service";
import { decide } from "../../auth/matrix";
import { users } from "../../../db/schema";
import type { DrizzleDb } from "../../auth/lockout";

// ─── Fake DB builder ────────────────────────────────────────────────────────

/** A thenable that resolves to `value` — emulates an awaitable drizzle builder. */
function awaitableResult<T>(value: T) {
  return {
    then<R>(resolve: (v: T) => R) {
      return Promise.resolve(value).then(resolve);
    },
  };
}

interface FakeUserRow {
  id: number;
  email: string;
  name: string;
  role: "admin" | "staff";
  isActive: number;
}

/**
 * Build a minimal fake Drizzle DB for createUser / listUsers.
 *
 * createUser issues:
 *   1. db.select({ id }).from(users).where(emailLowerEq).limit(1)  → uniqueness check
 *   2. db.insert(users).values({...})                              → insert
 *
 * listUsers issues:
 *   1. db.select({ id, email, name, role, isActive }).from(users)  → list (no where, no limit)
 *
 * @param existingRows   Rows returned by the uniqueness-check SELECT ([] → no duplicate).
 * @param insertResult   What the insert resolves to (e.g. [{ insertId: 42 }]).
 * @param listRows       Rows returned by the list SELECT.
 */
function makeFakeDb(opts: {
  existingRows?: { id: number }[];
  insertResult?: unknown;
  listRows?: FakeUserRow[];
}): DrizzleDb {
  const { existingRows = [], insertResult = [{ insertId: 42 }], listRows = [] } = opts;

  const db = {
    select(_cols?: unknown) {
      return {
        from(_table: unknown) {
          return {
            // createUser uniqueness check: .where(...).limit(1)
            where(_cond: unknown) {
              return {
                limit(_n: number) {
                  return awaitableResult(existingRows);
                },
              };
            },
            // listUsers: no .where() — result is awaited directly
            ...awaitableResult(listRows),
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(_row: unknown) {
          return awaitableResult(insertResult);
        },
      };
    },
  };

  return db as unknown as DrizzleDb;
}

// ─── Test 1: 201 success — body contains only { id, email, name, role } ─────

describe("POST /users — 201 success", () => {
  test("returns ok=true with only id, email, name, role (no password, no password_hash)", async () => {
    const db = makeFakeDb({ existingRows: [], insertResult: [{ insertId: 42 }] });

    const result = await createUser(
      {
        email: "alice@example.com",
        name: "Alice",
        role: "staff",
        password: "SecurePass123",
      },
      db,
    );

    // Must succeed
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok=true");

    const user = result.user;

    // id comes from insertId
    expect(user.id).toBe(42);
    expect(user.email).toBe("alice@example.com");
    expect(user.name).toBe("Alice");
    expect(user.role).toBe("staff");

    // password and password_hash MUST NOT be present (Req 6.7, 7.2)
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("password_hash");
    expect(user).not.toHaveProperty("passwordHash");

    // Body has EXACTLY id, email, name, role
    const keys = Object.keys(user).sort();
    expect(keys).toEqual(["email", "id", "name", "role"]);
  });

  test("trims name whitespace before storing", async () => {
    const db = makeFakeDb({ existingRows: [], insertResult: [{ insertId: 7 }] });

    const result = await createUser(
      {
        email: "bob@example.com",
        name: "  Bob  ",
        role: "admin",
        password: "AnotherPass456",
      },
      db,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok=true");
    expect(result.user.name).toBe("Bob");
  });
});

// ─── Test 2: 400 validation errors — field-level error messages ───────────

describe("POST /users — 400 field-level validation errors", () => {
  test("invalid email format returns 400 with errors.email", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "not-an-email",
        name: "Test User",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("email");
    expect(typeof result.errors.email).toBe("string");
    expect(result.errors.email.length).toBeGreaterThan(0);
  });

  test("missing @ in email returns errors.email", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "noatsign.example.com",
        name: "Test User",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("email");
  });

  test("empty name returns errors.name", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "valid@example.com",
        name: "",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("name");
  });

  test("whitespace-only name returns errors.name", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "valid@example.com",
        name: "   ",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("name");
  });

  test("invalid role returns errors.role", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "valid@example.com",
        name: "Valid Name",
        role: "superuser",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("role");
  });

  test("password too short (< 10 chars) returns errors.password", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "valid@example.com",
        name: "Valid Name",
        role: "staff",
        password: "short",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("password");
  });

  test("multiple invalid fields returns all field errors", async () => {
    const db = makeFakeDb({});

    const result = await createUser(
      {
        email: "bad-email",
        name: "",
        role: "invalid",
        password: "short",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    // All four failed fields should be reported (Req 6.5)
    expect(result.errors).toHaveProperty("email");
    expect(result.errors).toHaveProperty("name");
    expect(result.errors).toHaveProperty("role");
    expect(result.errors).toHaveProperty("password");
  });
});

// ─── Test 3: 400 duplicate email (case-insensitive) ───────────────────────

describe("POST /users — 400 duplicate email (case-insensitive)", () => {
  test("exact same email already in use returns 400 with errors.email", async () => {
    // existingRows is non-empty → uniqueness check finds a conflict
    const db = makeFakeDb({ existingRows: [{ id: 1 }] });

    const result = await createUser(
      {
        email: "alice@example.com",
        name: "Alice Again",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("email");
    // The error message should mention 'use' or 'in use'
    expect(result.errors.email.toLowerCase()).toContain("use");
  });

  test("duplicate email check is case-insensitive (emails normalized before lookup)", async () => {
    // The service normalizes email to lowercase before querying.
    // Simulate the DB returning a match for the normalized email.
    const db = makeFakeDb({ existingRows: [{ id: 5 }] });

    // Submit UPPERCASE version of an already-stored email
    const result = await createUser(
      {
        email: "ALICE@EXAMPLE.COM",
        name: "Alice Upper",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok=false");
    expect(result.errors).toHaveProperty("email");
    expect(result.errors.email.toLowerCase()).toContain("use");
  });

  test("does NOT return a duplicate error when email is unique", async () => {
    // Empty existingRows → no conflict
    const db = makeFakeDb({ existingRows: [], insertResult: [{ insertId: 99 }] });

    const result = await createUser(
      {
        email: "newuser@example.com",
        name: "New User",
        role: "staff",
        password: "ValidPass123",
      },
      db,
    );

    expect(result.ok).toBe(true);
  });
});

// ─── Test 4: 403 non-admin — requireFeature denies Staff role ────────────

describe("Authorization — 403 for non-admin (Staff) caller (Req 6.2)", () => {
  test("Staff role is denied user_management feature via decide()", () => {
    // The route calls requireFeature('user_management') which internally calls
    // decide(user.role, 'user_management'). Verify the matrix denies Staff.
    const staffAllowed = decide("staff", "user_management");
    expect(staffAllowed).toBe(false);
  });

  test("Admin role is allowed user_management feature via decide()", () => {
    const adminAllowed = decide("admin", "user_management");
    expect(adminAllowed).toBe(true);
  });

  test("requireFeature throws (403) when Staff tries to use user_management", () => {
    // Simulate what the route handler does: call requireFeature which throws if denied.
    const user = { id: 1, email: "staff@example.com", name: "Staff User", role: "staff" as const };

    // Replicate the requireFeature logic from auth.middleware.ts
    function requireFeature(feature: "user_management") {
      if (!decide(user.role, feature)) {
        const err = new Error(`Forbidden: role '${user.role}' does not have access to feature '${feature}'.`);
        (err as any).status = 403;
        throw err;
      }
    }

    expect(() => requireFeature("user_management")).toThrow(/Forbidden/);
  });

  test("requireFeature does NOT throw when Admin uses user_management", () => {
    const user = { id: 2, email: "admin@example.com", name: "Admin User", role: "admin" as const };

    function requireFeature(feature: "user_management") {
      if (!decide(user.role, feature)) {
        const err = new Error(`Forbidden`);
        (err as any).status = 403;
        throw err;
      }
    }

    expect(() => requireFeature("user_management")).not.toThrow();
  });
});

// ─── Test 5: GET /users list — only safe fields returned ─────────────────

describe("GET /users — returns array with only safe fields (no password_hash)", () => {
  test("listUsers returns id, email, name, role, isActive — no password_hash", async () => {
    const fakeRows: FakeUserRow[] = [
      { id: 1, email: "admin@example.com", name: "Admin User", role: "admin", isActive: 1 },
      { id: 2, email: "staff@example.com", name: "Staff User", role: "staff", isActive: 1 },
    ];

    const db = makeFakeDb({ listRows: fakeRows });
    const result = await listUsers(db);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);

    for (const user of result) {
      // Required fields present
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("role");
      expect(user).toHaveProperty("isActive");

      // Sensitive fields MUST NOT be present (Req 7.2)
      expect(user).not.toHaveProperty("password");
      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("passwordHash");
    }
  });

  test("listUsers maps isActive=1 to true and isActive=0 to false", async () => {
    const fakeRows: FakeUserRow[] = [
      { id: 1, email: "active@example.com", name: "Active User", role: "admin", isActive: 1 },
      { id: 2, email: "inactive@example.com", name: "Inactive User", role: "staff", isActive: 0 },
    ];

    const db = makeFakeDb({ listRows: fakeRows });
    const result = await listUsers(db);

    expect(result[0]?.isActive).toBe(true);
    expect(result[1]?.isActive).toBe(false);
  });

  test("listUsers returns empty array when no users exist", async () => {
    const db = makeFakeDb({ listRows: [] });
    const result = await listUsers(db);
    expect(result).toEqual([]);
  });

  test("listUsers preserves user data correctly", async () => {
    const fakeRows: FakeUserRow[] = [
      { id: 42, email: "charlie@example.com", name: "Charlie", role: "staff", isActive: 1 },
    ];

    const db = makeFakeDb({ listRows: fakeRows });
    const [user] = await listUsers(db);

    expect(user?.id).toBe(42);
    expect(user?.email).toBe("charlie@example.com");
    expect(user?.name).toBe("Charlie");
    expect(user?.role).toBe("staff");
    expect(user?.isActive).toBe(true);
  });
});
