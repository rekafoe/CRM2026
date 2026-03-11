import { Database } from 'sqlite';

/**
 * Добавляет payment_channel 'internal' (Внутренние работы):
 * - Не учитывается в кассе
 * - Не учитывается в ЗП оператора
 */
export async function up(db: Database): Promise<void> {
  // Восстановление после частично проваленной миграции: orders_old есть, orders нет
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  const ordersOldExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders_old'`);
  if (!ordersExists && ordersOldExists) {
    await db.exec('ALTER TABLE orders_old RENAME TO orders');
    // Продолжаем миграцию — ниже добавим internal в CHECK
  }

  const row = await db.get<{ sql?: string | null }>(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'`
  );
  const createSql = row?.sql || '';

  const oldCheck1 = "CHECK(payment_channel IN ('cash','invoice','not_cashed'))";
  const oldCheck2 = "CHECK (payment_channel IN ('cash','invoice','not_cashed'))";
  const newCheck = "CHECK(payment_channel IN ('cash','invoice','not_cashed','internal'))";
  if (createSql.includes("'internal'")) return;

  const oldCheck = createSql.includes(oldCheck1) ? oldCheck1 : createSql.includes(oldCheck2) ? oldCheck2 : null;
  if (!oldCheck) return;

  const newCreateSql = createSql.replace(oldCheck, newCheck);

  await db.exec('PRAGMA foreign_keys = OFF');
  await db.exec('ALTER TABLE orders RENAME TO orders_old');
  await db.exec(newCreateSql);

  const cols = await db.all<Array<{ name: string }>>(`PRAGMA table_info(orders_old)`);
  const colNames = (cols || []).map((c) => c.name).filter(Boolean);
  if (colNames.length === 0) {
    await db.exec('DROP TABLE IF EXISTS orders');
    await db.exec('ALTER TABLE orders_old RENAME TO orders');
    await db.exec('PRAGMA foreign_keys = ON');
    return;
  }

  const colList = colNames.map((n) => `"${n}"`).join(', ');
  await db.exec(`INSERT INTO orders (${colList}) SELECT ${colList} FROM orders_old`);
  await db.exec('DROP TABLE orders_old');
  await db.exec('PRAGMA foreign_keys = ON');
}

export async function down(db: Database): Promise<void> {
  // Откат не реализован — потребовал бы пересоздания таблицы
}
