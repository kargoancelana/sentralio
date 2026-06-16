import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function run() {
  try {
    const content = fs.readFileSync(path.join(__dirname, '../../drizzle/0036_fast_jigsaw.sql'), 'utf8');
    const statements = content.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s);
    for (const stmt of statements) {
      await db.execute(sql.raw(stmt));
    }
    console.log('Migrated manually!');
  } catch (e: any) {
    console.error(e.message);
  }
  process.exit(0);
}
run();
