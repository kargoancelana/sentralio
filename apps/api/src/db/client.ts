import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../config/env";
import * as schema from "./schema";

const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  connectionLimit: 10,
  // Tell mysql2 to convert JS Date <-> MySQL DATETIME using +07:00 (WIB).
  // Without this, mysql2 uses the API host's OS timezone for the conversion,
  // which is wrong on UTC hosts.
  timezone: '+07:00',
});

// Force every pooled connection to use WIB as its session time zone the moment
// it's acquired. The `timezone` pool option above only affects how mysql2 maps
// JS Date <-> column values — it does NOT change the SQL session time zone.
// That matters because raw SQL date-literal comparisons like
// `escrow_release_time >= '2026-04-01 00:00:00'` are interpreted in the SQL
// session time zone, which on a default install is `SYSTEM` and therefore the
// host OS time zone. If the host is UTC, the literal is read as UTC and
// matches the wrong rows. Setting `time_zone = '+07:00'` per connection makes
// raw SQL date-literal comparisons work in WIB consistently.
//
// Using `pool.on('connection')` runs once per physical connection (not per
// query), so the overhead is negligible.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+07:00'", (err) => {
    if (err) {
      console.warn('[db] Failed to set session time_zone to +07:00:', err.message);
    }
  });
});

export const db = drizzle(pool, { schema, mode: "default" });
export { pool };
