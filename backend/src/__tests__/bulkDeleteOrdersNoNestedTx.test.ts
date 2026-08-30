import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'

describe('bulkDeleteOrders nested transaction', () => {
  beforeAll(async () => {
    await initDB()
  })

  it('deletes cancelled orders without nested BEGIN failure', async () => {
    const db = await getDb()

    const waiting = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name IN ('Ожидает', 'Новый') ORDER BY id ASC LIMIT 1`,
    )
    expect(waiting?.id).toBeTruthy()

    const insertCancelled = async (label: string) => {
      const number = `BULK-DEL-${label}-${Date.now()}`
      const ins = await db.run(
        `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, source, is_cancelled)
         VALUES (?, ?, datetime('now'), datetime('now'), ?, 0, 'crm', 1)`,
        number,
        waiting!.id,
        label,
      )
      return Number(ins.lastID)
    }

    const a = await insertCancelled('A')
    const b = await insertCancelled('B')

    const result = await OrderService.bulkDeleteOrders(
      [a, b],
      undefined,
      'admin bulk delete test',
    )
    expect(result.deletedCount).toBe(2)

    const left = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM orders WHERE id IN (?, ?)',
      a,
      b,
    )
    expect(Number(left?.c)).toBe(0)
  })
})
