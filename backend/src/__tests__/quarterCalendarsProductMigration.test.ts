import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { down, up } from '../migrations/20261022193000_quarter_calendars_product';

describe('quarter calendars product migration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE product_categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0
      );
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        active_for_site INTEGER DEFAULT 0,
        setup_status TEXT,
        calculator_type TEXT,
        product_type TEXT,
        route_key TEXT,
        operator_percent REAL DEFAULT 0,
        created_at TEXT,
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
    await db.run(
      `INSERT INTO product_categories (id, name, is_active) VALUES (2, 'Полиграфия', 1)`
    );
  });

  afterEach(async () => {
    await db.close();
  });

  async function readProduct() {
    const product = await db.get<{
      id: number;
      category_id: number;
      name: string;
      is_active: number;
      active_for_site: number;
      setup_status: string;
      calculator_type: string;
      product_type: string;
      route_key: string;
    }>(`SELECT * FROM products WHERE route_key = 'kvartalnye-kalendari'`);
    const config = product
      ? await db.get<{ config_data: string }>(
          `SELECT config_data FROM product_template_configs WHERE product_id = ? AND name = 'template'`,
          [product.id]
        )
      : undefined;
    return { product, simplified: config ? JSON.parse(config.config_data).simplified : null };
  }

  it('creates one poligraphy product with five binding prices and no extra material', async () => {
    await up(db);
    await up(db);

    const products = await db.all<Array<{ id: number }>>(
      `SELECT id FROM products WHERE route_key = 'kvartalnye-kalendari'`
    );
    expect(products).toHaveLength(1);

    const { product, simplified } = await readProduct();
    expect(product).toMatchObject({
      category_id: 2,
      name: 'Календари квартальные',
      is_active: 1,
      active_for_site: 1,
      setup_status: 'ready',
      calculator_type: 'simplified',
      product_type: 'sheet_single',
    });
    expect(simplified.include_material_cost).toBe(false);
    expect(simplified.use_layout).toBe(false);
    expect(simplified.sheet_print_smoothing).toBe(false);
    expect(simplified.types.map((type: { key: string; default?: boolean }) => [type.key, !!type.default])).toEqual([
      ['spring-1', false],
      ['spring-1-1', false],
      ['spring-3', false],
      ['spring-3-1', true],
      ['spring-3-3', false],
    ]);

    const single = simplified.typeConfigs['910001'].sizes[0];
    const triple = simplified.typeConfigs['910005'].sizes[0];
    expect(single.allowed_material_ids).toEqual([]);
    expect(single.finishing).toEqual([]);
    expect(single.items_per_sheet_override).toBe(1);
    expect(single.print_prices[0].tiers).toEqual([
      { min_qty: 1, max_qty: 1, unit_price: 27 },
      { min_qty: 2, max_qty: 49, unit_price: 22.8 },
      { min_qty: 50, max_qty: 99, unit_price: 13.8 },
      { min_qty: 100, unit_price: 9 },
    ]);
    expect(triple.print_prices[0].tiers.find((tier: { min_qty: number }) => tier.min_qty === 100).unit_price).toBe(27.6);
    expect(simplified.typeConfigs['910004'].sizes[0].print_prices[0].tiers[0].unit_price).toBe(41.4);
  });

  it('removes only this product on rollback', async () => {
    await db.run(
      `INSERT INTO products (category_id, name, route_key, is_active) VALUES (2, 'Визитки', 'bussiness-card', 1)`
    );
    await up(db);
    await down(db);

    const left = await db.all<Array<{ route_key: string }>>(`SELECT route_key FROM products ORDER BY id`);
    expect(left.map((row) => row.route_key)).toEqual(['bussiness-card']);
    const configs = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM product_template_configs`
    );
    expect(configs?.count).toBe(0);
  });
});
