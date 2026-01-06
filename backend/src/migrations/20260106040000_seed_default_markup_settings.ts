import { Database } from 'sqlite'

/**
 * Заполняем базовые настройки наценок, чтобы вкладка "Наценки" в админке не была пустой.
 * Бэкенд и так использует дефолты (например base_markup=2.2), но UI должен показывать значения явно.
 */
export async function up(db: Database) {
  // Убедимся, что таблица существует (на всякий случай)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS markup_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_name TEXT NOT NULL UNIQUE,
      setting_value REAL NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Если таблица пустая — добавим стандартные записи
  const row = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM markup_settings`)
  const count = Number(row?.cnt ?? 0)
  if (count > 0) return

  const seeds: Array<{ name: string; value: number; description: string }> = [
    { name: 'base_markup', value: 2.2, description: 'Базовый множитель наценки (умножается на себестоимость)' },
    { name: 'rush_multiplier', value: 1.5, description: 'Множитель срочности' },
    { name: 'complexity_multiplier', value: 1.0, description: 'Множитель сложности' },
    { name: 'operation_price_multiplier', value: 1.0, description: 'Общий множитель стоимости операций' },
  ]

  for (const s of seeds) {
    await db.run(
      `INSERT OR IGNORE INTO markup_settings (setting_name, setting_value, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [s.name, s.value, s.description]
    )
  }
}

export async function down(db: Database) {
  await db.exec(`
    DELETE FROM markup_settings
    WHERE setting_name IN ('base_markup', 'rush_multiplier', 'complexity_multiplier', 'operation_price_multiplier');
  `)
}


