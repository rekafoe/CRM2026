import { initDB } from '../db'
import { hashPassword } from '../utils'
import { randomBytes } from 'crypto'

async function ensureOrderStatuses(db: any): Promise<void> {
  const row = await db.get('SELECT COUNT(1) as c FROM order_statuses') as { c?: number } | undefined
  const count = Number(row?.c || 0)
  if (count > 0) return

  const statuses = [
    { name: 'Новый', color: '#9e9e9e', sort_order: 1 },
    { name: 'В производстве', color: '#1976d2', sort_order: 2 },
    { name: 'Готов к отправке', color: '#ffa000', sort_order: 3 },
    { name: 'Отправлен', color: '#7b1fa2', sort_order: 4 },
    { name: 'Завершён', color: '#2e7d32', sort_order: 5 }
  ]

  for (const s of statuses) {
    await db.run(
      'INSERT OR IGNORE INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)',
      s.name,
      s.color,
      s.sort_order
    )
  }
  console.log('✅ Order statuses seeded (bootstrap)')
}

async function runMigrations(): Promise<void> {
  try {
    const db = await initDB()

    // Ensure base reference data exists
    try {
      await ensureOrderStatuses(db)
    } catch (e) {
      console.log('⚠️ Order statuses bootstrap skipped', e)
    }

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

