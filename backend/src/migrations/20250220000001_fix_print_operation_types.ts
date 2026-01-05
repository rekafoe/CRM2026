import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  // Помечаем услуги, которые используются как "Печать" в operation_norms, как operation_type='print'
  // Это нужно, чтобы расчет гарантированно попадал в ветку печати и использовал print_prices,
  // даже если название услуги не содержит "печать".
  await db.exec(`
    UPDATE post_processing_services
       SET operation_type = 'print',
           updated_at = COALESCE(updated_at, datetime('now'))
     WHERE id IN (
       SELECT DISTINCT service_id
         FROM operation_norms
        WHERE lower(operation) LIKE '%печать%' OR lower(operation) LIKE '%print%'
     )
  `);

  // Дополнительная страховка по названию услуги
  await db.exec(`
    UPDATE post_processing_services
       SET operation_type = 'print',
           updated_at = COALESCE(updated_at, datetime('now'))
     WHERE lower(name) LIKE '%печать%' OR lower(name) LIKE '%print%'
  `);
}

export async function down(_db: Database): Promise<void> {
  // откат не делаем (небезопасно угадывать предыдущие значения operation_type)
}