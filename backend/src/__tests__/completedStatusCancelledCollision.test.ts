import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261001170000_unify_order_status_codes'
import { completedStatusSql } from '../utils/orderStatusCatalog'
import { revenueOrdersCondition } from '../utils/orderFulfillmentScope'

/**
 * Каталог 0..6 (Завершён=6) → unify вставляет «Отменён» как id 7.
 * Hardcoded status=7 в completedStatusSql раньше считал soft-cancel выданным.
 */
describe('completedStatusSql after unify cancelled id 7', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code TEXT
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT,
        status INTEGER NOT NULL,
        is_cancelled INTEGER DEFAULT 0,
        prepaymentStatus TEXT,
        prepaymentAmount REAL DEFAULT 0,
        discount_percent REAL DEFAULT 0,
        createdAt TEXT
      );
    `)
    for (const [id, name, so] of [
      [0, 'Ожидает', 0],
      [1, 'Оформлен', 1],
      [2, 'Принят в работу', 2],
      [3, 'Выполнен', 3],
      [4, 'Передан в ПВЗ', 4],
      [5, 'Получен в ПВЗ', 5],
      [6, 'Завершён', 6],
    ] as const) {
      await db.run('INSERT INTO order_statuses (id, name, sort_order) VALUES (?,?,?)', id, name, so)
    }
    await up(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('не считает soft-cancel (Отменён id=7) завершённым и не тащит в выручку', async () => {
    const cancelled = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE code = 'cancelled' OR name = 'Отменён'`,
    )
    expect(cancelled?.id).toBe(7)

    await db.run(
      `INSERT INTO orders (number, status, is_cancelled, prepaymentStatus, prepaymentAmount, createdAt)
       VALUES ('SOFT-UNPAID', 7, 1, 'pending', 0, '2026-10-01')`,
    )
    await db.run(
      `INSERT INTO orders (number, status, is_cancelled, prepaymentStatus, prepaymentAmount, createdAt)
       VALUES ('REAL-DONE', 6, 0, 'paid', 50, '2026-10-01')`,
    )
    await db.run(
      `INSERT INTO orders (number, status, is_cancelled, prepaymentStatus, prepaymentAmount, createdAt)
       VALUES ('PAID-CANCELLED', 7, 1, 'paid', 80, '2026-10-01')`,
    )

    const completed = (await db.all(
      `SELECT number FROM orders o WHERE ${completedStatusSql('o.status')}`,
    )) as Array<{ number: string }>
    expect(completed.map((row) => row.number)).toEqual(['REAL-DONE'])

    const revenue = (await db.all(
      `SELECT number FROM orders o WHERE ${revenueOrdersCondition('o')}`,
    )) as Array<{ number: string }>
    expect(revenue.map((row) => row.number)).toEqual(['REAL-DONE'])
  })
})
