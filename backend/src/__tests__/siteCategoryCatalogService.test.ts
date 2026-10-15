import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { loadSiteCategoryCatalog } from '../modules/products/services/siteCategoryCatalogService';

describe('site category catalog', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE product_categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        route_key TEXT,
        icon TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        active_for_site INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE product_template_configs (
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        config_data TEXT
      );
    `);
    await db.run(
      `INSERT INTO product_categories (id, name, route_key, icon, is_active)
       VALUES
       (8, 'Наклейки', 'stickers', 'sticker', 1),
       (2, 'Полиграфия', 'print', 'paper', 1)`,
    );
    await db.run(
      `INSERT INTO products (id, category_id, name, is_active, active_for_site)
       VALUES
       (31, 8, '3Д стикеры', 1, 1),
       (46, 8, 'Скрытые наклейки', 1, 0),
       (47, 8, 'Выключенные наклейки', 0, 1),
       (50, 2, 'Визитки', 1, 1)`,
    );
    await db.run(
      `INSERT INTO product_template_configs
       (id, product_id, name, is_active, config_data)
       VALUES (1, 31, 'template', 1, ?)`,
      [
        JSON.stringify({
          simplified: {
            sizes: [
              {
                print_prices: [
                  { tiers: [{ min_qty: 1, unit_price: 0.42 }] },
                ],
              },
            ],
          },
        }),
      ],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns only active_for_site products of the requested category', async () => {
    const catalog = await loadSiteCategoryCatalog(db, ' Stickers ', true);

    expect(catalog?.category).toMatchObject({
      id: 8,
      name: 'Наклейки',
      route_key: 'stickers',
    });
    expect(catalog?.products).toHaveLength(1);
    expect(catalog?.products[0]).toMatchObject({
      id: 31,
      name: '3Д стикеры',
      category_name: 'Наклейки',
      min_price: 0.42,
    });
  });

  it('does not expose disabled or unknown categories', async () => {
    await db.run(`UPDATE product_categories SET is_active = 0 WHERE id = 8`);
    expect(await loadSiteCategoryCatalog(db, 'stickers')).toBeNull();
    expect(await loadSiteCategoryCatalog(db, 'unknown')).toBeNull();
  });
});
