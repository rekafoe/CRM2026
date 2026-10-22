import type { Database } from 'sqlite';

const ROUTE_KEY = 'kvartalnye-kalendari';
const PRODUCT_NAME = 'Календари квартальные';

/**
 * Комплект, который уже сидит в цене за штуку (калькулятор Карандаша, 22 октября 2026):
 * матовая мелованная 350 г/м², печать 4+0, серебристая пружина, серая сетка,
 * люверс, матовая ламинация 30 мкм. Отдельный материал и услуга переплёта не добавляются.
 * Ступени: 1 шт., 2–49 (цена как у 2–10), 50–99, от 100.
 */
const PRODUCT_DESCRIPTION =
  'Квартальный настенный календарь. Подтип — это переплёт: 1 пружина, 1+1, 3 пружины, 3+1 или 3+3. ' +
  'В цену уже входят печать 4+0, матовая мелованная бумага 350 г/м², серебристая пружина, серая календарная сетка, крепление на люверс и матовая ламинация 30 мкм. ' +
  'Бумага и отделка в калькуляторе не выбираются, чтобы не посчитать их второй раз. ' +
  'Цена за штуку одна на весь тираж от 2 до 49 экземпляров, дальше отдельные ступени от 50 и от 100.';

type Binding = {
  id: number;
  sizeId: number;
  key: string;
  name: string;
  briefDescription: string;
  prices: [number, number, number, number];
  isDefault?: boolean;
};

const BINDINGS: Binding[] = [
  {
    id: 910001,
    sizeId: 910101,
    key: 'spring-1',
    name: '1 пружина',
    briefDescription: 'Один календарный блок на одной пружине.',
    prices: [27, 22.8, 13.8, 9],
  },
  {
    id: 910002,
    sizeId: 910102,
    key: 'spring-1-1',
    name: '1+1',
    briefDescription: 'Календарный блок и рекламное поле, у каждой части своя пружина.',
    prices: [33.6, 29.4, 20.4, 15.6],
  },
  {
    id: 910003,
    sizeId: 910103,
    key: 'spring-3',
    name: '3 пружины',
    briefDescription: 'Три месяца в ряд, каждый на своей пружине.',
    prices: [40.2, 36, 27, 22.2],
  },
  {
    id: 910004,
    sizeId: 910104,
    key: 'spring-3-1',
    name: '3+1',
    briefDescription: 'Три месяца на пружинах и отдельное рекламное поле.',
    prices: [41.4, 37.2, 28.2, 23.4],
    isDefault: true,
  },
  {
    id: 910005,
    sizeId: 910105,
    key: 'spring-3-3',
    name: '3+3',
    briefDescription: 'Три месяца и три рекламных поля, у каждого своя пружина.',
    prices: [45.6, 41.4, 32.4, 27.6],
  },
];

function normalizeRussian(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

async function columnNames(db: Database, table: string): Promise<Set<string>> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map((row) => row.name));
}

function tiers(prices: [number, number, number, number]) {
  const [single, shortRun, from50, from100] = prices;
  return [
    { min_qty: 1, max_qty: 1, unit_price: single },
    { min_qty: 2, max_qty: 49, unit_price: shortRun },
    { min_qty: 50, max_qty: 99, unit_price: from50 },
    { min_qty: 100, unit_price: from100 },
  ];
}

function buildTemplateConfig() {
  const defaultBinding = BINDINGS.find((binding) => binding.isDefault) ?? BINDINGS[0];
  const types = BINDINGS.map((binding) => ({
    id: binding.id,
    key: binding.key,
    name: binding.name,
    default: binding.isDefault === true,
    briefDescription: binding.briefDescription,
    characteristics: [binding.briefDescription],
  }));
  const typeConfigs = Object.fromEntries(
    BINDINGS.map((binding) => [
      String(binding.id),
      {
        sizes: [
          {
            id: binding.sizeId,
            label: 'Квартальный календарь',
            // Обрез рекламного поля «шапки» для макета 3+1. Это не выбор формата:
            // цена комплекта не зависит от раскладки, use_layout выключен.
            width_mm: 210,
            height_mm: 297,
            min_qty: 1,
            items_per_sheet_override: 1,
            use_own_materials: true,
            allowed_material_ids: [],
            use_own_finishing: true,
            default_print: {
              technology_code: 'laser_sheet',
              color_mode: 'color',
              sides_mode: 'single',
            },
            print_prices: [
              {
                technology_code: 'laser_sheet',
                color_mode: 'color',
                sides_mode: 'single',
                tiers: tiers(binding.prices),
              },
            ],
            material_prices: [],
            finishing: [],
          },
        ],
        initial: {
          size_id: binding.sizeId,
          quantity: 1,
          print_technology: 'laser_sheet',
          print_color_mode: 'color',
          print_sides_mode: 'single',
        },
      },
    ])
  );

  return {
    simplified: {
      include_material_cost: false,
      use_layout: false,
      sheet_print_smoothing: false,
      cutting: false,
      material_driven_printing: false,
      types,
      typeConfigs,
      initial: {
        type_id: defaultBinding.id,
        size_id: defaultBinding.sizeId,
        quantity: 1,
        print_technology: 'laser_sheet',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      },
    },
  };
}

