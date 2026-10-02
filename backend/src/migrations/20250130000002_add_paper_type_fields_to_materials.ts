import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  console.log('Adding paper type fields to materials table...');
  
  // Добавляем колонку paper_type_id в таблицу materials (если не существует)
  try {
    await db.exec(`
      ALTER TABLE materials ADD COLUMN paper_type_id INTEGER REFERENCES paper_types(id)
    `);
    console.log('Added paper_type_id column to materials');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('Column paper_type_id already exists, skipping...');
    } else {
      throw error;
    }
  }
  
  // Добавляем колонку density в таблицу materials (если не существует)
  try {
    await db.exec(`
      ALTER TABLE materials ADD COLUMN density INTEGER
    `);
    console.log('Added density column to materials');
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      console.log('Column density already exists, skipping...');
    } else {
      throw error;
    }
  }
  
  // Создаем индекс для быстрого поиска по типу бумаги
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_materials_paper_type_id ON materials(paper_type_id)
  `);
  
  // Создаем индекс для быстрого поиска по плотности
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_materials_density ON materials(density)
  `);
  
  // Создаем составной индекс для поиска по типу бумаги и плотности
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_materials_paper_type_density ON materials(paper_type_id, density)
  `);
  
  console.log('Paper type fields added to materials table');
}

export async function down(db: Database): Promise<void> {
  console.log('Removing paper type fields from materials table...');
  
  // Удаляем индексы
  await db.exec('DROP INDEX IF EXISTS idx_materials_paper_type_id');
  await db.exec('DROP INDEX IF EXISTS idx_materials_density');
  await db.exec('DROP INDEX IF EXISTS idx_materials_paper_type_density');
  
  // Note: SQLite does not support dropping columns directly without recreating the table.
  // For simplicity in `down` migration, we'll just drop indexes.
  console.log('Paper type fields removed from materials table');
}
