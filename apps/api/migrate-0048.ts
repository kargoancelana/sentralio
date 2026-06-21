import { db, pool } from './src/db/client.ts';
import fs from 'fs';

// Idempotent runner untuk migration 0048 (multi-tenancy).
// Baca drizzle/0048_multitenancy.sql, eksekusi statement-by-statement,
// skip error "already applied" supaya aman di-rerun.
async function up() {
  const raw = fs.readFileSync('drizzle/0048_multitenancy.sql', 'utf8');
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
        console.log('  ⚠ Column already exists, skipping');
      } else if (msg.includes('Duplicate key name')) {
        console.log('  ⚠ Index already exists, skipping');
      } else if (msg.includes('Duplicate foreign key constraint name')) {
        console.log('  ⚠ Foreign key already exists, skipping');
      } else if (msg.includes('Multiple primary key defined')) {
        console.log('  ⚠ Primary key already defined, skipping');
      } else if (
        msg.includes('check that column/key exists') ||
        msg.includes("Can't DROP") ||
        msg.includes('needed in a foreign key constraint') ||
        msg.includes('Cannot drop index')
      ) {
        console.log('  ⚠ Key/index to drop does not exist or is needed by constraint, skipping');
      } else if (msg.includes('already exists')) {
        console.log('  ⚠ Object already exists, skipping');
      } else {
        throw e;
      }
    }
  }
  console.log('\n✅ Migration 0048 done!');
  pool.end();
}

up().catch((e) => {
  console.error('❌ Migration failed:', e.message);
  pool.end();
  process.exit(1);
});
