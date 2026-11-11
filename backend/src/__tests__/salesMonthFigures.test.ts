import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { sqlOrderTotalAfterDiscount } from '../utils/orderAmountsSql'
import { notWaitingStatusSql } from '../utils/orderFulfillmentScope'
import { loadSalesMonthFigures } from '../services/salesManagerOutputService'

async function correlatedTurnover(db: Database, months: string[]): Promise<Map<string, number>> {
  const totalSql = sqlOrderTotalAfterDiscount('o.id', 'COALESCE(o.discount_percent, 0)')
  const rows = await db.all<Array<{ user_id: number; month_key: string; total: number }>>(
    `SELECT c.manager_user_id AS user_id,
            substr(o.created_at, 1, 7) AS month_key,
            ${totalSql} AS total
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE c.type = 'legal'
        AND c.manager_user_id IS NOT NULL
        AND COALESCE(o.is_cancelled, 0) = 0
        AND ${notWaitingStatusSql('o.status')}
        AND LOWER(COALESCE(o.payment_channel, '')) != 'internal'
        AND substr(o.created_at, 1, 7) IN (${months.map(() => '?').join(',')})`,
    months,
  )
  const turnover = new Map<string, number>()
  for (const row of rows) {
    const total = Number(row.total) || 0
    if (total <= 0) continue
    const key = `${Number(row.user_id)}_${row.month_key}`
    turnover.set(key, (turnover.get(key) || 0) + total)
  }
  return turnover
}

describe('оборот юрлиц для экрана процентов', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE order_statuses (id INTEGER PRIMARY KEY, code TEXT, name TEXT);
      INSERT INTO order_statuses (id, code, name) VALUES (1, 'waiting', 'Ожидает');
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        type TEXT,
        manager_user_id INTEGER
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER,
        created_at TEXT,
        status INTEGER,
        discount_percent REAL,
        is_cancelled INTEGER,
        payment_channel TEXT
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        orderId INTEGER,
        price REAL,
        quantity INTEGER,
        params TEXT
      );
      INSERT INTO customers (id, type, manager_user_id) VALUES
        (1, 'legal', 5),
        (2, 'legal', 5),
        (3, 'legal', 6),
        (4, 'person', 5);
      INSERT INTO orders (id, customer_id, created_at, status, discount_percent, is_cancelled, payment_channel) VALUES
        (10, 1, '2026-03-04', 2, 0, 0, 'cash'),
        (11, 1, '2026-03-18', 2, 10, 0, 'cash'),
        (12, 1, '2026-02-02', 2, 0, 0, 'card'),
        (13, 1, '2026-03-01', 2, 0, 0, 'internal'),
        (14, 1, '2026-03-01', 2, 0, 1, 'cash'),
        (15, 1, '2026-03-01', 0, 0, 0, 'cash'),
        (16, 3, '2026-03-20', 2, 0, 0, 'cash');
      INSERT INTO items (id, orderId, price, quantity, params) VALUES
        (1, 10, 1, 1, '{"storedTotalCost":4000}'),
        (2, 10, 1, 1, '{"storedTotalCost":6000}'),
        (3, 11, 100, 2, '{}'),
        (4, 12, 1, 1, '{"storedTotalCost":2500}'),
        (5, 13, 1, 1, '{"storedTotalCost":99999}'),
        (6, 14, 1, 1, '{"storedTotalCost":99999}'),
        (7, 15, 1, 1, '{"storedTotalCost":99999}'),
        (8, 16, 1500, NULL, '{}');
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('совпадает с итогом заказа по подзапросу и не тащит просчёт, отмену и внутренние', async () => {
    const months = ['2026-02', '2026-03']
    const figures = await loadSalesMonthFigures(db, months)
    const expected = await correlatedTurnover(db, months)

    expect(figures.clients.get(5)).toBe(2)
    expect(figures.clients.get(6)).toBe(1)
    expect(Object.fromEntries(figures.turnover)).toEqual(Object.fromEntries(expected))
    expect(figures.turnover.get('5_2026-03')).toBe(10180)
    expect(figures.turnover.get('5_2026-02')).toBe(2500)
    expect(figures.turnover.get('6_2026-03')).toBe(1500)
  })
})
