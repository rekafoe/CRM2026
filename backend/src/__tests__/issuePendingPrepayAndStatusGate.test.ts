import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import { initDB, getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import ordersRoutes from '../routes/orders'
import { authenticate } from '../middleware/auth'

describe('issue pending prepay + status→7 gate', () => {
  let app: express.Express
  let token: string

  beforeAll(async () => {
    await initDB()
    const db = await getDb()
    const user = await db.get<{ id: number; api_token: string | null }>(
      "SELECT id, api_token FROM users WHERE role = 'admin' LIMIT 1",
    )
    if (!user?.api_token) {
      const inserted = await db.run(
        "INSERT INTO users (name, email, role, api_token) VALUES ('issue-test', 'issue-test@example.com', 'admin', 'issue-test-token')",
      )
      token = 'issue-test-token'
      void inserted
    } else {
      token = String(user.api_token)
    }

    app = express()
    app.use(express.json())
    app.use(authenticate)
    app.use('/api/orders', ordersRoutes)
  })

  it('Issue debt_closed ignores unpaid pending online prepaymentAmount', async () => {
    const db = await getDb()
    const number = `PEND-ISSUE-${Date.now()}`
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES (?, 1, datetime('now','localtime'), datetime('now','localtime'), 'pending issue', 100, 'pending', 'online')`,
      number,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()
    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity)
       VALUES (?, 'print', ?, 100, 1)`,
      order!.id,
      JSON.stringify({ storedTotalCost: 100 }),
    )

    const res = await request(app)
      .post(`/api/orders/${order!.id}/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(200)

    const debt = await db.get<{ amount: number }>(
      'SELECT amount FROM debt_closed_events WHERE order_id = ?',
      order!.id,
    )
    expect(Number(debt?.amount)).toBe(100)

    const updated = await db.get<{ prepaymentStatus: string; status: number }>(
      'SELECT prepaymentStatus, status FROM orders WHERE id = ?',
      order!.id,
    )
    expect(String(updated?.prepaymentStatus)).toBe('paid')
    expect(Number(updated?.status)).toBe(7)
  })

  it('updateOrderStatus rejects completion status 7', async () => {
    await expect(OrderService.updateOrderStatus(1, 7)).rejects.toThrow(/выдач/i)
  })
})
