/**
 * Миграция: Исправление внешнего ключа service_id в service_volume_prices
 * 
 * Проблема: service_id ссылался на service_prices(id), но должен ссылаться на post_processing_services(id)
 * 
 * Решение: Пересоздаем таблицу с правильным внешним ключом
 */

import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  console.log('Fixing foreign key constraint in service_volume_prices...');
  
  // Отключаем проверку внешних ключей
  await db.exec('PRAGMA foreign_keys = OFF;');
  
  try {
    // Создаем временную таблицу с правильной структурой
    await db.exec(`
      CREATE TABLE IF NOT EXISTS service_volume_prices_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        variant_id INTEGER,
        min_quantity INTEGER NOT NULL,
        price_per_unit REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
        FOREIGN KEY(variant_id) REFERENCES service_variants(id) ON DELETE CASCADE
      )
    `);
    
    // Копируем данные из старой таблицы
    await db.exec(`
      INSERT INTO service_volume_prices_new 
      (id, service_id, variant_id, min_quantity, price_per_unit, is_active, created_at, updated_at)
      SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active, created_at, updated_at
      FROM service_volume_prices
    `);
    
    // Удаляем старую таблицу
    await db.exec('DROP TABLE IF EXISTS service_volume_prices');
    
    // Переименовываем новую таблицу
    await db.exec('ALTER TABLE service_volume_prices_new RENAME TO service_volume_prices');
    
    // Создаем индексы
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_service_volume_prices_variant_id 
      ON service_volume_prices(variant_id)
    `);
    
    console.log('Foreign key constraint fixed successfully');
  } finally {
    // Включаем проверку внешних ключей обратно
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

export async function down(db: Database): Promise<void> {
  // Откат миграции - возвращаем старую структуру
  console.log('Rolling back foreign key constraint fix...');
  
  await db.exec('PRAGMA foreign_keys = OFF;');
  
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS service_volume_prices_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        variant_id INTEGER,
        min_quantity INTEGER NOT NULL,
        price_per_unit REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(service_id) REFERENCES service_prices(id) ON DELETE CASCADE,
        FOREIGN KEY(variant_id) REFERENCES service_variants(id) ON DELETE CASCADE
      )
    `);
    
    await db.exec(`
      INSERT INTO service_volume_prices_old 
      (id, service_id, variant_id, min_quantity, price_per_unit, is_active, created_at, updated_at)
      SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active, created_at, updated_at
      FROM service_volume_prices
    `);
    
    await db.exec('DROP TABLE IF EXISTS service_volume_prices');
    await db.exec('ALTER TABLE service_volume_prices_old RENAME TO service_volume_prices');
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}
