import { initDB } from '../db'
import { hashPassword } from '../utils'
import { randomBytes } from 'crypto'

async function ensureOrderStatuses(db: any): Promise<void> {
  // Канонические статусы, которые рисует фронт (ProgressBar / dropdown)
  const statuses = [
    { name: 'Ожидает', color: '#9e9e9e', sort_order: 1 },
    { name: 'Оформлен', color: '#1976d2', sort_order: 2 },
    { name: 'Принят в работу', color: '#5c6bc0', sort_order: 3 },
    { name: 'Выполнен', color: '#2e7d32', sort_order: 4 },
    { name: 'Передан в ПВЗ', color: '#ffa000', sort_order: 5 },
    { name: 'Получен в ПВЗ', color: '#7b1fa2', sort_order: 6 },
    { name: 'Завершён', color: '#1b5e20', sort_order: 7 }
  ]

  // Миграция старых названий в новые (чтобы не плодить дубли на уже “засеянной” БД)
  const renameMap: Array<{ from: string; to: string }> = [
    { from: 'Новый', to: 'Ожидает' },
    { from: 'В производстве', to: 'Принят в работу' },
    { from: 'Готов к отправке', to: 'Выполнен' },
    { from: 'Отправлен', to: 'Передан в ПВЗ' },
  ]

  for (const m of renameMap) {
    try {
      const existsTo = await db.get('SELECT id FROM order_statuses WHERE name = ?', m.to)
      if (existsTo) continue
      await db.run('UPDATE order_statuses SET name = ? WHERE name = ?', m.to, m.from)
    } catch {}
  }

  for (const s of statuses) {
    await db.run(
      'INSERT OR IGNORE INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)',
      s.name,
      s.color,
      s.sort_order
    )

    // Обновляем только если реально отличаются (чтобы не писать в БД на каждом рестарте)
    const existing = await db.get('SELECT color, sort_order FROM order_statuses WHERE name = ?', s.name) as { color?: string; sort_order?: number } | undefined
    const sameColor = (existing?.color ?? null) === (s.color ?? null)
    const sameSort = Number(existing?.sort_order ?? -1) === Number(s.sort_order)
    if (!sameColor || !sameSort) {
      await db.run(
        'UPDATE order_statuses SET color = ?, sort_order = ? WHERE name = ?',
        s.color,
        s.sort_order,
        s.name
      )
    }
  }

  const row = await db.get('SELECT COUNT(1) as c FROM order_statuses') as { c?: number } | undefined
  const count = Number(row?.c || 0)
  console.log(`✅ Order statuses ensured (bootstrap): ${count}`)
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

