import type { Database } from 'sqlite';

/**
 * Продукт 137 «Печать фотографий на холсте» (категория широкоформата).
 * Второй продукт не создаём.
 *
 * Продажная цена — ступени karandash.by (5 ноября 2026) минус 5%.
 * Срочно на калькуляторе Карандаша = стандарт × 1,30; тот же множитель только у этого продукта,
 * глобальный справочник price_types (срочно ×1,5) не меняем.
 * Между ступенями 1, 2, 5, 10, 50, 100 итог линейно интерполируется (sheet_print_smoothing).
 *
 * Печать sol_m и материал 74 уже есть: ссылки, без дублей.
 * 19 BYN/м материала в цену не добавляем — подрамник и трос уже сидят в ступени.
 */

const CANVAS_PRODUCT_ID = 137;
const ROUTE_KEY = 'canvas-photo';
const SOLVENT_TECHNOLOGY = 'sol_m';
const CANVAS_MATERIAL_ID = 74;
const DISCOUNT = 0.95;
const URGENT_MULTIPLIER = 1.3;
const QUANTITIES = [1, 2, 5, 10, 50, 100] as const;

const STRETCHER_TYPE_ID = 1371001;
const ROLL_TYPE_ID = 1371002;

type SizePrice = {
  id: number;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Цена karandash за штуку на ступенях 1, 2, 5, 10, 50, 100. Стандарт 48 ч. */
  karandash: number[];
};

const STRETCHER_SIZES: SizePrice[] = [
  { id: 1371101, label: '20×30', widthMm: 200, heightMm: 300, karandash: [35.09, 34.265, 34.262, 33.47, 32.7174, 31.933] },
  { id: 1371102, label: '30×40', widthMm: 300, heightMm: 400, karandash: [43.71, 43.71, 43.706, 42.674, 40.217, 40.035] },
  { id: 1371103, label: '40×50', widthMm: 400, heightMm: 500, karandash: [54.33, 54.33, 53.058, 52.585, 49.027, 48.7768] },
  { id: 1371104, label: '40×60', widthMm: 400, heightMm: 600, karandash: [68.64, 68.645, 67.25, 66.109, 62.523, 62.2296] },
  { id: 1371105, label: '50×60', widthMm: 500, heightMm: 600, karandash: [75.14, 75.135, 73.622, 72.243, 67.909, 67.5544] },
  { id: 1371106, label: '50×70', widthMm: 500, heightMm: 700, karandash: [81.04, 81.04, 78.636, 77.008, 72.4432, 72.4432] },
  { id: 1371107, label: '60×80', widthMm: 600, heightMm: 800, karandash: [120.61, 120.61, 117.722, 114.492, 109.5288, 105.6444] },
];

const ROLL_SIZES: SizePrice[] = [
  { id: 1371201, label: '20×30', widthMm: 200, heightMm: 300, karandash: [9.74, 9.74, 9.74, 8.9, 7.832, 7.16] },
  { id: 1371202, label: '30×40', widthMm: 300, heightMm: 400, karandash: [15.22, 15.22, 15.22, 13.8, 11.24, 11.06] },
  { id: 1371203, label: '40×50', widthMm: 400, heightMm: 500, karandash: [21.88, 21.88, 20.56, 19.51, 16.21, 15.94] },
  { id: 1371204, label: '40×60', widthMm: 400, heightMm: 600, karandash: [25.21, 25.21, 23.77, 22.545, 18.695, 18.38] },
  { id: 1371205, label: '50×60', widthMm: 500, heightMm: 600, karandash: [29.72, 29.72, 27.446, 25.934, 21.692, 21.692] },
  { id: 1371206, label: '50×70', widthMm: 500, heightMm: 700, karandash: [33.64, 33.64, 31.144, 29.416, 24.568, 24.568] },
  { id: 1371207, label: '60×80', widthMm: 600, heightMm: 800, karandash: [43.25, 43.25, 39.126, 35.723, 31.628, 27.614] },
];

const PRODUCT_DESCRIPTION =
  'Печать на холсте, сольвент. Два подтипа: на стандартном подрамнике с металлическим тросом и в рулоне. ' +
  'Семь стандартных размеров. Цена штуки — ступени тиража 1, 2, 5, 10, 50 и 100; между ними сумма интерполируется. ' +
  'Срочно (24 ч) = стандарт × 1,30. Печать sol_m, материал — холст синтетический DLC (id 74). ' +
  'Их складская цена за метр в калькулятор не прибавляется: она уже входит в ступень вместе с подрамником.';

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

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

function tiers(karandashUnitPrices: number[]) {
  return QUANTITIES.map((minQty, index) => ({
    min_qty: minQty,
    unit_price: round4(karandashUnitPrices[index] * DISCOUNT),
  }));
}

function sizeConfig(size: SizePrice) {
  return {
    id: size.id,
    label: `${size.label} см`,
    width_mm: size.widthMm,
    height_mm: size.heightMm,
    min_qty: 1,
    items_per_sheet_override: 1,
    use_own_materials: true,
    allowed_material_ids: [CANVAS_MATERIAL_ID],
    use_own_finishing: true,
    finishing: [],
    material_prices: [],
    default_print: {
      technology_code: SOLVENT_TECHNOLOGY,
      color_mode: 'color',
      sides_mode: 'single',
    },
    print_prices: [
      {
        technology_code: SOLVENT_TECHNOLOGY,
        color_mode: 'color',
        sides_mode: 'single',
        tiers: tiers(size.karandash),
      },
    ],
  };
}

