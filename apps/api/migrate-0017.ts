import { db, pool } from './src/db/client.ts';
import fs from 'fs';
import path from 'path';

async function up() {
  const sqlPath = path.join(__dirname, 'drizzle/0017_label_data_json_cache.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const stmts = sql.split('--> statement-breakpoint');
  for (const stmt of stmts) {
    if (stmt.trim()) {
      console.log('Executing:', stmt.trim());
      await db.execute(stmt.trim());
    }
  }
  console.log('Migration 0017 done!');
  pool.end();
}

up().catch(e => {
  console.error(e);
  pool.end();
});
