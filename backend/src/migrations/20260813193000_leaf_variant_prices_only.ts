import { Database } from 'sqlite';
import {
  collectLeafVariantIds,
  collectNonLeafVariantIds,
  type ServiceVariantTreeRow,
} from '../modules/pricing/utils/serviceVariantTree';

async function tableExists(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    table,
  );
  return Boolean(row?.name);
}

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
  return columns.some((item) => item.name === column);
}

export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'service_variants'))) return;
  const parentColumn = await hasColumn(db, 'service_variants', 'parent_variant_id')
    ? 'parent_variant_id'
    : 'NULL AS parent_variant_id';

  const rows = await db.all<Array<ServiceVariantTreeRow & { service_id: number }>>(
    `SELECT id, service_id, variant_name, parameters, ${parentColumn}
     FROM service_variants
     ORDER BY service_id, sort_order, id`,
  );
  const byService = new Map<number, ServiceVariantTreeRow[]>();
  for (const row of rows) {
    const list = byService.get(Number(row.service_id)) || [];
    list.push(row);
    byService.set(Number(row.service_id), list);
  }

  const hasVariantPrices = await tableExists(db, 'service_variant_prices');
  const hasLegacyPrices = await tableExists(db, 'service_volume_prices');
  const hasRanges = await tableExists(db, 'service_range_boundaries');
  if (hasVariantPrices && hasLegacyPrices && hasRanges) {
    for (const [serviceId, variants] of byService) {
      for (const variantId of collectLeafVariantIds(variants)) {
        const legacyRows = await db.all<Array<{
          min_quantity: number;
          price_per_unit: number;
          is_active: number;
        }>>(
          `SELECT min_quantity, price_per_unit, is_active
           FROM service_volume_prices
           WHERE service_id = ? AND variant_id = ?
           ORDER BY id`,
          serviceId,
          variantId,
        );
        for (const legacy of legacyRows) {
          let range = await db.get<{ id: number }>(
            `SELECT id FROM service_range_boundaries
             WHERE service_id = ? AND min_quantity = ?`,
            serviceId,
            legacy.min_quantity,
          );
          if (!range) {
            const maxSort = await db.get<{ value: number }>(
              `SELECT COALESCE(MAX(sort_order), -1) AS value
               FROM service_range_boundaries
               WHERE service_id = ?`,
              serviceId,
            );
            const inserted = await db.run(
              `INSERT INTO service_range_boundaries
                 (service_id, min_quantity, sort_order, is_active)
               VALUES (?, ?, ?, 1)`,
              serviceId,
              legacy.min_quantity,
              Number(maxSort?.value ?? -1) + 1,
            );
            range = { id: Number(inserted.lastID) };
          }
          const current = await db.get<{ id: number; price_per_unit: number }>(
            `SELECT id, price_per_unit FROM service_variant_prices
             WHERE variant_id = ? AND range_id = ?`,
            variantId,
            range.id,
          );
          if (!current) {
            await db.run(
              `INSERT INTO service_variant_prices
                 (variant_id, range_id, price_per_unit, is_active)
               VALUES (?, ?, ?, ?)`,
              variantId,
              range.id,
              legacy.price_per_unit,
              legacy.is_active,
            );
          } else if (Number(current.price_per_unit) === 0 && Number(legacy.price_per_unit) !== 0) {
            await db.run(
              `UPDATE service_variant_prices
               SET price_per_unit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              legacy.price_per_unit,
              legacy.is_active,
              current.id,
            );
          }
        }
      }
    }
  }

  const nonLeafIds = [...byService.values()]
    .flatMap((variants) => [...collectNonLeafVariantIds(variants)]);
  if (nonLeafIds.length === 0) return;

  const placeholders = nonLeafIds.map(() => '?').join(',');
  if (hasVariantPrices) {
    await db.run(
      `DELETE FROM service_variant_prices WHERE variant_id IN (${placeholders})`,
      ...nonLeafIds,
    );
  }
  if (hasLegacyPrices) {
    await db.run(
      `DELETE FROM service_volume_prices WHERE variant_id IN (${placeholders})`,
      ...nonLeafIds,
    );
  }
}

export async function down(_db: Database): Promise<void> {
  // Удалённые цены промежуточных уровней намеренно не восстанавливаются.
}
