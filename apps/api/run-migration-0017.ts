import { db, pool } from './src/db/client';

async function runMigration() {
  try {
    console.log('Running migration 0017: Add label_data_json column...');
    
    await db.execute(`
      ALTER TABLE \`label_cache\` 
      ADD COLUMN \`label_data_json\` MEDIUMTEXT
    `);
    
    console.log('✅ Migration 0017 completed successfully!');
    console.log('Column label_data_json added to label_cache table');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column')) {
      console.log('⚠️  Column label_data_json already exists, skipping migration');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

runMigration();
