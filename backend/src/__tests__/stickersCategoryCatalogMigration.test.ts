import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { up } from '../migrations/20261015160000_stickers_category_catalog';

describe('stickers category catalog migration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT,
        description TEXT,
        image_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        active_for_site INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
      );
    `);
    await db.run(
      `INSERT INTO product_categories
       (id, name, image_url, sort_order, is_active)
       VALUES
       (2, 'Полиграфия', NULL, 0, 1),
       (4, 'Широкоформатная печать', NULL, 2, 1),
       (7, 'Наклейки, стикеры', '/api/uploads/old.png', 6, 1),
       (8, 'Наклейки', '/api/uploads/new.png', 0, 1)`,
    );
    await db.run(
      `INSERT INTO products (id, category_id, name, is_active, active_for_site)
       VALUES
       (31, 2, '3Д стикеры', 1, 1),
       (46, 2, 'Наклейки, стикеры', 1, 1),
       (86, 4, 'Наклейки, стикерпаки', 1, 1),
       (100, 7, 'Этикетки в рулоне', 1, 0),
       (101, 4, 'Вывески на пластике', 1, 1)`,
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('merges sticker categories and moves only sticker products', async () => {
    await up(db);
    await up(db);

    const target = await db.get<{
      id: number;
      name: string;
      route_key: string;
      is_active: number;
      image_url: string;
    }>(`SELECT id, name, route_key, is_active, image_url FROM product_categories WHERE id = 8`);
    expect(target).toEqual({
      id: 8,
      name: 'Наклейки',
      route_key: 'stickers',
      is_active: 1,
      image_url: '/api/uploads/new.png',
    });

    const duplicate = await db.get<{ is_active: number; route_key: string | null }>(
      `SELECT is_active, route_key FROM product_categories WHERE id = 7`,
    );
    expect(duplicate).toEqual({ is_active: 0, route_key: null });

    const moved = await db.all<{ id: number; category_id: number }[]>(
      `SELECT id, category_id FROM products WHERE id IN (31, 46, 86, 100) ORDER BY id`,
    );
    expect(moved).toEqual([
      { id: 31, category_id: 8 },
      { id: 46, category_id: 8 },
      { id: 86, category_id: 8 },
      { id: 100, category_id: 8 },
    ]);
    expect(
      await db.get(`SELECT category_id FROM products WHERE id = 101`),
    ).toEqual({ category_id: 4 });
  });
});
