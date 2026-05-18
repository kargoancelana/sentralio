import { db, pool } from './src/db/client.ts';
import fs from 'fs';

async function up() {
  const sql = fs.readFileSync('drizzle/0015_shop_contact_info.sql', 'utf8');
  const stmts = sql.split(';').filter(s => s.trim());
  for (const stmt of stmts) {
    if (stmt.trim()) {
      console.log('Executing:', stmt.trim());
      await db.execute(stmt.trim());
    }
  }
  console.log('Migration 0015 done!');
  pool.end();
}

up().catch(e => {
  console.error(e);
  pool.end();
});
