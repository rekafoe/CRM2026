import { Database } from 'sqlite';

/**
 * Миграция: Добавление поля print_settings в таблицу products
 * 
 * Это поле хранит настройки печати продукта в формате JSON:
 * {
 *   allowedTechnologies: string[], // коды технологий печати
 *   allowedColorModes: ('bw' | 'color')[], // разрешенные цветности
 *   allowedSides: (1 | 2)[] // разрешенные стороны: 1 - односторонняя, 2 - двухсторонняя
 * }
 */

export async function up(db: Database): Promise<void> {
  // Проверяем, существует ли колонка
  const columns = await db.all("PRAGMA table_info(products)");
  const hasPrintSettings = columns.some((col: any) => col.name === 'print_settings');
  
  if (!hasPrintSettings) {
    await db.exec(`
      ALTER TABLE products 
      ADD COLUMN print_settings TEXT
    `);
    console.log('✅ Добавлено поле print_settings в таблицу products');
  } else {
    console.log('ℹ️ Поле print_settings уже существует в таблице products');
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN напрямую
  // В реальном проекте нужно было бы пересоздать таблицу
  console.log('⚠️ SQLite не поддерживает DROP COLUMN. Поле print_settings оставлено в таблице.');
}