async function ensureCategoryId(db: Database): Promise<number | null> {
  const columns = await columnNames(db, 'product_categories');
  if (!columns.has('name') || !columns.has('id')) return null;

  const categories = await db.all<Array<{ id: number; name: string; is_active?: number }>>(
    `SELECT id, name${columns.has('is_active') ? ', is_active' : ''} FROM product_categories`
  );
  const ranked = [...categories].sort((a, b) => {
    const activeDelta = Number(b.is_active ?? 1) - Number(a.is_active ?? 1);
    if (activeDelta !== 0) return activeDelta;
    return Number(a.id) - Number(b.id);
  });
  const exact = ranked.find((category) => normalizeRussian(category.name) === 'полиграфия');
  const loose = ranked.find((category) => normalizeRussian(category.name).includes('полиграф'));
  const found = exact ?? loose;
  if (found) return Number(found.id);

  const values: Record<string, unknown> = {
    name: 'Полиграфия',
    description: 'Полиграфия',
    is_active: 1,
    sort_order: 0,
  };
  const names = Object.keys(values).filter((name) => columns.has(name));
  if (!names.includes('name')) return null;
  const result = await db.run(
    `INSERT INTO product_categories (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    names.map((name) => values[name])
  );
  return Number(result.lastID);
}

export async function up(db: Database): Promise<void> {
  const productColumns = await columnNames(db, 'products');
  if (!productColumns.has('name') || !productColumns.has('category_id') || !productColumns.has('route_key')) {
    return;
  }
  const configTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_template_configs'`
  );
  if (!configTable) return;

  const categoryId = await ensureCategoryId(db);
  if (!categoryId) return;

  const configJson = JSON.stringify(buildTemplateConfig());
  await db.exec('BEGIN IMMEDIATE');
  try {
    const existing = await db.get<{ id: number }>(
      `SELECT id FROM products WHERE lower(trim(route_key)) = ? ORDER BY id LIMIT 1`,
      [ROUTE_KEY]
    );

    const productValues: Record<string, unknown> = {
      category_id: categoryId,
      name: PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      is_active: 1,
      active_for_site: 1,
      setup_status: 'ready',
      calculator_type: 'simplified',
      product_type: 'sheet_single',
      route_key: ROUTE_KEY,
      operator_percent: 0,
    };

    let productId = existing ? Number(existing.id) : 0;
    if (existing) {
      const assignments = Object.keys(productValues)
        .filter((name) => name !== 'operator_percent' && productColumns.has(name))
        .map((name) => `${name} = ?`);
      const params = Object.entries(productValues)
        .filter(([name]) => name !== 'operator_percent' && productColumns.has(name))
        .map(([, value]) => value);
      if (productColumns.has('updated_at')) assignments.push(`updated_at = datetime('now')`);
      await db.run(`UPDATE products SET ${assignments.join(', ')} WHERE id = ?`, [...params, productId]);
    } else {
      const names = Object.keys(productValues).filter((name) => productColumns.has(name));
      const result = await db.run(
        `INSERT INTO products (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        names.map((name) => productValues[name])
      );
      productId = Number(result.lastID);
    }

    const configRow = await db.get<{ id: number }>(
      `SELECT id FROM product_template_configs
       WHERE product_id = ? AND name = 'template'
       ORDER BY id DESC LIMIT 1`,
      [productId]
    );
    if (configRow) {
      await db.run(
        `UPDATE product_template_configs
         SET config_data = ?, is_active = 1, updated_at = datetime('now')
         WHERE id = ?`,
        [configJson, configRow.id]
      );
    } else {
      await db.run(
        `INSERT INTO product_template_configs
         (product_id, name, config_data, is_active, created_at, updated_at)
         VALUES (?, 'template', ?, 1, datetime('now'), datetime('now'))`,
        [productId, configJson]
      );
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function down(db: Database): Promise<void> {
  const productColumns = await columnNames(db, 'products');
  if (!productColumns.has('route_key')) return;
  const product = await db.get<{ id: number }>(
    `SELECT id FROM products WHERE lower(trim(route_key)) = ? ORDER BY id LIMIT 1`,
    [ROUTE_KEY]
  );
  if (!product) return;

  const configTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_template_configs'`
  );
  await db.exec('BEGIN IMMEDIATE');
  try {
    if (configTable) {
      await db.run(`DELETE FROM product_template_configs WHERE product_id = ?`, [product.id]);
    }
    await db.run(`DELETE FROM products WHERE id = ?`, [product.id]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
