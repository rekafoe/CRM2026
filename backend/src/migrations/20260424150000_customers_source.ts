import { Database } from 'sqlite';

type ColumnInfo = { name: string };

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[];
  if (columns.some((c) => c.name === name)) return;
  await db.exec(ddl);
}

/**
 * Источник клиента: crm | website | telegram | mini_app (для статистики и отчётов).
 */
export async function up(db: Database): Promise<void> {
  await ensureColumn(
    db,
    'customers',
    'source',
    `ALTER TABLE customers ADD COLUMN source TEXT`
  );
  await db.run(`UPDATE customers SET source = 'crm' WHERE source IS NULL OR trim(source) = ''`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_customers_source ON customers(source)');
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite column drop not applied');
}
