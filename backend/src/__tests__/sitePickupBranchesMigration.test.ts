import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20260823103000_site_pickup_branches'

describe('site pickup branches migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code TEXT,
        address TEXT,
        is_pickup_point INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX idx_departments_code ON departments (code) WHERE code IS NOT NULL AND code != '';
      CREATE TABLE warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fulfillment_department_id INTEGER,
        delivery_json TEXT
      );
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('renames pickup-gikalo to 3Б, adds 104, and rewrites leftover delivery ids', async () => {
    await db.run(
      `INSERT INTO departments (name, description, sort_order, code, address, is_pickup_point, is_active)
       VALUES (?, ?, 0, ?, ?, 1, 1)`,
      ['Проспект Дзержинского 3б', 'Основная точка', 'pickup-gikalo', 'г. Минск, пр. Дзержинского 3б']
    )
    const oldDept = await db.get<{ id: number }>(`SELECT id FROM departments WHERE code = 'pickup-gikalo'`)
    await db.run(
      `INSERT INTO orders (fulfillment_department_id, delivery_json) VALUES (?, ?)`,
      [
        null,
        JSON.stringify({
          kind: 'pickup',
          providerId: 'pickup-gikalo',
          label: 'Проспект Дзержинского 3б',
        }),
      ]
    )

    await up(db)
    await up(db)

    const points = await db.all<{ code: string; name: string; address: string }>(
      `SELECT code, name, address FROM departments ORDER BY sort_order, id`
    )
    expect(points).toEqual([
      {
        code: 'pickup-dzerzhinskogo-3b',
        name: 'Проспект Дзержинского 3Б',
        address: 'г. Минск, пр. Дзержинского 3Б',
      },
      {
        code: 'pickup-dzerzhinskogo-104',
        name: 'Проспект Дзержинского 104',
        address: 'г. Минск, пр. Дзержинского 104',
      },
    ])
    expect(await db.get(`SELECT id FROM departments WHERE code = 'pickup-gikalo'`)).toBeUndefined()

    const renamed = await db.get<{ id: number }>(
      `SELECT id FROM departments WHERE code = 'pickup-dzerzhinskogo-3b'`
    )
    expect(renamed?.id).toBe(oldDept?.id)

    const order = await db.get<{ fulfillment_department_id: number; delivery_json: string }>(
      `SELECT fulfillment_department_id, delivery_json FROM orders WHERE id = 1`
    )
    expect(order?.fulfillment_department_id).toBe(renamed?.id)
    expect(JSON.parse(order!.delivery_json).providerId).toBe('pickup-dzerzhinskogo-3b')

    const warehouses = await db.all<{ department_id: number }>(`SELECT department_id FROM warehouses`)
    expect(warehouses).toHaveLength(2)
  })
})
