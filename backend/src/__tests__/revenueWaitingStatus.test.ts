import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { revenueOrdersCondition } from '../utils/orderFulfillmentScope'

describe('revenueOrdersCondition', () => {
  beforeAll(async () => {
    await initDB()
  })

  afterEach(async () => {
    const db = await getDb()
    await db.run(`DELETE FROM items WHERE type = 'TEST-WAIT-REV'`)
    await db.run(`DELETE FROM orders WHERE number LIKE 'TEST-WAIT-REV%'`)
  })

  it('does not count a paid order while its status is Ожидает', async () => {
    const db = await getDb()
    await db.run(
      `INSERT OR IGNORE INTO order_statuses (name, color, sort_order) VALUES ('Ожидает', '#9e9e9e', 1)`,
    )
    await db.run(
      `INSERT OR IGNORE INTO order_statuses (name, color, sort_order) VALUES ('Завершён', '#1b5e20', 7)`,
    )
    const waiting = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Ожидает' LIMIT 1`)
    const done = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Завершён' LIMIT 1`)
    if (!waiting?.id || !done?.id) throw new Error('Не удалось создать статусы')

    const insert = async (number: string, statusId: number) => {
      const order = await db.run(
        `INSERT INTO orders (number, status, createdAt, created_at, prepaymentAmount, prepaymentStatus, paymentMethod)
         VALUES (?, ?, '2026-09-15 12:00:00', '2026-09-15 12:00:00', 800, 'paid', 'offline')`,
        [number, statusId],
      )
      await db.run(
        `INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, 'TEST-WAIT-REV', '{}', 800, 1)`,
        [Number(order.lastID)],
      )
    }

    await insert('TEST-WAIT-REV-WAIT', waiting.id)
    await insert('TEST-WAIT-REV-FIRST', 1)
    await insert('TEST-WAIT-REV-DONE', done.id)

    const row = await db.get<{ waiting_revenue: number; first_revenue: number; done_revenue: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN o.number = 'TEST-WAIT-REV-WAIT' THEN i.price ELSE 0 END), 0) as waiting_revenue,
         COALESCE(SUM(CASE WHEN o.number = 'TEST-WAIT-REV-FIRST' THEN i.price ELSE 0 END), 0) as first_revenue,
         COALESCE(SUM(CASE WHEN o.number = 'TEST-WAIT-REV-DONE' THEN i.price ELSE 0 END), 0) as done_revenue
       FROM orders o
       JOIN items i ON i.orderId = o.id
       WHERE o.number LIKE 'TEST-WAIT-REV%'
         AND ${revenueOrdersCondition('o')}`,
    )

    expect(Number(row?.waiting_revenue)).toBe(0)
    expect(Number(row?.first_revenue)).toBe(0)
    expect(Number(row?.done_revenue)).toBe(800)
  })
})
