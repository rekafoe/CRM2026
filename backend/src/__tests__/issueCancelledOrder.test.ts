import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import ordersRoutes from '../routes/orders'
import { initDB, getDb } from '../config/database'
import { rateLimiter } from '../middleware/rateLimiter'
import { hasColumn } from '../utils/tableSchemaCache'
import { OrderManagementService } from '../services/orderManagementService'

async function dbUserWithToken(): Promise<{ id: number; api_token: string }> {
  const db = await getDb()
  const existing = await db.get<{ id: number; api_token: string | null }>(
    "SELECT id, api_token FROM users WHERE api_token IS NOT NULL AND trim(api_token) != '' LIMIT 1",
  )
  if (existing?.api_token) {
    return { id: existing.id, api_token: existing.api_token }
  }
  const token = `test-cancel-issue-${Date.now()}`
  const inserted = await db.run(
    `INSERT INTO users (name, email, role, api_token, is_active)
     VALUES (?, ?, 'admin', ?, 1)`,
    `Cancel Issue ${Date.now()}`,
    `cancel-issue-${Date.now()}@example.com`,
    token,
  )
  return { id: Number(inserted.lastID), api_token: token }
}

describe('issue rejects soft-cancelled orders', () => {
  afterAll(() => {
    rateLimiter.destroy()
  })

  it('POST /orders/:id/issue returns 409 when is_cancelled=1', async () => {
    await initDB()
    const db = await getDb()
    const hasIsCancelled = await hasColumn('orders', 'is_cancelled')
    if (!hasIsCancelled) return

    const orderNumber = `ORD-CANCEL-ISSUE-${Date.now()}`
    const insert = await db.run(
      `INSERT INTO orders (number, status, createdAt, userId, customerName, is_cancelled, prepaymentAmount)
       VALUES (?, ?, datetime('now'), NULL, ?, 1, 0)`,
      orderNumber,
      1,
      'Cancelled issue test',
    )
    const orderId = Number(insert.lastID)
    const user = await dbUserWithToken()

    const app = express()
    app.use(express.json())
    app.use('/api/orders', ordersRoutes)

    const res = await request(app)
      .post(`/api/orders/${orderId}/issue`)
      .set({ Authorization: `Bearer ${user.api_token}` })
      .send({})

    expect(res.status).toBe(409)
    expect(String(res.body?.message || '')).toMatch(/отменён/i)

    const debt = await db.get<{ c: number }>(
      'SELECT COUNT(1) as c FROM debt_closed_events WHERE order_id = ?',
      orderId,
    )
    expect(Number(debt?.c ?? 0)).toBe(0)

    const statusRow = await db.get<{ status: number; is_cancelled: number }>(
      'SELECT status, is_cancelled FROM orders WHERE id = ?',
      orderId,
    )
    expect(Number(statusRow?.is_cancelled)).toBe(1)
    expect(Number(statusRow?.status)).not.toBe(7)
  })

  it('OrderManagementService.issueOrder throws for soft-cancelled order', async () => {
    await initDB()
    const db = await getDb()
    const hasIsCancelled = await hasColumn('orders', 'is_cancelled')
    if (!hasIsCancelled) return

    const insert = await db.run(
      `INSERT INTO orders (number, status, createdAt, userId, customerName, is_cancelled, prepaymentAmount)
       VALUES (?, ?, datetime('now'), NULL, ?, 1, 0)`,
      `ORD-CANCEL-MGMT-${Date.now()}`,
      1,
      'Cancelled mgmt issue',
    )
    const orderId = Number(insert.lastID)
    const user = await dbUserWithToken()

    await expect(
      OrderManagementService.issueOrder(orderId, 'manual', user.id, '2026-09-07'),
    ).rejects.toThrow(/отменён/i)

    const debt = await db.get<{ c: number }>(
      'SELECT COUNT(1) as c FROM debt_closed_events WHERE order_id = ?',
      orderId,
    )
    expect(Number(debt?.c ?? 0)).toBe(0)
  })
})
