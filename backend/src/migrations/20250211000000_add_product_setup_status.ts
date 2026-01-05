import { Database } from 'sqlite';

/**
 * Миграция: Добавление статуса настройки продукта
 * 
 * Статусы:
 * - draft: Черновик (только создан)
 * - materials_configured: Материалы настроены
 * - operations_configured: Операции настроены
 * - ready: Готов к использованию (полная конфигурация)
 * 
 * Продукт может быть активирован (is_active=1) только в статусе 'ready'
 */
export async function up(db: Database): Promise<void> {
  // Проверяем, есть ли уже колонка
  const columns = await db.all(`PRAGMA table_info(products)`);
  const hasSetupStatus = columns.some((col: any) => col.name === 'setup_status');
  
  if (!hasSetupStatus) {
    await db.exec(`
      ALTER TABLE products 
      ADD COLUMN setup_status TEXT 
      CHECK (setup_status IN ('draft', 'materials_configured', 'operations_configured', 'ready'))
      DEFAULT 'draft'
    `);
    
    console.log('✅ Добавлена колонка setup_status в таблицу products');
  }

  // Создаём таблицу для отслеживания этапов настройки
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_setup_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      step TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      validated_by INTEGER,
      validation_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(validated_by) REFERENCES users(id),
      UNIQUE(product_id, step)
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_setup_product 
    ON product_setup_checklist(product_id)
  `);

  console.log('✅ Создана таблица product_setup_checklist');

  // Обновляем статус существующих продуктов на основе их конфигурации
  await db.exec(`
    UPDATE products 
    SET setup_status = 
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM product_operations_link 
          WHERE product_operations_link.product_id = products.id
        ) THEN 'ready'
        WHEN EXISTS (
          SELECT 1 FROM product_material_rules 
          WHERE product_material_rules.product_type = products.product_type
        ) THEN 'materials_configured'
        ELSE 'draft'
      END
    WHERE setup_status IS NULL OR setup_status = 'draft'
  `);

  console.log('✅ Обновлены статусы существующих продуктов');
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN, поэтому оставляем как есть
  await db.exec(`DROP TABLE IF EXISTS product_setup_checklist`);
  console.log('✅ Удалена таблица product_setup_checklist');
}

