import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import { initDB, getDb } from '../config/database'
import reportsRoutes from '../routes/reports'

async function statusIdByCode(code: string, name: string, fallback: number): Promise<number> {
  const db = await getDb()
  try {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE code = ? OR name = ? ORDER BY id LIMIT 1`,
      code,
      name,
    )
    if (row?.id != null) return Number(row.id)
  } catch {
    /* ignore */
  }
  return fallback
}

async function hasPrepaymentUpdatedAtCol(): Promise<boolean> {
  const db = await getDb()
  try {
    const col = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
    return !!col
  } catch {
    return false
  }
}

/**
 * After Issue writes debt_closed, ProgressBar can return the order to «Ожидает».
 * Monthly cash calendar and daily summary must keep the historical issue amount.
 * Mount reports without global auth: department scope with null user = all points.
 */
describe('reports cash after Issue → Ожидает', () => {
  it('daily summary debt_closed_today keeps issued amount when status is Ожидает', async () => {
    await initDB()
    const db = await getDb()
    const hasStamp = await hasPrepaymentUpdatedAtCol()
    const day = '2099-08-21'
    const stamp = `${day} 12:00:00`
    const waitingId = await statusIdByCode('waiting', 'Ожидает', 1)
    const orderNumber = `SUM-WAIT-${Date.now()}`

    if (hasStamp) {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName,
           prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt
         ) VALUES (?, ?, ?, ?, 'summary wait', 100, 'paid', 'offline', ?)`,
        orderNumber,
        waitingId,
        stamp,
        stamp,
        stamp,
      )
    } else {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName,
           prepaymentAmount, prepaymentStatus, paymentMethod
         ) VALUES (?, ?, ?, ?, 'summary wait', 100, 'paid', 'offline')`,
        orderNumber,
        waitingId,
        stamp,
        stamp,
      )
    }
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = order!.id
    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
      orderId,
      day,
      60,
    )

    try {
      const app = express()
      app.use(express.json())
      app.use('/api/reports', reportsRoutes)

      const res = await request(app).get(`/api/reports/daily/${day}/summary`)
      expect(res.status).toBe(200)
      expect(Number(res.body.debt_closed_today)).toBeGreaterThanOrEqual(60)
    } finally {
      await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', orderId)
      await db.run('DELETE FROM orders WHERE id = ?', orderId)
    }
  })

  it('daily-cash-by-month keeps issue remainder when status is Ожидает', async () => {
    await initDB()
    const db = await getDb()
    const hasStamp = await hasPrepaymentUpdatedAtCol()
    const day = '2099-08-22'
    const month = day.slice(0, 7)
    const stamp = `${day} 12:00:00`
    const waitingId = await statusIdByCode('waiting', 'Ожидает', 1)
    const orderNumber = `MON-WAIT-${Date.now()}`

    if (hasStamp) {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName, userId,
           prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt
         ) VALUES (?, ?, ?, ?, 'month wait', 1, 100, 'paid', 'offline', ?)`,
        orderNumber,
        waitingId,
        stamp,
        stamp,
        stamp,
      )
    } else {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName, userId,
           prepaymentAmount, prepaymentStatus, paymentMethod
         ) VALUES (?, ?, ?, ?, 'month wait', 1, 100, 'paid', 'offline')`,
        orderNumber,
        waitingId,
        stamp,
        stamp,
      )
    }
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = order!.id
    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
      orderId,
      day,
      55,
    )

    try {
      const app = express()
      app.use(express.json())
      app.use('/api/reports', reportsRoutes)

      const res = await request(app).get(`/api/reports/daily-cash-by-month`).query({ month })
      expect(res.status).toBe(200)
      const dayCash = res.body?.byDate?.[day]
      expect(dayCash).toBeTruthy()
      expect(Number(dayCash.total)).toBeGreaterThanOrEqual(55)
    } finally {
      await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', orderId)
      await db.run('DELETE FROM orders WHERE id = ?', orderId)
    }
  })
})
