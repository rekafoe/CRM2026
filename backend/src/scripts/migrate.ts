import { initDB } from '../db'

async function runMigrations(): Promise<void> {
  try {
    const db = await initDB()
    await db.close()
    console.log('✅ Migrations executed successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exitCode = 1
  }
}

void runMigrations()

