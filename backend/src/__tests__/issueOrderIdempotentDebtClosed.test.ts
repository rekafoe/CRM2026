import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import ordersRoutes from '../routes/orders'
import { initDB, getDb } from '../config/database'
import { rateLimiter } from '../middleware/rateLimiter'
import { OrderManagementService } from '../services/orderManagementService'

/**
 * Double issue (sequential re-click / two endpoints) must not insert a second
 * debt_closed_events row — issued_orders_total SUM would otherwise inflate cash.
 */
describe('issue order debt_closed_events idempotency', () => {
  afterAll(() => {
    rateLimiter.destroy()
  })

  async function seedOrderWithDebt(label: string): Promise<{ orderId: number; remainder: number }> {
    const db = await getDb()
    const orderNumber = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await db.run(
      `INSERT OR IGNORE INTO order_statuses (id, name, color, sort_order) VALUES (1, 'Оформлен', '#4caf50', 1)`,
    )
    await db.run(
      `INSERT OR IGNORE INTO order_statuses (id, name, color, sort_order) VALUES (7, 'Завершён', '#9e9e9e', 7)`,
    )
    const insert = await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, userId, customerName, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'), NULL, ?, 40, 'paid', 'offline')`,
      orderNumber,
      1,
      'Issue idempotency test',
    )
    const orderId = Number(insert.lastID)
    await db.run(
      `INSERT INTO items (orderId, type, params, quantity, price)
       VALUES (?, 'print', ?, 1, 100)`,
      orderId,
      JSON.stringify({ storedTotalCost: 100, description: 'idempotency' }),
    )
    return { orderId, remainder: 60 }
  }

  it('POST /orders/:id/issue twice inserts a single debt_closed_events row', async () => {
    await initDB()
    const { orderId, remainder } = await seedOrderWithDebt('ORD-ISSUE-IDEM')

    const userRow = await dbUserWithToken()
    const app = express()
    app.use(express.json())
    app.use('/api/orders', ordersRoutes)

    const first = await request(app)
      .post(`/api/orders/${orderId}/issue`)
      .set({ Authorization: `Bearer ${userRow.api_token}` })
      .send({ issued_on: '2026-09-07' })
    expect(first.status).toBe(200)
    expect(Number(first.body?.status)).toBe(7)

    const second = await request(app)
      .post(`/api/orders/${orderId}/issue`)
      .set({ Authorization: `Bearer ${userRow.api_token}` })
      .send({ issued_on: '2026-09-07' })
    expect(second.status).toBe(200)
    expect(Number(second.body?.status)).toBe(7)

    const db = await getDb()
    const rows = (await db.all(
      'SELECT amount FROM debt_closed_events WHERE order_id = ?',
      orderId,
    )) as Array<{ amount: number }>
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].amount)).toBe(remainder)
  })

  it('OrderManagementService.issueOrder twice inserts a single debt_closed_events row', async () => {
    await initDB()
    const { orderId, remainder } = await seedOrderWithDebt('ORD-MGMT-ISSUE-IDEM')
    const userRow = await dbUserWithToken()

    const first = await OrderManagementService.issueOrder(orderId, 'manual', userRow.id, '2026-09-07')
    expect(first).toBeTruthy()
    const second = await OrderManagementService.issueOrder(orderId, 'manual', userRow.id, '2026-09-07')
    expect(second).toBeTruthy()

    const db = await getDb()
    const rows = (await db.all(
      'SELECT amount FROM debt_closed_events WHERE order_id = ?',
      orderId,
    )) as Array<{ amount: number }>
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].amount)).toBe(remainder)
  })
})

async function dbUserWithToken(): Promise<{ id: number; api_token: string }> {
  const db = await getDb()
  const existing = await db.get<{ id: number; api_token: string | null }>(
    "SELECT id, api_token FROM users WHERE api_token IS NOT NULL AND trim(api_token) != '' LIMIT 1",
  )
  if (existing?.api_token) {
    return { id: existing.id, api_token: existing.api_token }
  }
  const token = `test-issue-idem-${Date.now()}`
  const inserted = await db.run(
    `INSERT INTO users (name, email, role, api_token, is_active)
     VALUES (?, ?, 'admin', ?, 1)`,
    `Issue Idem ${Date.now()}`,
    `issue-idem-${Date.now()}@example.com`,
    token,
  )
  return { id: Number(inserted.lastID), api_token: token }
}
