import { db, pool } from './src/db/client';
import { sql } from 'drizzle-orm';

async function wipe() {
  try {
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0;`);
    await db.execute(sql`TRUNCATE TABLE products;`);
    await db.execute(sql`TRUNCATE TABLE product_groups;`);
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1;`);
    console.log('Tables wiped successfully.');
  } catch (err) {
    console.error('Error wiping tables:', err);
  } finally {
    pool.end();
  }
}

wipe();
