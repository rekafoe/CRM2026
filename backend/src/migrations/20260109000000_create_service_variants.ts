import { Database } from 'sqlite'

/**
 * Создает таблицу service_variants для хранения вариантов услуг
 * (например, ламинация: глянец 32 мкм, мат 50 мкм и т.д.)
 */
export async function up(db: Database): Promise<void> {
  console.log('Creating service_variants table...')
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS service_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      variant_name TEXT NOT NULL,
      parameters TEXT, -- JSON с параметрами варианта (type, density и т.д.)
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE
    )
  `)
  
  // Создаем индекс для быстрого поиска по service_id
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_service_variants_service_id 
    ON service_variants(service_id)
  `)
  
  // Добавляем variant_id в service_volume_prices для связи tiers с вариантами
  // Если variant_id NULL - tier относится к услуге (простая услуга)
  // Если variant_id указан - tier относится к варианту (сложная услуга)
  try {
    await db.exec(`
      ALTER TABLE service_volume_prices 
      ADD COLUMN variant_id INTEGER REFERENCES service_variants(id) ON DELETE CASCADE
    `)
    console.log('Added variant_id column to service_volume_prices')
  } catch (error: any) {
    if (error.message?.includes('duplicate column')) {
      console.log('variant_id column already exists, skipping...')
    } else {
      throw error
    }
  }
  
  // Создаем индекс для быстрого поиска по variant_id
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_service_volume_prices_variant_id 
    ON service_volume_prices(variant_id)
  `)
  
  console.log('service_variants table created')
}

export async function down(db: Database): Promise<void> {
  console.log('Dropping service_variants table...')
  await db.exec(`DROP TABLE IF EXISTS service_variants`)
  console.log('service_variants table dropped')
}

