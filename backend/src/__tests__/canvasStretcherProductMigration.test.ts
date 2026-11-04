import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { down, up } from '../migrations/20261105123000_canvas_stretcher_product';

describe('canvas stretcher product migration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE product_categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        active_for_site INTEGER DEFAULT 0,
        setup_status TEXT,
        calculator_type TEXT,
        product_type TEXT,
        route_key TEXT,
        updated_at TEXT
      );
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
    await db.run(`INSERT INTO product_categories (id, name) VALUES (4, 'Широкоформатная печать')`);
    await db.run(
      `INSERT INTO products (id, category_id, name, is_active, route_key)
       VALUES (137, 4, 'Печать фотографий на холсте', 1, NULL)`
    );
    await db.run(
      `INSERT INTO products (id, category_id, name, route_key)
       VALUES (66, 4, 'Сольвентная печать', 'solvent-printing')`
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('fills product 137 and does not create a second canvas product', async () => {
    await up(db);
    await up(db);

    const products = await db.all<Array<{ id: number; name: string }>>(`SELECT id, name FROM products ORDER BY id`);
    expect(products).toEqual([
      { id: 66, name: 'Сольвентная печать' },
      { id: 137, name: 'Печать фотографий на холсте' },
    ]);

    const solvent = await db.get<{ description: string | null }>(`SELECT description FROM products WHERE id = 66`);
    expect(solvent?.description ?? null).toBeNull();

    const canvas = await db.get<{
      route_key: string;
      calculator_type: string;
      product_type: string;
      active_for_site: number;
      setup_status: string;
      category_id: number;
    }>(`SELECT * FROM products WHERE id = 137`);
    expect(canvas).toMatchObject({
      category_id: 4,
      route_key: 'canvas-photo',
      calculator_type: 'simplified',
      product_type: 'sheet_single',
      active_for_site: 1,
      setup_status: 'ready',
    });

    const config = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs WHERE product_id = 137 AND name = 'template'`
    );
    const simplified = JSON.parse(config!.config_data).simplified;
    expect(simplified.include_material_cost).toBe(false);
    expect(simplified.fixed_unit_prices).toBe(true);
    expect(simplified.sheet_print_smoothing).toBe(true);
    expect(simplified.price_type_multipliers).toEqual({ standard: 1, urgent: 1.3 });
    expect(simplified.types.map((type: { key: string; image_url: string; default?: boolean }) => [
      type.key,
      type.image_url,
      !!type.default,
    ])).toEqual([
      ['stretcher', '/images/wide-format/canvas/stretcher.svg', true],
      ['roll', '/images/wide-format/canvas/roll.svg', false],
    ]);

    const stretcher = simplified.typeConfigs['1371001'];
    expect(stretcher.allowed_price_types).toEqual(['standard', 'urgent']);
    expect(stretcher.common_allowed_material_ids).toEqual([74]);
    expect(stretcher.sizes).toHaveLength(7);
    expect(stretcher.sizes.map((size: { label: string }) => size.label)).toEqual([
      '20×30 см',
      '30×40 см',
      '40×50 см',
      '40×60 см',
      '50×60 см',
      '50×70 см',
      '60×80 см',
    ]);
    const small = stretcher.sizes[0];
    expect(small.width_mm).toBe(200);
    expect(small.height_mm).toBe(300);
    expect(small.default_print.technology_code).toBe('sol_m');
    expect(small.allowed_material_ids).toEqual([74]);
    expect(small.print_prices[0].tiers).toEqual([
      { min_qty: 1, unit_price: 33.3355 },
      { min_qty: 2, unit_price: 32.5518 },
      { min_qty: 5, unit_price: 32.5489 },
      { min_qty: 10, unit_price: 31.7965 },
      { min_qty: 50, unit_price: 31.0815 },
      { min_qty: 100, unit_price: 30.3364 },
    ]);

    const roll = simplified.typeConfigs['1371002'].sizes[0];
    expect(roll.print_prices[0].tiers[0]).toEqual({ min_qty: 1, unit_price: 9.253 });
    expect(roll.print_prices[0].technology_code).toBe('sol_m');
  });

  it('does not invent a product when 137 is missing', async () => {
    await db.run(`DELETE FROM products WHERE id = 137`);
    await up(db);
    const left = await db.all<Array<{ id: number }>>(`SELECT id FROM products`);
    expect(left.map((row) => row.id)).toEqual([66]);
  });

  it('clears only the canvas template on rollback', async () => {
    await up(db);
    await down(db);
    const configs = await db.all<Array<{ product_id: number }>>(`SELECT product_id FROM product_template_configs`);
    expect(configs).toEqual([]);
    const products = await db.all<Array<{ id: number }>>(`SELECT id FROM products ORDER BY id`);
    expect(products.map((row) => row.id)).toEqual([66, 137]);
  });
});
