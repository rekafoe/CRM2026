import { Database } from 'sqlite'

/** Процент оператора для произвольного калькулятора. Меняется со страницы «Проценты». */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS crm_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.run(
    `INSERT OR IGNORE INTO crm_settings (setting_key, setting_value, updated_at)
     VALUES ('custom_calculator_operator_percent', '17.5', datetime('now'))`,
  )
}

export async function down(_db: Database): Promise<void> {
  // Настройку не удаляем: её уже могли изменить вручную.
}
