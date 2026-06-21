import { db, pool } from './src/db/client.ts';
import fs from 'fs';

async function up() {
  const raw = fs.readFileSync('drizzle/0047_password_reset_tokens.sql', 'utf8');
  const stmts = raw
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((stmt) => stmt.length > 0);

  for (const stmt of stmts) {
    console.log('Executing:', stmt);
    try {
      await db.execute(stmt);
      console.log('  ✓ OK');
    } catch (e: any) {
      const msg = e?.cause?.message ?? e?.message ?? '';
      if (msg.includes('Duplicate column name')) {
        console.log('   Column already exists, skipping');
      } else if (msg.includes('Duplicate key name')) {
        console.log('   Index already exists, skipping');
      } else if (msg.includes('already exists')) {
        console.log('   Table already exists, skipping');
      } else {
        throw e;
      }
    }
  }
  console.log('\n✅ Migration 0047 done!');
  pool.end();
}

up().catch((e) => {
  console.error('❌ Migration failed:', e.message);
  pool.end();
  process.exit(1);
});
