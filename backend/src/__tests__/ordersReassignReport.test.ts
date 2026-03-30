import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import ordersRoutes from '../routes/orders'
import reportsRoutes from '../routes/reports'
import { initDB, getDb } from '../config/database'
import { rateLimiter } from '../middleware/rateLimiter'

describe('Order reassignment and daily report visibility', () => {
  afterAll(() => {
    rateLimiter.destroy()
  })

  it('POST /reassign sets userId and order is listed in GET /reports/daily/:date/orders', async () => {
    await initDB()
    const db = await getDb()
    const orderNumber = `ORD-SR-${Date.now()}`
    await db.run(
      `INSERT INTO orders (number, status, createdAt, userId, customerName) VALUES (?, ?, ?, NULL, ?)`,
      orderNumber,
      1,
      '1999-12-31T12:00:00.000Z',
      'SR test'
    )

    const userRow = await db.get<{ id: number; api_token: string | null }>(
      'SELECT id, api_token FROM users WHERE api_token IS NOT NULL AND trim(api_token) != \'\' LIMIT 1'
    )
    if (!userRow?.api_token) {
      throw new Error('Нужен хотя бы один пользователь с api_token в БД для интеграционного теста')
    }
    const authHeader = { Authorization: `Bearer ${userRow.api_token}` }

    const app = express()
    app.use(express.json())
    app.use('/api/orders', ordersRoutes)
    app.use('/api/reports', reportsRoutes)

    const targetUserId = userRow.id
    const reassign = await request(app)
      .post(`/api/orders/reassign/${encodeURIComponent(orderNumber)}`)
      .set(authHeader)
      .send({ userId: targetUserId })

    expect(reassign.status).toBe(200)

    const row = await db.get<{ userId: number | null }>(
      'SELECT userId FROM orders WHERE number = ?',
      orderNumber
    )
    expect(row?.userId != null && Number(row.userId)).toBe(targetUserId)

    const today = new Date().toISOString().slice(0, 10)
    const daily = await request(app).get(`/api/reports/daily/${today}/orders`).set(authHeader)
    expect(daily.status).toBe(200)
    const orders = Array.isArray(daily.body?.orders) ? daily.body.orders : []
    const numbers = orders.map((o: { number?: string }) => o.number)
    expect(numbers).toContain(orderNumber)
  })
})
