import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { up } from '../migrations/20260813193000_leaf_variant_prices_only';

describe('leaf variant prices migration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE service_variants (
        id INTEGER PRIMARY KEY,
        service_id INTEGER NOT NULL,
        variant_name TEXT NOT NULL,
        parameters TEXT,
        sort_order INTEGER NOT NULL
      );
      CREATE TABLE service_volume_prices (
        id INTEGER PRIMARY KEY,
        service_id INTEGER NOT NULL,
        variant_id INTEGER,
        min_quantity REAL NOT NULL,
        price_per_unit REAL NOT NULL,
        is_active INTEGER NOT NULL
      );
      CREATE TABLE service_range_boundaries (
        id INTEGER PRIMARY KEY,
        service_id INTEGER NOT NULL,
        min_quantity REAL NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active INTEGER NOT NULL
      );
      CREATE TABLE service_variant_prices (
        id INTEGER PRIMARY KEY,
        variant_id INTEGER NOT NULL,
        range_id INTEGER NOT NULL,
        price_per_unit REAL NOT NULL,
        is_active INTEGER NOT NULL,
        updated_at TEXT,
        UNIQUE (variant_id, range_id)
      );
    `);
    await db.run(
      `INSERT INTO service_variants (id, service_id, variant_name, parameters, sort_order)
       VALUES
         (1, 7, 'Пружина', '{}', 0),
         (2, 7, 'Пружина', '{"type":"Металл"}', 1),
         (3, 7, 'Пружина', '{"parentVariantId":2,"subType":"Белая"}', 2)`,
    );
    await db.run(
      `INSERT INTO service_volume_prices
         (id, service_id, variant_id, min_quantity, price_per_unit, is_active)
       VALUES
         (1, 7, 1, 1, 10, 1),
         (2, 7, 2, 1, 20, 1),
         (3, 7, 3, 1, 30, 1),
         (4, 7, 3, 10, 40, 1)`,
    );
    await db.run(
      `INSERT INTO service_range_boundaries
         (id, service_id, min_quantity, sort_order, is_active)
       VALUES (1, 7, 1, 0, 1)`,
    );
    await db.run(
      `INSERT INTO service_variant_prices
         (id, variant_id, range_id, price_per_unit, is_active)
       VALUES
         (1, 1, 1, 10, 1),
         (2, 2, 1, 20, 1),
         (3, 3, 1, 0, 1)`,
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps prices only on leaves and preserves every legacy range', async () => {
    await up(db);

    const prices = await db.all<Array<{
      variant_id: number;
      min_quantity: number;
      price_per_unit: number;
    }>>(
      `SELECT svp.variant_id, srb.min_quantity, svp.price_per_unit
       FROM service_variant_prices svp
       JOIN service_range_boundaries srb ON srb.id = svp.range_id
       ORDER BY srb.min_quantity`,
    );
    expect(prices).toEqual([
      { variant_id: 3, min_quantity: 1, price_per_unit: 30 },
      { variant_id: 3, min_quantity: 10, price_per_unit: 40 },
    ]);
    const legacyParents = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM service_volume_prices
       WHERE variant_id IN (1, 2)`,
    );
    expect(legacyParents?.count).toBe(0);
  });

  it('does not wipe prices of flat typed peers without an explicit root', async () => {
    await db.exec('DELETE FROM service_variants');
    await db.exec('DELETE FROM service_volume_prices');
    await db.exec('DELETE FROM service_range_boundaries');
    await db.exec('DELETE FROM service_variant_prices');
    await db.run(
      `INSERT INTO service_variants (id, service_id, variant_name, parameters, sort_order)
       VALUES
         (10, 8, 'Скоба', '{"type":"Обычная"}', 0),
         (11, 8, 'Скоба', '{"type":"Премиум"}', 1)`,
    );
    await db.run(
      `INSERT INTO service_volume_prices
         (id, service_id, variant_id, min_quantity, price_per_unit, is_active)
       VALUES
         (10, 8, 10, 1, 5, 1),
         (11, 8, 11, 1, 8, 1)`,
    );
    await db.run(
      `INSERT INTO service_range_boundaries
         (id, service_id, min_quantity, sort_order, is_active)
       VALUES (10, 8, 1, 0, 1)`,
    );
    await db.run(
      `INSERT INTO service_variant_prices
         (id, variant_id, range_id, price_per_unit, is_active)
       VALUES
         (10, 10, 10, 5, 1),
         (11, 11, 10, 8, 1)`,
    );

    await up(db);

    const prices = await db.all<Array<{
      variant_id: number;
      price_per_unit: number;
    }>>(
      `SELECT variant_id, price_per_unit
       FROM service_variant_prices
       ORDER BY variant_id`,
    );
    expect(prices).toEqual([
      { variant_id: 10, price_per_unit: 5 },
      { variant_id: 11, price_per_unit: 8 },
    ]);
    const legacyCount = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM service_volume_prices WHERE variant_id IN (10, 11)`,
    );
    expect(legacyCount?.count).toBe(2);
  });
});
