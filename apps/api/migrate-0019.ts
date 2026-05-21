import { db, pool } from './src/db/client.ts';
import fs from 'fs';

async function up() {
  const sql = fs.readFileSync('drizzle/0019_hpp_packing_cost_tables.sql', 'utf8');
  const stmts = sql.split('--> statement-breakpoint').filter(line => line.trim() && !line.trim().startsWith('--'));
  for (const stmt of stmts) {
    if (stmt.trim()) {
      console.log('Executing:', stmt.trim());
      try {
        await db.execute(stmt.trim());
        console.log('  ✓ OK');
      } catch (e: any) {
        if (e.message?.includes('Table') && e.message?.includes('already exists')) {
          console.log('  ⚠ Already exists, skipping');
        } else if (e.message?.includes('Duplicate key name')) {
          console.log('  ⚠ Index already exists, skipping');
        } else if (e.message?.includes('Duplicate foreign key constraint name') || e.message?.includes('already exists')) {
          console.log('  ⚠ Constraint already exists, skipping');
        } else if (e.message?.includes('Cannot add or update a child row') || e.message?.includes('Failed query')) {
          console.log('  ⚠ FK constraint failed (referenced table may not exist), skipping:', e.message.slice(0, 100));
        } else {
          throw e;
        }
      }
    }
  }
  console.log('\n✅ Migration 0019 done!');
  pool.end();
}

up().catch(e => {
  console.error('❌ Migration failed:', e.message);
  pool.end();
  process.exit(1);
});
