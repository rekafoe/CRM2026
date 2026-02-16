import { Database } from 'sqlite';

/**
 * Добавляет услугу «Автоматическая резка» (operation_type=cut, price_unit=per_cut),
 * если её ещё нет. Используется SimplifiedPricingService при включённой опции «Резка стопой».
 * Цена редактируется в services-management; при auto_cutting_price=0 берётся из этой услуги.
 */
export async function up(db: Database) {
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM post_processing_services WHERE operation_type = 'cut' AND price_unit = 'per_cut' AND is_active = 1 LIMIT 1`
  );
  if (existing) return;

  await db.run(
    `INSERT INTO post_processing_services (name, description, price, unit, operation_type, price_unit, setup_cost, min_quantity, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'per_cut', 'cut', 'per_cut', 0, 1, 1, datetime('now'), datetime('now'))`,
    'Автоматическая резка',
    'Резка стопой по раскладке в упрощённом калькуляторе. Цена за рез.',
    1.0
  );
}

export async function down(db: Database) {
  await db.run(
    `UPDATE post_processing_services SET is_active = 0, updated_at = datetime('now')
     WHERE operation_type = 'cut' AND price_unit = 'per_cut' AND name = 'Автоматическая резка'`
  );
}
