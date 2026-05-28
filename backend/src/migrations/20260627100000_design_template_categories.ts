import { Database } from 'sqlite'

const SEED = ['Свадьба', 'Дети', 'Love story', 'Выпускной', 'Семья', 'Праздники', 'Разное']

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS design_template_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_template_categories_sort ON design_template_categories(sort_order, name)',
  )

  for (let i = 0; i < SEED.length; i += 1) {
    await db.run(
      'INSERT OR IGNORE INTO design_template_categories (name, sort_order) VALUES (?, ?)',
      [SEED[i], i],
    )
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_design_template_categories_sort')
  await db.exec('DROP TABLE IF EXISTS design_template_categories')
}
