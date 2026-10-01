import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261001170000_unify_order_status_codes'

describe('unify order status codes', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT,
        status INTEGER NOT NULL
      );
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('ставит code и не переносит заказы, которые уже смотрят на строку', async () => {
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Ожидает', 1)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Оформлен', 2)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Завершён', 8)`)
    const waiting = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Ожидает'`)
    const issued = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Оформлен'`)
    const done = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Завершён'`)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-WAIT', ?)`, waiting?.id)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-ISSUED', ?)`, issued?.id)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-POOL', 0)`)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-HOLE', 7)`)

    await up(db)
    await up(db)

    const codes = await db.all<{ name: string; code: string }[]>(
      `SELECT name, code FROM order_statuses WHERE code IS NOT NULL ORDER BY sort_order, id`,
    )
    expect(codes.map((row) => `${row.code}:${row.name}`)).toEqual([
      'waiting:Ожидает',
      'placed:Оформлен',
      'in_work:Принят в работу',
      'done:Выполнен',
      'at_pickup:Передан в ПВЗ',
      'picked_up:Получен в ПВЗ',
      'completed:Завершён',
      'cancelled:Отменён',
    ])

    const wait = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-WAIT'`)
    const issuedOrder = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-ISSUED'`)
    const pool = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-POOL'`)
    const hole = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-HOLE'`)
    expect(wait?.status).toBe(waiting?.id)
    expect(issuedOrder?.status).toBe(issued?.id)
    expect(pool?.status).toBe(0)
    expect(hole?.status).toBe(done?.id)
  })

  it('не забирает заказы со status 7, если этот id уже занят другой строкой', async () => {
    await db.run(`INSERT INTO order_statuses (id, name, sort_order) VALUES (7, 'Оформлен', 2)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Завершён', 8)`)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-7', 7)`)

    await up(db)

    const order = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-7'`)
    expect(order?.status).toBe(7)
    const placed = await db.get<{ code: string; name: string }>(`SELECT code, name FROM order_statuses WHERE id = 7`)
    expect(placed).toEqual({ code: 'placed', name: 'Оформлен' })
  })
})
