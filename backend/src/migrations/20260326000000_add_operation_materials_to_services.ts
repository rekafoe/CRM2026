import { Database } from 'sqlite';

/**
 * Добавляет привязку материалов к операциям (услугам и вариантам услуг),
 * чтобы при выборе операции (ламинирование, крепление и т.д.) материал списывался со склада.
 * - service_variants: material_id, qty_per_item (на один заказ/единицу операции)
 * - post_processing_services: material_id, qty_per_item (для услуг без вариантов)
 */
export async function up(db: Database): Promise<void> {
  // Варианты услуг (например «Шнурок красный», «Булавка») — у каждого свой материал и норма
  const svColumns = (await db.all(`PRAGMA table_info(service_variants)`)) as Array<{ name: string }>;
  const svNames = new Set(svColumns.map((c) => c.name));
  if (!svNames.has('material_id')) {
    await db.run(
      `ALTER TABLE service_variants ADD COLUMN material_id INTEGER REFERENCES materials(id)`
    );
  }
  if (!svNames.has('qty_per_item')) {
    await db.run(
      `ALTER TABLE service_variants ADD COLUMN qty_per_item REAL DEFAULT 1`
    );
  }

  // Услуги без вариантов (ламинирование и т.д.) — материал на саму услугу
  const ppsColumns = (await db.all(`PRAGMA table_info(post_processing_services)`)) as Array<{ name: string }>;
  const ppsNames = new Set(ppsColumns.map((c) => c.name));
  if (!ppsNames.has('material_id')) {
    await db.run(
      `ALTER TABLE post_processing_services ADD COLUMN material_id INTEGER REFERENCES materials(id)`
    );
  }
  if (!ppsNames.has('qty_per_item')) {
    await db.run(
      `ALTER TABLE post_processing_services ADD COLUMN qty_per_item REAL DEFAULT 1`
    );
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite не поддерживает DROP COLUMN в старых версиях — оставляем колонки
  // при откате миграции; при необходимости можно создать новую таблицу без колонок и переименовать
  console.log('Down: operation materials columns left in place (SQLite limitation)');
}
