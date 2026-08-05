import { Database } from 'sqlite';

type TableColumnInfo = { name: string };

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as TableColumnInfo[];
  return cols.some((c) => c.name === column);
}

export async function up(db: Database): Promise<void> {
  // post_processing_services: режим расхода + база метров
  if (!(await hasColumn(db, 'post_processing_services', 'consumption_mode'))) {
    await db.run(
      `ALTER TABLE post_processing_services
       ADD COLUMN consumption_mode TEXT NOT NULL DEFAULT 'fixed'
       CHECK (consumption_mode IN ('fixed', 'roll_feed'))`
    );
  }
  if (!(await hasColumn(db, 'post_processing_services', 'meter_basis'))) {
    await db.run(
      `ALTER TABLE post_processing_services
       ADD COLUMN meter_basis TEXT
       CHECK (meter_basis IN ('knife_path', 'feed'))`
    );
  }

  // service_variants: переопределение режима на уровне варианта
  if (!(await hasColumn(db, 'service_variants', 'consumption_mode'))) {
    await db.run(
      `ALTER TABLE service_variants
       ADD COLUMN consumption_mode TEXT NOT NULL DEFAULT 'fixed'
       CHECK (consumption_mode IN ('fixed', 'roll_feed'))`
    );
  }
  if (!(await hasColumn(db, 'service_variants', 'meter_basis'))) {
    await db.run(
      `ALTER TABLE service_variants
       ADD COLUMN meter_basis TEXT
       CHECK (meter_basis IN ('knife_path', 'feed'))`
    );
  }

  // Базовая миграция данных:
  // рулонную ламинацию c per_meter считаем roll_feed + feed
  await db.run(
    `UPDATE post_processing_services
     SET
       consumption_mode = 'roll_feed',
       meter_basis = COALESCE(meter_basis, 'feed')
     WHERE LOWER(COALESCE(operation_type, '')) = 'laminate'
       AND LOWER(COALESCE(price_unit, '')) = 'per_meter'`
  );

  await db.run(
    `UPDATE service_variants
     SET
       consumption_mode = 'roll_feed',
       meter_basis = COALESCE(meter_basis, 'feed')
     WHERE service_id IN (
       SELECT id
       FROM post_processing_services
       WHERE LOWER(COALESCE(operation_type, '')) = 'laminate'
         AND LOWER(COALESCE(price_unit, '')) = 'per_meter'
     )`
  );
}

export async function down(_db: Database): Promise<void> {
  // SQLite legacy: колонки не удаляем.
  console.log('Down: consumption_mode columns are kept (SQLite limitation)');
}

