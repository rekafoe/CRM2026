import { Database } from 'sqlite'

/**
 * Гарантируем наличие и активность базовых markup_settings.
 * Нужна, если таблица есть, но записи отсутствуют/деактивированы — UI показывает пусто.
 */
export async function up(db: Database) {
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
    // Если запись есть, но выключена/без описания — активируем и заполняем description
    await db.run(
      `UPDATE markup_settings
       SET
         is_active = 1,
         description = COALESCE(description, ?),
         updated_at = datetime('now')
       WHERE setting_name = ? AND (is_active IS NULL OR is_active = 0)`,
      [s.description, s.name]
    )
  }
}

export async function down(db: Database) {
  // Не удаляем существующие настройки — только "вежливо" выключаем наши дефолты, если они совпадают по имени
  await db.exec(`
    UPDATE markup_settings
    SET is_active = 0, updated_at = datetime('now')
    WHERE setting_name IN ('base_markup', 'rush_multiplier', 'complexity_multiplier', 'operation_price_multiplier');
  `)
}


