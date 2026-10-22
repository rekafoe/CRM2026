import type { Database } from 'sqlite';

const ROUTE_KEY = 'kvartalnye-kalendari';

const PRODUCT_DESCRIPTION =
  'Квартальный настенный календарь. Подтип — переплёт: 1, 1+1, 3, 3+1 или 3+3. Число после «+» — сколько отдельных рекламных полей. ' +
  'В цену уже входят печать 4+0, матовая мелованная бумага 350 г/м², серебристая пружина, серая календарная сетка, крепление на люверс и матовая ламинация 30 мкм. ' +
  'Бумага и отделка в калькуляторе не выбираются, чтобы не посчитать их второй раз. ' +
  'Цена за штуку одна на весь тираж от 2 до 49 экземпляров, дальше отдельные ступени от 50 и от 100.';

const PREVIOUS_DESCRIPTION =
  'Квартальный настенный календарь. Подтип — это переплёт: 1 пружина, 1+1, 3 пружины, 3+1 или 3+3. ' +
  'В цену уже входят печать 4+0, матовая мелованная бумага 350 г/м², серебристая пружина, серая календарная сетка, крепление на люверс и матовая ламинация 30 мкм. ' +
  'Бумага и отделка в калькуляторе не выбираются, чтобы не посчитать их второй раз. ' +
  'Цена за штуку одна на весь тираж от 2 до 49 экземпляров, дальше отдельные ступени от 50 и от 100.';

const BINDING_COPY: Record<string, { name: string; briefDescription: string }> = {
  'spring-1': {
    name: '1',
    briefDescription: 'Календарный блок без отдельного рекламного поля.',
  },
  'spring-1-1': {
    name: '1+1',
    briefDescription: 'Календарный блок и одно рекламное поле.',
  },
  'spring-3': {
    name: '3',
    briefDescription: 'Три блока по месяцам, без отдельных рекламных полей.',
  },
  'spring-3-1': {
    name: '3+1',
    briefDescription: 'Три блока по месяцам и одно рекламное поле.',
  },
  'spring-3-3': {
    name: '3+3',
    briefDescription: 'Три блока по месяцам и три рекламных поля.',
  },
};

const PREVIOUS_COPY: Record<string, { name: string; briefDescription: string }> = {
  'spring-1': {
    name: '1 пружина',
    briefDescription: 'Один календарный блок на одной пружине.',
  },
  'spring-1-1': {
    name: '1+1',
    briefDescription: 'Календарный блок и рекламное поле, у каждой части своя пружина.',
  },
  'spring-3': {
    name: '3 пружины',
    briefDescription: 'Три месяца в ряд, каждый на своей пружине.',
  },
  'spring-3-1': {
    name: '3+1',
    briefDescription: 'Три месяца на пружинах и отдельное рекламное поле.',
  },
  'spring-3-3': {
    name: '3+3',
    briefDescription: 'Три месяца и три рекламных поля, у каждого своя пружина.',
  },
};

function parseConfig(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function applyCopy(
  db: Database,
  copy: Record<string, { name: string; briefDescription: string }>,
  description: string
): Promise<void> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info('products')`);
  if (!columns.some((column) => column.name === 'route_key')) return;

  const product = await db.get<{ id: number }>(
    `SELECT id FROM products WHERE lower(trim(route_key)) = ? ORDER BY id LIMIT 1`,
    [ROUTE_KEY]
  );
  if (!product) return;

  const assignments = ['description = ?'];
  const params: unknown[] = [description];
  if (columns.some((column) => column.name === 'updated_at')) {
    assignments.push(`updated_at = datetime('now')`);
  }
  await db.run(`UPDATE products SET ${assignments.join(', ')} WHERE id = ?`, [...params, product.id]);

  const configTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_template_configs'`
  );
  if (!configTable) return;

  const row = await db.get<{ id: number; config_data: unknown }>(
    `SELECT id, config_data
     FROM product_template_configs
     WHERE product_id = ? AND name = 'template'
     ORDER BY id DESC
     LIMIT 1`,
    [product.id]
  );
  const config = parseConfig(row?.config_data);
  const types = config?.simplified?.types;
  if (!row || !Array.isArray(types)) return;

  for (const type of types) {
    const next = copy[String(type?.key ?? '')];
    if (!next) continue;
    type.name = next.name;
    type.briefDescription = next.briefDescription;
    type.characteristics = [next.briefDescription];
  }

  await db.run(
    `UPDATE product_template_configs
     SET config_data = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [JSON.stringify(config), row.id]
  );
}

/** Короткие имена переплёта: число после «+» — рекламные поля. Цены не меняются. */
export async function up(db: Database): Promise<void> {
  await applyCopy(db, BINDING_COPY, PRODUCT_DESCRIPTION);
}

export async function down(db: Database): Promise<void> {
  await applyCopy(db, PREVIOUS_COPY, PREVIOUS_DESCRIPTION);
}
