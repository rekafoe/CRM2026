import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, columnDefinition: string): Promise<void> {
  const colName = columnDefinition.split(/\s+/)[0]
  const columns = await db.all(`PRAGMA table_info('${table}')`)
  const hasCol = (columns as Array<{ name: string }>).some((c) => c.name === colName)
  if (hasCol) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`)
}

/**
 * Точки (departments): code/address для самовывоза и сайта;
 * orders.fulfillment_department_id — точка исполнения заказа.
 */
export async function up(db: Database): Promise<void> {
  await addColumnIfMissing(db, 'departments', 'code TEXT')
  await addColumnIfMissing(db, 'departments', 'address TEXT')
  await addColumnIfMissing(db, 'departments', 'is_pickup_point INTEGER NOT NULL DEFAULT 0')
  await addColumnIfMissing(db, 'departments', 'is_active INTEGER NOT NULL DEFAULT 1')

  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code ON departments (code) WHERE code IS NOT NULL AND code != ''`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_departments_pickup ON departments (is_pickup_point, is_active)`)

  // Seed / ensure основная точка самовывоза
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM departments WHERE code = ? LIMIT 1`,
    ['pickup-gikalo']
  )
  if (!existing) {
    const byName = await db.get<{ id: number }>(
      `SELECT id FROM departments WHERE name LIKE '%Дзержинск%' OR name LIKE '%Гикало%' LIMIT 1`
    )
    if (byName) {
      await db.run(
        `UPDATE departments
         SET code = ?, address = COALESCE(NULLIF(address, ''), ?), is_pickup_point = 1, is_active = 1
         WHERE id = ?`,
        ['pickup-gikalo', 'г. Минск, пр. Дзержинского 3б', byName.id]
      )
    } else {
      await db.run(
        `INSERT INTO departments (name, description, sort_order, code, address, is_pickup_point, is_active, created_at)
         VALUES (?, ?, 0, ?, ?, 1, 1, datetime('now'))`,
        [
          'Проспект Дзержинского 3б',
          'Основная точка самовывоза',
          'pickup-gikalo',
          'г. Минск, пр. Дзержинского 3б',
        ]
      )
    }
  } else {
    await db.run(
      `UPDATE departments
       SET address = COALESCE(NULLIF(address, ''), ?), is_pickup_point = 1, is_active = 1
       WHERE id = ?`,
      ['г. Минск, пр. Дзержинского 3б', existing.id]
    )
  }

  await addColumnIfMissing(db, 'orders', 'fulfillment_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL')
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_department_id ON orders (fulfillment_department_id)`
  )

  // Backfill из delivery_json (kind=pickup + providerId)
  const pickupDeptsRaw = await db.all<{ id: number; code: string }>(
    `SELECT id, code FROM departments WHERE code IS NOT NULL AND TRIM(code) != ''`
  )
  const pickupDepts = Array.isArray(pickupDeptsRaw) ? pickupDeptsRaw : []
  for (const dept of pickupDepts) {
    await db.run(
      `UPDATE orders
       SET fulfillment_department_id = ?
       WHERE fulfillment_department_id IS NULL
         AND delivery_json IS NOT NULL
         AND json_extract(delivery_json, '$.kind') = 'pickup'
         AND json_extract(delivery_json, '$.providerId') = ?`,
      [dept.id, dept.code]
    )
  }
}

export async function down(_db: Database): Promise<void> {
  // SQLite: колонки не удаляем
}
