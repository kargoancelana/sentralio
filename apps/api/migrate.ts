import { db, pool } from './src/db/client.ts';
import fs from 'fs';

async function up() {
  const sql = fs.readFileSync('drizzle/0014_label_url_to_text.sql', 'utf8');
  const stmts = sql.split('--> statement-breakpoint');
  for (const stmt of stmts) {
    if (stmt.trim()) {
      console.log('Executing:', stmt.trim());
      await db.execute(stmt.trim());
    }
  }
  console.log('Migration 0014 done!');
  pool.end();
}

up().catch(e => {
  console.error(e);
  pool.end();
});
