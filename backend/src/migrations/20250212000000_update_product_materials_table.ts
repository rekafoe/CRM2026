import { Database } from 'sqlite';

/**
 * Миграция: Обновление структуры таблицы product_materials
 * 
 * Меняем старую структуру (presetCategory, presetDescription) 
 * на новую (product_id, material_id)
 */
export async function up(db: Database): Promise<void> {
  // Проверяем текущую структуру
  const columns = await db.all(`PRAGMA table_info(product_materials)`);
  const hasOldStructure = columns.some((col: any) => col.name === 'presetCategory');
  
  if (hasOldStructure) {
    console.log('Migrating product_materials table to new structure...');
    
    // Сохраняем старые данные
    const oldData = await db.all(`SELECT * FROM product_materials`);
    
    // Удаляем старую таблицу
    await db.exec(`DROP TABLE IF EXISTS product_materials`);
    
    // Создаём новую таблицу с правильной структурой
    await db.exec(`
      CREATE TABLE product_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        material_id INTEGER NOT NULL,
        qty_per_sheet REAL NOT NULL DEFAULT 1.0,
        is_required INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
        UNIQUE(product_id, material_id)
      )
    `);
    
    // Создаём индексы
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_materials_product 
      ON product_materials(product_id)
    `);
    
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_materials_material 
      ON product_materials(material_id)
    `);
    
    console.log('product_materials table updated to new structure');
    console.log(`   Old records: ${oldData.length} (not migrated, old schema incompatible)`);
  } else {
    // Таблица уже имеет новую структуру, проверяем наличие всех колонок
    const hasProductId = columns.some((col: any) => col.name === 'product_id');
    
    if (!hasProductId) {
      console.log('Unexpected table structure, recreating...');
      
      await db.exec(`DROP TABLE IF EXISTS product_materials`);
      
      await db.exec(`
        CREATE TABLE product_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          material_id INTEGER NOT NULL,
          qty_per_sheet REAL NOT NULL DEFAULT 1.0,
          is_required INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
          UNIQUE(product_id, material_id)
        )
      `);
      
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_product_materials_product 
        ON product_materials(product_id)
      `);
      
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_product_materials_material 
        ON product_materials(material_id)
      `);
      
      console.log('product_materials table created with correct structure');
    } else {
      console.log('product_materials table already has correct structure');
    }
  }
}

export async function down(db: Database): Promise<void> {
  // Rollback - возвращаем старую структуру (не рекомендуется)
  console.log('Rollback not recommended - keeping new structure');
}

