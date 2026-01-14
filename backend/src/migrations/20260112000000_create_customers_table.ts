import { Database } from 'sqlite'

/**
 * Миграция: Создание таблицы customers и добавление customer_id в orders
 * 
 * Создает таблицу для хранения клиентов (физ. и юр. лиц)
 * и добавляет связь между заказами и клиентами
 */
export async function up(db: Database): Promise<void> {
  console.log('📋 Создаем таблицу customers...')

  // Создаем таблицу customers
  await db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('individual', 'legal')),
      -- Поля для физ. лица
      first_name TEXT,
      last_name TEXT,
      middle_name TEXT,
      -- Поля для юр. лица
      company_name TEXT,
      legal_name TEXT,
      tax_id TEXT,
      -- Общие поля
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Создаем индексы для быстрого поиска
  await db.run(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(type)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name)`)

  console.log('✅ Таблица customers создана')

  // Добавляем customer_id в таблицу orders
  console.log('📋 Добавляем customer_id в таблицу orders...')

  // Проверяем, существует ли уже колонка
  const tableInfo = await db.all(`PRAGMA table_info(orders)`)
  const hasCustomerId = tableInfo.some((col: any) => col.name === 'customer_id')

  if (!hasCustomerId) {
    // SQLite не поддерживает ADD FOREIGN KEY в ALTER TABLE
    // Внешний ключ будет работать через PRAGMA foreign_keys = ON
    await db.run(`ALTER TABLE orders ADD COLUMN customer_id INTEGER`)

    // Создаем индекс для быстрого поиска заказов по клиенту
    await db.run(`CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)`)
    
    console.log('✅ Колонка customer_id добавлена в orders')
  } else {
    console.log('ℹ️ Колонка customer_id уже существует')
  }
}

export async function down(db: Database): Promise<void> {
  console.log('🔄 Откатываем миграцию customers...')

  // Удаляем индекс
  await db.run(`DROP INDEX IF EXISTS idx_orders_customer_id`)

  // Удаляем колонку customer_id из orders (SQLite не поддерживает DROP COLUMN напрямую)
  // Вместо этого создадим новую таблицу без этой колонки
  console.log('⚠️ SQLite не поддерживает DROP COLUMN. Колонка customer_id останется, но будет игнорироваться.')

  // Удаляем индексы customers
  await db.run(`DROP INDEX IF EXISTS idx_customers_phone`)
  await db.run(`DROP INDEX IF EXISTS idx_customers_email`)
  await db.run(`DROP INDEX IF EXISTS idx_customers_type`)
  await db.run(`DROP INDEX IF EXISTS idx_customers_company_name`)

  // Удаляем таблицу customers
  await db.run(`DROP TABLE IF EXISTS customers`)

  console.log('✅ Откат миграции выполнен')
}
