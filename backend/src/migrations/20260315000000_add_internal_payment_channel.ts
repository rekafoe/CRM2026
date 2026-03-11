import { Database } from 'sqlite';

/**
 * Добавляет payment_channel 'internal' (Внутренние работы):
 * - Не учитывается в кассе
 * - Не учитывается в ЗП оператора
 *
 * Используем orders_new (без orders_old) — меньше риска путаницы и ошибок.
 */
export async function up(db: Database): Promise<void> {
  // Восстановление после частично проваленной миграции
  const ordersExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'`);
  const ordersNewExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders_new'`);
  const ordersOldExists = await db.get(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders_old'`);

  if (!ordersExists && ordersNewExists) {
    await db.exec('ALTER TABLE orders_new RENAME TO orders');
    await db.exec('PRAGMA foreign_keys = ON');
    return;
  }
  if (!ordersExists && ordersOldExists) {
    // Старая версия миграции использовала orders_old — восстанавливаем и продолжаем
    await db.exec('ALTER TABLE orders_old RENAME TO orders');
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

  const newCreateSql = createSql.replace(oldCheck, newCheck).replace(/CREATE TABLE orders /i, 'CREATE TABLE orders_new ');

  await db.exec('PRAGMA foreign_keys = OFF');
  await db.exec(newCreateSql);

  const cols = await db.all<Array<{ name: string }>>(`PRAGMA table_info(orders)`);
  const colNames = (cols || []).map((c) => c.name).filter(Boolean);
  if (colNames.length === 0) {
    await db.exec('DROP TABLE IF EXISTS orders_new');
    await db.exec('PRAGMA foreign_keys = ON');
    return;
  }

  const colList = colNames.map((n) => `"${n}"`).join(', ');
  await db.exec(`INSERT INTO orders_new (${colList}) SELECT ${colList} FROM orders`);
  await db.exec('DROP TABLE orders');
  await db.exec('ALTER TABLE orders_new RENAME TO orders');
  await db.exec('PRAGMA foreign_keys = ON');
}

export async function down(db: Database): Promise<void> {
  // Откат не реализован — потребовал бы пересоздания таблицы
}
