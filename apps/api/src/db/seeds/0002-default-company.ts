/**
 * Seed: Default Company (id=1)
 *
 * Inserts the default company row that will own all pre-multi-tenant data
 * once company_id columns are added in Issue 0.3.
 *
 * IDEMPOTENT — safe to run multiple times. If a row with id=1 already
 * exists, this script skips the insert and exits cleanly.
 *
 * Usage:
 *   bun run apps/api/src/db/seeds/0002-default-company.ts
 *
 * Or from the api workspace:
 *   bun run src/db/seeds/0002-default-company.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env from monorepo root (5 levels up: seeds→db→src→api→apps→root)
config({ path: resolve(import.meta.dir, "../../../../..", ".env") });
config(); // fallback: .env in cwd

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { companies } from "../schema";

const DEFAULT_COMPANY = {
  id: 1,
  name: "Company Utama",
  slug: "company-utama",
  status: "active" as const,
};

async function seed() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 2,
    timezone: "+07:00",
  });

  const db = drizzle(pool, { schema, mode: "default" });

  try {
    // Check if id=1 already exists — idempotency guard
    const existing = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, DEFAULT_COMPANY.id))
      .limit(1);

    if (existing.length > 0) {
      console.log(
        `[seed] companies id=1 already exists ("${existing[0].name}") — skipping insert. No changes made.`
      );
      return;
    }

    await db.insert(companies).values(DEFAULT_COMPANY);

    console.log(
      `[seed] ✅ Inserted companies id=${DEFAULT_COMPANY.id} name="${DEFAULT_COMPANY.name}" slug="${DEFAULT_COMPANY.slug}" status="${DEFAULT_COMPANY.status}"`
    );
  } finally {
    await pool.end();
  }
}

seed().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[seed] ❌ Failed: ${message}`);
  process.exit(1);
});
