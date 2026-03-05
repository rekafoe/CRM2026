import { Database } from 'sqlite';

/**
 * Шаблоны бланка заказа по организациям.
 * Если шаблон задан — используется он. Иначе fallback на встроенный HTML.
 * work_schedule в organizations — для плейсхолдера {{companySchedule}}.
 */
export async function up(db: Database): Promise<void> {
  const tables = (await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'")) as Array<{ name: string }>;
  if (tables.length === 0) return;

  const orgCols = (await db.all("PRAGMA table_info('organizations')")) as Array<{ name: string }>;
  if (!orgCols.some((c) => c.name === 'work_schedule')) {
    await db.exec(`ALTER TABLE organizations ADD COLUMN work_schedule TEXT`);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_blank_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      html_content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_order_blank_templates_org ON order_blank_templates(organization_id)`);
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_order_blank_templates_org');
  await db.exec('DROP TABLE IF EXISTS order_blank_templates');
}
