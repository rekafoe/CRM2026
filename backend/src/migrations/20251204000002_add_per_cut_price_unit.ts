import { Database } from 'sqlite';
import { getDb } from '../db';

/**
 * Добавляет 'per_cut' в допустимые значения price_unit
 * 
 * Причина: Операции резки должны рассчитываться за рез с учетом стоп,
 * а не за каждый лист отдельно.
 * 
 * Контекст:
 * - Гильотина режет стопу листов (до 5 см высоты) за раз
 * - Для 50 листов при толщине 0.15 мм = 1 стопа = 5 резов (а не 250!)
 */

export async function up(db?: Database): Promise<void> {
  const database = db || await getDb();

  console.log('Добавляем per_cut в допустимые значения price_unit...');
  
  // SQLite не поддерживает ALTER COLUMN для CHECK constraint
  // Нужно пересоздать таблицу
  
  await database.exec('BEGIN TRANSACTION');
  
  try {
    // Проверяем: вдруг миграция уже применена (или constraint уже содержит per_cut)
    try {
      const master = await database.get<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='post_processing_services'"
      );
      if (master?.sql && master.sql.includes("'per_cut'")) {
        console.log('per_cut уже присутствует в схеме — пропускаем пересоздание таблицы');
        await database.exec('COMMIT');
        return;
      }
    } catch {}

    // 1. Создаем временную таблицу с новым CHECK constraint
    await database.exec(`
      CREATE TABLE post_processing_services_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        unit TEXT DEFAULT 'шт',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        operation_type TEXT CHECK(operation_type IN (
          'print', 'cut', 'fold', 'score', 'laminate', 'bind',
          'perforate', 'emboss', 'foil', 'varnish', 'package',
          'design', 'delivery', 'other'
        )) DEFAULT 'other',
        price_unit TEXT CHECK(price_unit IN (
          'per_sheet', 'per_item', 'per_m2', 'per_hour', 'fixed', 'per_order', 'per_cut'
        )) DEFAULT 'per_item',
        setup_cost REAL DEFAULT 0,
        min_quantity INTEGER DEFAULT 1,
        parameters TEXT
      )
    `);
    
    // 2. Копируем данные безопасно: только существующие колонки (без SELECT *)
    const oldCols = await database.all<Array<{ name: string }>>(`PRAGMA table_info(post_processing_services)`);
    const oldSet = new Set(oldCols.map(c => c.name));
    const newCols = await database.all<Array<{ name: string }>>(`PRAGMA table_info(post_processing_services_new)`);
    const common = newCols.map(c => c.name).filter(name => oldSet.has(name));

    if (common.length > 0) {
      await database.exec(`
        INSERT INTO post_processing_services_new (${common.join(', ')})
        SELECT ${common.join(', ')} FROM post_processing_services
      `);
    }
    
    // 3. Удаляем старую таблицу
    await database.exec(`DROP TABLE post_processing_services`);
    
    // 4. Переименовываем новую таблицу
    await database.exec(`
      ALTER TABLE post_processing_services_new 
      RENAME TO post_processing_services
    `);
    
    // 5. Обновляем операцию резки на правильную единицу измерения (если колонки существуют)
    const cols = await database.all<Array<{ name: string }>>(`PRAGMA table_info(post_processing_services)`);
    const hasUpdatedAt = cols.some(c => c.name === 'updated_at');
    await database.run(
      `
      UPDATE post_processing_services
         SET price_unit = 'per_cut'${hasUpdatedAt ? ", updated_at = datetime('now')" : ''}
       WHERE operation_type = 'cut' AND name LIKE '%Резка%'
      `
    );
    
    await database.exec('COMMIT');
    
    console.log('Схема обновлена: добавлен per_cut');
    console.log('Операция резки обновлена: price_unit = per_cut');
    
  } catch (error) {
    await database.exec('ROLLBACK');
    console.error('Ошибка миграции:', error);
    throw error;
  }
}

export async function down(db?: Database): Promise<void> {
  const database = db || await getDb();
  
  console.log('Откат: возвращаем price_unit = per_sheet для резки');
  
  await database.run(`
    UPDATE post_processing_services 
    SET 
      price_unit = 'per_sheet',
      updated_at = datetime('now')
    WHERE operation_type = 'cut'
  `);
  
  console.log('Откат выполнен (не рекомендуется!)');
}

