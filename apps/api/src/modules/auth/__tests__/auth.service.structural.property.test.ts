/**
 * Property-based tests for Auth_Service pre-credential structural validation.
 *
 * Feature: user-authentication
 * Property 2: Pre-credential structural validation returns 400
 * Validates: Requirements 1.5
 *
 * For any request body that is not syntactically valid JSON, or is JSON missing
 * the `email` field or the `password` field, login() SHALL respond with
 * fail-400 and SHALL NOT perform any lockout check, user lookup, or bcrypt
 * comparison.
 *
 * We prove "no DB access occurred" by passing a `db` fake that THROWS on any
 * property access. If login returns fail-400 without that fake throwing, no
 * lockout check / user lookup / bcrypt comparison touched the data layer.
 */

import * as fc from "fast-check";
import { test, expect, beforeAll } from "bun:test";
import type { login as LoginFn } from "../auth.service";

// AUTH_JWT_SECRET must be a >= 32 byte value, and AUTH_ALLOWED_ORIGINS must
// have a valid entry, BEFORE the service module is loaded — importing it pulls
// in the env config which fail-fast validates these at load time. ES `import`
// statements are hoisted, so we set the env here and load `login` via a dynamic
// import (below) which runs only after these assignments have executed.
process.env.AUTH_JWT_SECRET =
  "test-secret-value-that-is-at-least-32-bytes-long-000000";
process.env.AUTH_ALLOWED_ORIGINS =
  process.env.AUTH_ALLOWED_ORIGINS ?? "https://example.com";

let login: typeof LoginFn;

beforeAll(async () => {
  ({ login } = await import("../auth.service"));
});

// ---------------------------------------------------------------------------
// Exploding DB fake — any property access throws, proving the structural
// validation path never touches the data layer.
// ---------------------------------------------------------------------------

const explodingDb = new Proxy(
  {},
  {
    get() {
      throw new Error("db must not be touched for structural 400");
    },
  },
) as any;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Random strings that are NOT valid JSON. We filter out anything that happens
 * to parse as JSON so the generator only yields genuinely malformed bodies.
 */
const nonJsonString = fc.string().filter((s) => {
  try {
    JSON.parse(s);
    return false;
  } catch {
    return true;
  }
});

/** Arbitrary JSON-ish scalar value used to populate present fields. */
const anyFieldValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

/**
 * Objects that are missing the `email` key but always have `password`, plus an
 * optional arbitrary extra key.
 */
const missingEmailObject = fc
  .record({
    password: anyFieldValue,
    extra: fc.option(anyFieldValue, { nil: undefined }),
  })
  .map((o) => {
    const { extra, ...rest } = o as Record<string, unknown>;
    return extra === undefined ? rest : { ...rest, extra };
  });

/**
 * Objects that are missing the `password` key but always have `email`, plus an
 * optional arbitrary extra key.
 */
const missingPasswordObject = fc
  .record({
    email: fc.constant("a@b.com"),
    extra: fc.option(anyFieldValue, { nil: undefined }),
  })
  .map((o) => {
    const { extra, ...rest } = o as Record<string, unknown>;
    return extra === undefined ? rest : { ...rest, extra };
  });

/** Non-object JSON values: numbers, arrays, null, booleans, strings. */
const nonObjectJsonValue = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.array(anyFieldValue),
  fc.constant(null),
  fc.boolean(),
  fc.string(),
);

const fakeInput = (rawBody: unknown) => ({
  rawBody,
  ip: "127.0.0.1",
  now: new Date("2024-01-01T00:00:00Z"),
  db: explodingDb,
});

// ---------------------------------------------------------------------------
// Property 2: Pre-credential structural validation returns 400
// ---------------------------------------------------------------------------

test("Property 2 [non-JSON string]: malformed JSON body returns fail-400 'json' without touching the db", async () => {
  // Feature: user-authentication, Property 2: Pre-credential structural validation returns 400
  await fc.assert(
    fc.asyncProperty(nonJsonString, async (rawBody) => {
      const result = await login(fakeInput(rawBody));
      expect(result.kind).toBe("fail-400");
      expect(result).toEqual({ kind: "fail-400", reason: "json" });
    }),
    { numRuns: 100 },
  );
});

test("Property 2 [missing email]: JSON without `email` returns fail-400 'missing' without touching the db", async () => {
  // Feature: user-authentication, Property 2: Pre-credential structural validation returns 400
  await fc.assert(
    fc.asyncProperty(
      missingEmailObject,
      fc.boolean(),
      async (obj, asString) => {
        const rawBody = asString ? JSON.stringify(obj) : obj;
        const result = await login(fakeInput(rawBody));
        expect(result.kind).toBe("fail-400");
        expect(result).toEqual({ kind: "fail-400", reason: "missing" });
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 2 [missing password]: JSON without `password` returns fail-400 'missing' without touching the db", async () => {
  // Feature: user-authentication, Property 2: Pre-credential structural validation returns 400
  await fc.assert(
    fc.asyncProperty(
      missingPasswordObject,
      fc.boolean(),
      async (obj, asString) => {
        const rawBody = asString ? JSON.stringify(obj) : obj;
        const result = await login(fakeInput(rawBody));
        expect(result.kind).toBe("fail-400");
        expect(result).toEqual({ kind: "fail-400", reason: "missing" });
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 2 [non-object JSON]: number/array/null/boolean JSON returns fail-400 'json' without touching the db", async () => {
  // Feature: user-authentication, Property 2: Pre-credential structural validation returns 400
  await fc.assert(
    fc.asyncProperty(nonObjectJsonValue, async (value) => {
      // Pass as a JSON string so the parse step yields the non-object value.
      const rawBody = JSON.stringify(value);
      const result = await login(fakeInput(rawBody));
      expect(result.kind).toBe("fail-400");
      expect(result).toEqual({ kind: "fail-400", reason: "json" });
    }),
    { numRuns: 100 },
  );
});
