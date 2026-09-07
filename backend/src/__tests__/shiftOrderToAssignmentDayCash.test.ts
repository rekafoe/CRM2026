import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import ordersRoutes from '../routes/orders'
import { initDB, getDb } from '../config/database'
import { rateLimiter } from '../middleware/rateLimiter'
import { hasColumn } from '../utils/tableSchemaCache'
import { OrderService } from '../modules/orders/services/orderService'

async function dbUserWithToken(): Promise<{ id: number; api_token: string }> {
  const db = await getDb()
  const existing = await db.get<{ id: number; api_token: string | null }>(
    "SELECT id, api_token FROM users WHERE api_token IS NOT NULL AND trim(api_token) != '' LIMIT 1",
  )
  if (existing?.api_token) {
    return { id: existing.id, api_token: existing.api_token }
  }
  const token = `test-token-${Date.now()}`
  const inserted = await db.run(
    `INSERT INTO users (name, email, role, api_token, is_active)
     VALUES (?, ?, 'admin', ?, 1)`,
    `Test User ${Date.now()}`,
    `test-${Date.now()}@example.com`,
    token,
  )
  return { id: Number(inserted.lastID), api_token: token }
}

describe('shiftOrderToAssignmentDay preserves cash payment day', () => {
  afterAll(() => {
    rateLimiter.destroy()
  })

  it('does not rewrite prepaymentUpdatedAt when claiming an order', async () => {
    await initDB()
    const db = await getDb()
    const hasPrepayAt = await hasColumn('orders', 'prepaymentUpdatedAt')
    if (!hasPrepayAt) return

    const orderNumber = `ORD-CASHDAY-${Date.now()}`
    const paidDay = '2026-09-01 15:00:00'
    const insert = await db.run(
      `INSERT INTO orders (
        number, status, createdAt, created_at, userId, customerName,
        prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      orderNumber,
      1,
      '2026-09-01T12:00:00.000Z',
      '2026-09-01 12:00:00',
      'Cash day test',
      50,
      'paid',
      'offline',
      paidDay,
    )
    const orderId = Number(insert.lastID)

    await OrderService.shiftOrderToAssignmentDay(orderId)

    const row = await db.get<{ prepaymentUpdatedAt: string | null; created_at: string | null }>(
      'SELECT prepaymentUpdatedAt, COALESCE(created_at, createdAt) as created_at FROM orders WHERE id = ?',
      orderId,
    )
    expect(String(row?.prepaymentUpdatedAt ?? '').slice(0, 10)).toBe('2026-09-01')
    expect(String(row?.created_at ?? '').slice(0, 10)).not.toBe('2026-09-01')
  })

  it('POST /reassign keeps cash day while moving created_at', async () => {
    await initDB()
    const db = await getDb()
    const hasPrepayAt = await hasColumn('orders', 'prepaymentUpdatedAt')
    if (!hasPrepayAt) return

    const orderNumber = `ORD-CASHDAY-HTTP-${Date.now()}`
    await db.run(
      `INSERT INTO orders (
        number, status, createdAt, created_at, userId, customerName,
        prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      orderNumber,
      1,
      '2026-09-01T12:00:00.000Z',
      '2026-09-01 12:00:00',
      'Cash day http',
      50,
      'paid',
      'offline',
      '2026-09-01 15:00:00',
    )

    const user = await dbUserWithToken()
    const app = express()
    app.use(express.json())
    app.use('/api/orders', ordersRoutes)

    const reassign = await request(app)
      .post(`/api/orders/reassign/${encodeURIComponent(orderNumber)}`)
      .set({ Authorization: `Bearer ${user.api_token}` })
      .send({ userId: user.id })

    expect(reassign.status).toBe(200)

    const row = await db.get<{ prepaymentUpdatedAt: string | null; created_at: string | null }>(
      'SELECT prepaymentUpdatedAt, COALESCE(created_at, createdAt) as created_at FROM orders WHERE number = ?',
      orderNumber,
    )
    expect(String(row?.prepaymentUpdatedAt ?? '').slice(0, 10)).toBe('2026-09-01')
    expect(String(row?.created_at ?? '').slice(0, 10)).not.toBe('2026-09-01')
  })
})
