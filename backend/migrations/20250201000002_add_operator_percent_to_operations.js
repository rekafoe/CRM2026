/**
 * Миграция: Добавление поля operator_percent в таблицу post_processing_services
 * Дата: 2025-02-01
 */

async function up(db) {
  // Проверяем, существует ли уже колонка
  const columns = await db.all(`PRAGMA table_info('post_processing_services')`);
  const hasOperatorPercent = columns.some((column) => column.name === 'operator_percent');
  
  if (!hasOperatorPercent) {
    await db.run(`
      ALTER TABLE post_processing_services
      ADD COLUMN operator_percent REAL DEFAULT 0
    `);
    console.log('✅ Добавлена колонка operator_percent в post_processing_services');
  } else {
    console.log('ℹ️ Колонка operator_percent уже существует');
  }
}

async function down(db) {
  // SQLite не поддерживает DROP COLUMN напрямую
  // Нужно пересоздать таблицу
  const columns = await db.all(`PRAGMA table_info('post_processing_services')`);
  const hasOperatorPercent = columns.some((column) => column.name === 'operator_percent');
  
  if (hasOperatorPercent) {
    console.log('⚠️ SQLite не поддерживает DROP COLUMN. Для отката миграции нужно пересоздать таблицу вручную.');
  }
}

module.exports = { up, down };
