import { db } from '../db/client';
import { sql } from 'drizzle-orm';
async function run() {
  try {
    const rows = await db.execute(sql`SELECT * FROM __drizzle_migrations ORDER BY id DESC LIMIT 5`);
    console.log(rows[0]);
  } catch (e: any) {
    console.error(e.message);
  }
  process.exit(0);
}
run();
