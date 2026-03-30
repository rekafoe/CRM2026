import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import reportsRoutes from '../routes/reports'
import { initDB, getDb } from '../config/database'
import { rateLimiter } from '../middleware/rateLimiter'

/**
 * Сценарий: заказ выдан с предоплатой — в debt_closed_events сумма остатка (напр. 38),
 * в orders.prepaymentAmount после выдачи полный итог (138). В дневном отчёте
 * cash_from_issue_today должен быть остатком, не 138.
 *
 * Дата попадания в отчёт — через created_at/createdAt (без обязательной prepaymentUpdatedAt).
 */
describe('Daily report cash_from_issue_today (partial prepayment + issue)', () => {
  afterAll(() => {
    rateLimiter.destroy()
  })

  it('GET /reports/daily/:date/orders exposes cash_from_issue_today = debt_closed amount', async () => {
    await initDB()
    const db = await getDb()

    const userRow = await db.get<{ api_token: string | null }>(
      'SELECT api_token FROM users WHERE api_token IS NOT NULL AND trim(api_token) != \'\' LIMIT 1'
    )
    if (!userRow?.api_token) {
      throw new Error('Нужен хотя бы один пользователь с api_token в БД для интеграционного теста')
    }
    const authHeader = { Authorization: `Bearer ${userRow.api_token}` }

    const today = new Date().toISOString().slice(0, 10)
    const orderNumber = `CASH-${Date.now()}`
    const createdStamp = `${today} 12:00:00`

    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, userId, customerName, prepaymentAmount) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      orderNumber,
      7,
      `${createdStamp}.000Z`,
      createdStamp,
      'cash from issue test',
      138
    )
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = inserted!.id

    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
      orderId,
      today,
      38
    )

    const app = express()
    app.use(express.json())
    app.use('/api/reports', reportsRoutes)

    const daily = await request(app).get(`/api/reports/daily/${today}/orders`).set(authHeader)
    expect(daily.status).toBe(200)
    const orders = Array.isArray(daily.body?.orders) ? daily.body.orders : []
    const found = orders.find((o: { number?: string }) => o.number === orderNumber)
    expect(found).toBeTruthy()
    expect(Number(found!.cash_from_issue_today)).toBe(38)
    expect(Number(found!.prepaymentAmount)).toBe(138)
  })
})