function typeBlock(typeId: number, sizes: SizePrice[]) {
  return {
    sizes: sizes.map(sizeConfig),
    allowed_price_types: ['standard', 'urgent'],
    common_allowed_material_ids: [CANVAS_MATERIAL_ID],
    initial: {
      size_id: sizes[0].id,
      quantity: 1,
      material_id: CANVAS_MATERIAL_ID,
      print_technology: SOLVENT_TECHNOLOGY,
      print_color_mode: 'color',
      print_sides_mode: 'single',
    },
  };
}

export function buildCanvasTemplateConfig() {
  return {
    simplified: {
      include_material_cost: false,
      use_layout: false,
      sheet_print_smoothing: true,
      fixed_unit_prices: true,
      price_type_multipliers: {
        standard: 1,
        urgent: URGENT_MULTIPLIER,
      },
      cutting: false,
      material_driven_printing: false,
      allow_custom_trim: false,
      types: [
        {
          id: STRETCHER_TYPE_ID,
          key: 'stretcher',
          name: 'На подрамнике',
          default: true,
          image_url: '/images/wide-format/canvas/stretcher.svg',
          briefDescription: 'Холст натянут на стандартный подрамник, крепление — металлический трос.',
          characteristics: ['Стандартный подрамник', 'Трос металлический', 'Семь готовых размеров'],
        },
        {
          id: ROLL_TYPE_ID,
          key: 'roll',
          name: 'В рулоне',
          default: false,
          image_url: '/images/wide-format/canvas/roll.svg',
          briefDescription: 'Печать на холсте без натяжки, полотно в рулоне.',
          characteristics: ['Без подрамника', 'Семь готовых размеров'],
        },
      ],
      typeConfigs: {
        [String(STRETCHER_TYPE_ID)]: typeBlock(STRETCHER_TYPE_ID, STRETCHER_SIZES),
        [String(ROLL_TYPE_ID)]: typeBlock(ROLL_TYPE_ID, ROLL_SIZES),
      },
      initial: {
        type_id: STRETCHER_TYPE_ID,
        size_id: STRETCHER_SIZES[0].id,
        quantity: 1,
        material_id: CANVAS_MATERIAL_ID,
        print_technology: SOLVENT_TECHNOLOGY,
        print_color_mode: 'color',
        print_sides_mode: 'single',
      },
    },
  };
}

type ProductRow = {
  id: number;
  name: string;
  route_key?: string | null;
  category_id?: number | null;
};

async function findCanvasProduct(db: Database): Promise<ProductRow | null> {
  const columns = await columnNames(db, 'products');
  if (!columns.has('id') || !columns.has('name')) return null;
  const routeSelect = columns.has('route_key') ? ', route_key' : '';
  const categorySelect = columns.has('category_id') ? ', category_id' : '';
  const rows = await db.all<ProductRow[]>(
    `SELECT id, name${routeSelect}${categorySelect} FROM products`
  );
  const byId = rows.find((row) => Number(row.id) === CANVAS_PRODUCT_ID);
  if (byId && normalizeRussian(byId.name).includes('холст')) return byId;
  const byKey = rows.find((row) => normalizeRussian(row.route_key) === ROUTE_KEY);
  if (byKey) return byKey;
  const byName = rows.filter((row) => normalizeRussian(row.name).includes('холст'));
  if (byName.length === 1) return byName[0];
  return null;
}

export async function up(db: Database): Promise<void> {
  const configTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_template_configs'`
  );
  if (!configTable) return;

  const product = await findCanvasProduct(db);
  if (!product) return;

  const productColumns = await columnNames(db, 'products');
  const configJson = JSON.stringify(buildCanvasTemplateConfig());

  await db.exec('BEGIN IMMEDIATE');
  try {
    const assignments: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => {
      if (!productColumns.has(column)) return;
      assignments.push(`${column} = ?`);
      params.push(value);
    };
    set('description', PRODUCT_DESCRIPTION);
    set('is_active', 1);
    set('active_for_site', 1);
    set('setup_status', 'ready');
    set('calculator_type', 'simplified');
    set('product_type', 'sheet_single');
    if (productColumns.has('route_key') && !normalizeRussian(product.route_key)) {
      set('route_key', ROUTE_KEY);
    }
    if (productColumns.has('updated_at')) assignments.push(`updated_at = datetime('now')`);
    if (assignments.length > 0) {
      await db.run(`UPDATE products SET ${assignments.join(', ')} WHERE id = ?`, [...params, product.id]);
    }

    const configRow = await db.get<{ id: number }>(
      `SELECT id FROM product_template_configs
       WHERE product_id = ? AND name = 'template'
       ORDER BY id DESC LIMIT 1`,
      [product.id]
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
        [product.id, configJson]
      );
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function down(db: Database): Promise<void> {
  const product = await findCanvasProduct(db);
  if (!product) return;
  const configTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_template_configs'`
  );
  if (!configTable) return;
  await db.run(`DELETE FROM product_template_configs WHERE product_id = ? AND name = 'template'`, [product.id]);
}
