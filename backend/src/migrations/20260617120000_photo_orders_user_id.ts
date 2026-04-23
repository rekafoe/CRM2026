import { Database } from 'sqlite';

type ColumnInfo = { name: string };

async function ensureColumn(db: Database, table: string, name: string, ddl: string): Promise<void> {
  const columns = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[];
  if (columns.some((c) => c.name === name)) return;
  await db.exec(ddl);
}

/** Как у orders.userId: исполнитель / взявший заказ из пула */
export async function up(db: Database): Promise<void> {
  await ensureColumn(db, 'photo_orders', 'userId', 'ALTER TABLE photo_orders ADD COLUMN userId INTEGER');
}

export async function down(_db: Database): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite column drop not applied');
}
