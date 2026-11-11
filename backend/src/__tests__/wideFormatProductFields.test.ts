import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { up } from '../migrations/20261111120000_wide_format_product_fields';
import {
  patchWideFormatProductConfig,
  wideFormatSheetCode,
} from '../modules/products/wideFormatProductFields';

function configOf(simplified: Record<string, unknown>) {
  return { trim_size: { width: 10 }, simplified };
}

describe('wide format sheet codes', () => {
  it('recognizes Cyrillic and Latin A-formats and ignores other labels', () => {
    expect(wideFormatSheetCode('А4')).toBe('A4');
    expect(wideFormatSheetCode('A2 (420x594 мм)')).toBe('A2');
    expect(wideFormatSheetCode('а0')).toBe('A0');
    expect(wideFormatSheetCode('85х200 см')).toBeNull();
    expect(wideFormatSheetCode('20×30 см')).toBeNull();
    expect(wideFormatSheetCode('A10')).toBeNull();
  });
});

describe('patchWideFormatProductConfig', () => {
  it('fills only empty subtype texts and keeps filled ones', () => {
    const filled = 'Уже написано оператором.';
    const { config, report } = patchWideFormatProductConfig(
      configOf({
        material_driven_printing: true,
        types: [
          {
            id: 1,
            name: 'Баннеры',
            fullDescription: filled,
            characteristics: ['Свой пункт'],
            advantages: ['Своё преимущество'],
          },
        ],
        typeConfigs: {
          '1': {
            sizes: [{ id: 10, label: 'А1', width_mm: 500, height_mm: 700, print_prices: [] }],
          },
        },
      }),
      { id: 67, name: 'Баннеры' },
    );

    const type = config.simplified.types[0];
    expect(type.fullDescription).toBe(filled);
    expect(type.characteristics).toEqual(['Свой пункт']);
    expect(type.advantages).toEqual(['Своё преимущество']);
    expect(report.textsFilled).toEqual([]);
    expect(config.simplified.typeConfigs['1'].sizes.map((size: { label: string }) => size.label)).toEqual([
      'А1',
      'А2',
      'А0',
    ]);
    const kept = config.simplified.typeConfigs['1'].sizes[0];
    expect(kept.width_mm).toBe(500);
    expect(kept.height_mm).toBe(700);
    const added = config.simplified.typeConfigs['1'].sizes.find((size: { label: string }) => size.label === 'А0');
    expect(added.width_mm).toBe(841);
    expect(added.height_mm).toBe(1189);
    expect(added.print_prices[0].tiers).toEqual([]);
  });

  it('removes A4–A6, sets solvent technology without touching tier prices, and shares materials', () => {
    const { config } = patchWideFormatProductConfig(
      configOf({
        sizes: [
          {
            id: 1,
            label: 'A4',
            width_mm: 210,
            height_mm: 297,
            use_own_materials: true,
            allowed_material_ids: [71],
            print_prices: [
              {
                technology_code: 'laser_prof',
                color_mode: 'color',
                sides_mode: 'single',
                tiers: [{ min_qty: 1, unit_price: 12.5 }],
              },
            ],
          },
          {
            id: 2,
            label: 'A2 (420x594 мм)',
            width_mm: 420,
            height_mm: 594,
            allowed_material_ids: [56],
            print_prices: [
              {
                technology_code: 'laser_prof',
                color_mode: 'bw',
                sides_mode: 'single',
                tiers: [{ min_qty: 1, unit_price: 0 }],
              },
            ],
          },
        ],
        types: [{ id: 9, name: 'Основной', key: 'main' }],
        typeConfigs: {
          '9': {
            common_allowed_material_ids: [71],
            sizes: [
              {
                id: 2,
                label: 'A2 (420x594 мм)',
                width_mm: 420,
                height_mm: 594,
                allowed_material_ids: [60, 61],
                print_prices: [
                  {
                    technology_code: 'sol_m',
                    color_mode: 'color',
                    sides_mode: 'single',
                    tiers: [{ min_qty: 1, unit_price: 4.2, extra: true }],
                  },
                ],
              },
            ],
          },
        },
      }),
      { id: 66, name: 'Сольвентная печать' },
    );

    expect(config.simplified.sizes.map((size: { label: string }) => size.label)).toEqual([
      'A2 (420x594 мм)',
      'А1',
      'А0',
    ]);
    const typeSizes = config.simplified.typeConfigs['9'].sizes;
    expect(typeSizes.map((size: { label: string }) => size.label)).toEqual([
      'A2 (420x594 мм)',
      'А1',
      'А0',
    ]);
    expect(typeSizes[0].width_mm).toBe(420);
    expect(typeSizes[0].print_prices[0]).toMatchObject({
      technology_code: 'sol_m',
      tiers: [{ min_qty: 1, unit_price: 4.2, extra: true }],
    });
    expect(typeSizes[0].use_own_materials).toBe(false);
    expect(config.simplified.typeConfigs['9'].common_allowed_material_ids).toEqual([71]);
    expect(config.simplified.material_driven_printing).toBe(true);
    expect(config.simplified.typeConfigs['9'].initial.print_technology).toBe('sol_m');
    expect(config.simplified.types[0].fullDescription).toContain('выбрать носитель под место');
    expect(config.trim_size).toEqual({ width: 10 });
  });

  it('keeps canvas characteristics and prices, and fills only empty texts', () => {
    const tiers = [{ min_qty: 1, unit_price: 33.33 }];
    const { config } = patchWideFormatProductConfig(
      configOf({
        fixed_unit_prices: true,
        material_driven_printing: false,
        sizes: [],
        types: [
          {
            id: 1371001,
            key: 'stretcher',
            name: 'На подрамнике',
            briefDescription: 'Кратко',
            characteristics: ['Стандартный подрамник', 'Трос металлический', 'Семь готовых размеров'],
          },
        ],
        typeConfigs: {
          '1371001': {
            common_allowed_material_ids: [74],
            initial: { print_technology: 'sol_m', material_id: 74 },
            sizes: [
              {
                id: 1371101,
                label: '20×30 см',
                width_mm: 200,
                height_mm: 300,
                use_own_materials: true,
                allowed_material_ids: [74],
                default_print: { technology_code: 'sol_m', color_mode: 'color', sides_mode: 'single' },
                print_prices: [
                  { technology_code: 'sol_m', color_mode: 'color', sides_mode: 'single', tiers },
                ],
              },
            ],
          },
        },
      }),
      { id: 137, name: 'Печать фотографий на холсте' },
    );

    const type = config.simplified.types[0];
    expect(type.briefDescription).toBe('Кратко');
    expect(type.characteristics).toEqual([
      'Стандартный подрамник',
      'Трос металлический',
      'Семь готовых размеров',
    ]);
    expect(type.fullDescription).toContain('сразу вешать');
    expect(type.advantages).toEqual([
      'Не нужно отдельно заказывать натяжку и раму',
      'Подрамник держит холст, трос рассчитан на подвес',
      'Готовый предмет для стены, а не рулон в багетную мастерскую',
    ]);
    const sizes = config.simplified.typeConfigs['1371001'].sizes;
    expect(sizes[0].print_prices[0].tiers).toEqual(tiers);
    expect(sizes[0].use_own_materials).toBe(false);
    expect(config.simplified.typeConfigs['1371001'].common_allowed_material_ids).toEqual([74]);
    expect(config.simplified.typeConfigs['1371001'].initial).toMatchObject({
      print_technology: 'sol_m',
      material_id: 74,
    });
    expect(sizes.map((size: { label: string }) => size.label)).toEqual(['20×30 см', 'А2', 'А1', 'А0']);
    expect(config.simplified.sizes).toEqual([]);
    expect(config.simplified.fixed_unit_prices).toBe(true);
    expect(config.simplified.material_driven_printing).toBe(true);
  });

  it('is idempotent', () => {
    const first = patchWideFormatProductConfig(
      configOf({
        sizes: [{ id: 1, label: 'А3', width_mm: 297, height_mm: 420, print_prices: [] }],
      }),
      { id: 95, name: 'Печать постеров А3, А2, А1, А0' },
    );
    const second = patchWideFormatProductConfig(first.config, {
      id: 95,
      name: 'Печать постеров А3, А2, А1, А0',
    });
    expect(second.report.changed).toBe(false);
    expect(second.config).toEqual(first.config);
    expect(first.config.simplified.types[0].fullDescription).toContain('А3, А2, А1 и А0');
    expect(first.config.simplified.typeConfigs[String(first.config.simplified.types[0].id)].sizes.map(
      (size: { label: string }) => size.label,
    )).toEqual(['А3', 'А2', 'А1', 'А0']);
  });

  it('drops a legacy A4–A6 root list when the subtype already has formats', () => {
    const { config } = patchWideFormatProductConfig(
      configOf({
        material_driven_printing: true,
        sizes: [
          { id: 1, label: 'A4', width_mm: 210, height_mm: 297, print_prices: [] },
          { id: 2, label: 'A5', width_mm: 148, height_mm: 210, print_prices: [] },
          { id: 3, label: 'A6', width_mm: 105, height_mm: 148, print_prices: [] },
        ],
        types: [{
          id: 8,
          name: 'Баннеры',
          fullDescription: 'Готовый текст',
          characteristics: ['Пункт'],
          advantages: ['Плюс'],
        }],
        typeConfigs: {
          '8': {
            sizes: [{ id: 20, label: 'А2', width_mm: 594, height_mm: 841, print_prices: [] }],
          },
        },
      }),
      { id: 67, name: 'Баннеры' },
    );
    expect(config.simplified.sizes).toEqual([]);
    expect(config.simplified.types[0].fullDescription).toBe('Готовый текст');
    expect(config.simplified.typeConfigs['8'].sizes.map((size: { label: string; width_mm: number }) => [
      size.label,
      size.width_mm,
    ])).toEqual([
      ['А2', 594],
      ['А1', 594],
      ['А0', 841],
    ]);
  });

  it('does not pull ignored per-size materials into the common list', () => {
    const { config } = patchWideFormatProductConfig(
      configOf({
        types: [{ id: 3, name: 'Основной' }],
        typeConfigs: {
          '3': {
            common_allowed_material_ids: [71, 56],
            sizes: [
              {
                id: 8,
                label: 'А1',
                width_mm: 594,
                height_mm: 841,
                allowed_material_ids: [60, 61],
                default_print: { technology_code: 'sol_m', color_mode: 'color', sides_mode: 'single' },
                print_prices: [{ technology_code: 'sol_m', color_mode: 'color', sides_mode: 'single', tiers: [] }],
              },
            ],
          },
        },
      }),
      { id: 90, name: 'Печать А2, А1, А0' },
    );
    expect(config.simplified.typeConfigs['3'].common_allowed_material_ids).toEqual([71, 56]);
    expect(config.simplified.types[0].fullDescription).toContain('Печать А2, А1, А0');
  });
});

