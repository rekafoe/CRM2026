import { Database } from 'sqlite';

/**
 * Добавляет payment_channel для учёта заказов в кассе:
 * - cash: учитывается в кассе (наличные/карта)
 * - invoice: счёт (безнал), не в кассе, учитывается в клиенте
 * - not_cashed: не пробивался по кассе
 */
export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('orders')`);
  const hasPaymentChannel = (columns as any[]).some((c) => c.name === 'payment_channel');
  if (!hasPaymentChannel) {
    await db.exec(`
      ALTER TABLE orders
      ADD COLUMN payment_channel TEXT CHECK(payment_channel IN ('cash','invoice','not_cashed')) DEFAULT 'cash'
    `);
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN напрямую — оставляем пустым или создаём новую таблицу
  // Для отката в продакшене потребуется отдельная логика
}
