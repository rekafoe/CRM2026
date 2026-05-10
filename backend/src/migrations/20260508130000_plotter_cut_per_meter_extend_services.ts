import { Database } from 'sqlite';

type ColInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

/**
 * Расширяет CHECK у post_processing_services: operation_type += plotter_cut, price_unit += per_meter.
 * Копирует все текущие колонки и данные.
 */
export async function up(db: Database): Promise<void> {
  const master = await db.get<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='post_processing_services'"
  );
  if (master?.sql?.includes("'per_meter'")) {
    return;
  }

  const cols = (await db.all(`PRAGMA table_info(post_processing_services)`)) as ColInfo[];
  if (cols.length === 0) return;

  const sorted = [...cols].sort((a, b) => a.cid - b.cid);
  const parts: string[] = [];

  for (const c of sorted) {
    if (c.name === 'operation_type') {
      parts.push(
        `operation_type TEXT CHECK(operation_type IN ('print','cut','fold','score','laminate','bind','perforate','emboss','foil','varnish','package','design','delivery','other','plotter_cut')) DEFAULT 'other'`
      );
      continue;
    }
    if (c.name === 'price_unit') {
      parts.push(
        `price_unit TEXT CHECK(price_unit IN ('per_sheet','per_item','per_m2','per_hour','fixed','per_order','per_cut','per_meter')) DEFAULT 'per_item'`
      );
      continue;
    }
    const ty = c.type || 'TEXT';
    if (c.name === 'id' && c.pk === 1) {
      parts.push('id INTEGER PRIMARY KEY AUTOINCREMENT');
      continue;
    }
    let line = `${c.name} ${ty}`;
    if (c.notnull && c.name !== 'id') line += ' NOT NULL';
    if (c.dflt_value != null && String(c.dflt_value) !== '') {
      line += ` DEFAULT ${c.dflt_value}`;
    }
    parts.push(line);
  }

  const colNames = sorted.map((c) => c.name);

  await db.exec('BEGIN');
  try {
    await db.exec(`CREATE TABLE post_processing_services_new (\n  ${parts.join(',\n  ')}\n)`);
    await db.exec(`
      INSERT INTO post_processing_services_new (${colNames.join(', ')})
      SELECT ${colNames.join(', ')} FROM post_processing_services
    `);
    await db.exec(`DROP TABLE post_processing_services`);
    await db.exec(`ALTER TABLE post_processing_services_new RENAME TO post_processing_services`);
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_post_processing_services_is_active ON post_processing_services(is_active)`
    );
    if (sorted.some((c) => c.name === 'category_id')) {
      await db.exec(
        `CREATE INDEX IF NOT EXISTS idx_post_processing_services_category_id ON post_processing_services(category_id)`
      );
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  const knifeParams = JSON.stringify({ meter_basis: 'knife_path' });
  const feedParams = JSON.stringify({ meter_basis: 'feed' });

  const ensureService = async (
    name: string,
    fields: { description: string; price: number; unit: string; operation_type: string; price_unit: string; parameters: string }
  ) => {
    const row = await db.get<{ id: number }>(`SELECT id FROM post_processing_services WHERE name = ? LIMIT 1`, name);
    if (row) return;
    await db.run(
      `INSERT INTO post_processing_services (
         name, description, price, unit, operation_type, price_unit, setup_cost, min_quantity, parameters, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 1, datetime('now'), datetime('now'))`,
      name,
      fields.description,
      fields.price,
      fields.unit,
      fields.operation_type,
      fields.price_unit,
      fields.parameters
    );
  };

  await ensureService('Плоттерная резка (рулон)', {
    description: 'Пробег ножа по оценке knife_path (п.м.). Тарифы — в service_volume_prices.',
    price: 1,
    unit: 'п.м.',
    operation_type: 'plotter_cut',
    price_unit: 'per_meter',
    parameters: knifeParams,
  });
  await ensureService('Плоттерная резка (лист)', {
    description: 'Пробег ножа по оценке knife_path на листе (п.м.).',
    price: 1,
    unit: 'п.м.',
    operation_type: 'plotter_cut',
    price_unit: 'per_meter',
    parameters: knifeParams,
  });
  await ensureService('Выборка для плоттерной резки', {
    description: 'Ручная выборка (weeding) после резки на плоттере.',
    price: 0,
    unit: 'шт',
    operation_type: 'other',
    price_unit: 'per_item',
    parameters: '{}',
  });
  await ensureService('Накатка монтажной плёнки', {
    description: 'Накат монтажной плёнки; метраж по подаче (feed).',
    price: 0,
    unit: 'п.м.',
    operation_type: 'other',
    price_unit: 'per_meter',
    parameters: feedParams,
  });
}