describe('wide format product fields migration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE product_categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        category_id INTEGER,
        name TEXT NOT NULL
      );
      CREATE TABLE print_technologies (code TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE product_template_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        config_data TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    await db.run(`INSERT INTO product_categories (id, name) VALUES (2, 'Полиграфия'), (4, 'Широкоформатная печать')`);
    await db.run(`INSERT INTO print_technologies (code, name) VALUES ('sol_m', 'Сольвентный'), ('laser_prof', 'Лазер')`);
    await db.run(`INSERT INTO products (id, category_id, name) VALUES (95, 4, 'Печать постеров'), (22, 2, 'Визитки')`);
    await db.run(
      `INSERT INTO product_template_configs (product_id, name, config_data, is_active)
       VALUES (95, 'template', ?, 1), (22, 'template', ?, 1)`,
      [
        JSON.stringify({
          simplified: {
            sizes: [{ id: 1, label: 'A5', width_mm: 148, height_mm: 210, print_prices: [] }],
          },
        }),
        JSON.stringify({
          simplified: {
            sizes: [{ id: 1, label: 'A6', width_mm: 105, height_mm: 148, print_prices: [] }],
          },
        }),
      ],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('patches only the wide-format category and can run twice', async () => {
    await up(db);
    await up(db);

    const poster = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs WHERE product_id = 95`,
    );
    const cards = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs WHERE product_id = 22`,
    );
    const posterConfig = JSON.parse(poster!.config_data);
    const cardsConfig = JSON.parse(cards!.config_data);
    expect(posterConfig.simplified.material_driven_printing).toBe(true);
    expect(posterConfig.simplified.types[0].fullDescription).toContain('постеров');
    expect(posterConfig.simplified.sizes.map((size: { label: string }) => size.label)).toEqual(['А2', 'А1', 'А0']);
    expect(cardsConfig.simplified.sizes.map((size: { label: string }) => size.label)).toEqual(['A6']);
    expect(cardsConfig.simplified.types).toBeUndefined();
  });
});
