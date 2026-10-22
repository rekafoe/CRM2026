import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { down, up } from '../migrations/20261022213000_quarter_calendar_binding_names';

const OLD_NAMES: Record<string, string> = {
  'spring-1': '1 пружина',
  'spring-1-1': '1+1',
  'spring-3': '3 пружины',
  'spring-3-1': '3+1',
  'spring-3-3': '3+3',
};

describe('quarter calendar binding names', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        route_key TEXT,
        updated_at TEXT
      );
      CREATE TABLE product_template_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        config_data TEXT,
        updated_at TEXT
      );
    `);
  });

  afterEach(async () => {
    await db.close();
  });

  async function seedOldProduct() {
    const result = await db.run(
      `INSERT INTO products (category_id, name, description, route_key)
       VALUES (2, 'Календари квартальные', 'старое описание', 'kvartalnye-kalendari')`
    );
    const config = {
      simplified: {
        types: Object.entries(OLD_NAMES).map(([key, name]) => ({
          key,
          name,
          briefDescription: 'старое',
          characteristics: ['старое'],
        })),
        typeConfigs: {
          '910001': {
            sizes: [
              {
                print_prices: [{ tiers: [{ min_qty: 1, max_qty: 1, unit_price: 27 }] }],
              },
            ],
          },
        },
      },
    };
    await db.run(
      `INSERT INTO product_template_configs (product_id, name, config_data)
       VALUES (?, 'template', ?)`,
      [result.lastID, JSON.stringify(config)]
    );
  }

  async function readState() {
    const product = await db.get<{ description: string }>(
      `SELECT description FROM products WHERE route_key = 'kvartalnye-kalendari'`
    );
    const row = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs WHERE name = 'template'`
    );
    const simplified = JSON.parse(row!.config_data).simplified;
    return { description: product?.description, simplified };
  }

  it('renames bindings to 1, 1+1, 3, 3+1, 3+3 and keeps the unit price', async () => {
    await seedOldProduct();
    await up(db);
    await up(db);

    const { description, simplified } = await readState();
    expect(simplified.types.map((type: { key: string; name: string }) => [type.key, type.name])).toEqual([
      ['spring-1', '1'],
      ['spring-1-1', '1+1'],
      ['spring-3', '3'],
      ['spring-3-1', '3+1'],
      ['spring-3-3', '3+3'],
    ]);
    expect(simplified.types.find((type: { key: string }) => type.key === 'spring-3-3').briefDescription).toMatch(
      /три рекламных поля/
    );
    expect(description).toMatch(/рекламных полей/);
    expect(simplified.typeConfigs['910001'].sizes[0].print_prices[0].tiers[0].unit_price).toBe(27);
  });

  it('restores the previous names on rollback', async () => {
    await seedOldProduct();
    await up(db);
    await down(db);

    const { description, simplified } = await readState();
    expect(simplified.types.map((type: { name: string }) => type.name)).toEqual([
      '1 пружина',
      '1+1',
      '3 пружины',
      '3+1',
      '3+3',
    ]);
    expect(description).toMatch(/1 пружина/);
    expect(simplified.typeConfigs['910001'].sizes[0].print_prices[0].tiers[0].unit_price).toBe(27);
  });

  it('does nothing when the product is missing', async () => {
    await up(db);
    const count = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM products`);
    expect(count?.count).toBe(0);
  });
});
