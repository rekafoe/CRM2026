import { initDB } from '../db'
import { hashPassword } from '../utils'
import { randomBytes } from 'crypto'

async function runMigrations(): Promise<void> {
  try {
    const db = await initDB()

    // Bootstrap admin user (Railway fresh DB) if users table is empty
    try {
      const row = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM users')
      const usersCount = Number(row?.c || 0)

      if (usersCount === 0) {
        const email = (process.env.ADMIN_EMAIL || '').trim()
        const password = (process.env.ADMIN_PASSWORD || '').trim()
        const name = (process.env.ADMIN_NAME || 'Администратор').trim()

        if (!email || !password) {
          console.log('⚠️ Users table is empty, but ADMIN_EMAIL/ADMIN_PASSWORD are not set. Login will return 401 until you set them in Railway Variables.')
        } else {
          const apiToken = randomBytes(24).toString('hex')
          await db.run(
            'INSERT INTO users (name, email, role, api_token, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, datetime(\'now\'))',
            name,
            email,
            'admin',
            apiToken,
            hashPassword(password)
          )
          console.log(`✅ Bootstrap admin created: ${email} (role=admin)`)
        }
      }
    } catch (e) {
      console.log('⚠️ Bootstrap admin skipped (users table not ready)', e)
    }

    await db.close()
    console.log('✅ Migrations executed successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exitCode = 1
  }
}

void runMigrations()

