import { db, pool } from './src/db/client.ts';
import fs from 'fs';

async function up() {
  const sql = fs.readFileSync('drizzle/0018_order_items_item_model_id.sql', 'utf8');
  const stmts = sql.split('\n').filter(line => line.trim() && !line.trim().startsWith('--'));
  for (const stmt of stmts) {
    if (stmt.trim()) {
      console.log('Executing:', stmt.trim());
      try {
        await db.execute(stmt.trim());
        console.log('  ✓ OK');
      } catch (e: any) {
        if (e.message?.includes('Duplicate column name') || e.message?.includes('Duplicate key name')) {
          console.log('  ⚠ Already exists, skipping');
        } else {
          throw e;
        }
      }
    }
  }
  console.log('\n✅ Migration 0018 done!');
  pool.end();
}

up().catch(e => {
  console.error('❌ Migration failed:', e.message);
  pool.end();
  process.exit(1);
});
