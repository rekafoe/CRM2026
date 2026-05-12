/**
 * Журнал доступа к файлам заказа.
 * Фиксирует скачивания локальных файлов и выдачу ссылок на внешнее хранилище.
 */

export async function up(db: any): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS order_file_access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      fileId INTEGER NOT NULL,
      userId INTEGER,
      action TEXT NOT NULL,
      storage TEXT,
      ip TEXT,
      userAgent TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(fileId) REFERENCES order_files(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
    )
  `)
  await db.exec('CREATE INDEX IF NOT EXISTS idx_order_file_access_logs_order ON order_file_access_logs(orderId, createdAt)')
  await db.exec('CREATE INDEX IF NOT EXISTS idx_order_file_access_logs_file ON order_file_access_logs(fileId, createdAt)')
  await db.exec('CREATE INDEX IF NOT EXISTS idx_order_file_access_logs_user ON order_file_access_logs(userId, createdAt)')
}

export async function down(_db: any): Promise<void> {
  console.log('ℹ️ down() skipped: SQLite table is left in place')
}
