import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, columnDef: string): Promise<void> {
  const [colName] = columnDef.split(' ').filter(Boolean)
  const cols = await db.all<{ name: string }>(`PRAGMA table_info(${table})`)
  if (cols.some((c) => c.name === colName)) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`)
}

/**
 * Добавляем централизованную цену «автоматической резки» (резка стопой по раскладке).
 * Используется в SimplifiedPricingService, когда в продукте включена опция «Резка».
 */
export async function up(db: Database) {
  await addColumnIfMissing(db, 'markup_settings', 'description TEXT')
  await db.run(
    `INSERT OR IGNORE INTO markup_settings (setting_name, setting_value, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
    'auto_cutting_price',
    0,
    'Цена за рез стопой (руб) — для автоматической резки по раскладке в упрощённом калькуляторе. 0 = брать цену из услуги резки.'
  )
  const desc = 'Цена за рез стопой (руб) — для автоматической резки по раскладке в упрощённом калькуляторе. 0 = брать цену из услуги резки.'
  await db.run(
    `UPDATE markup_settings
     SET is_active = 1, description = COALESCE(description, ?), updated_at = datetime('now')
     WHERE setting_name = 'auto_cutting_price'`,
    desc
  )
}

export async function down(db: Database) {
  await db.run(
    `UPDATE markup_settings SET is_active = 0, updated_at = datetime('now') WHERE setting_name = 'auto_cutting_price'`
  )
}
