import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import webhooksRoutes from '../routes/webhooks'
import { initDB, getDb } from '../config/database'

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
 * Offline /prepay seals status=paid and clears paymentId/url.
 * Late BePaid successful still resolves by tracking_id/number and must not
 * overwrite sealed prepaymentAmount / paymentMethod.
 */
describe('BePaid webhook after offline paid', () => {
  it('ignores successful notification matched only by tracking_id when already paid', async () => {
    await initDB()
    const db = await getDb()
    const hasStamp = await hasPrepaymentUpdatedAtCol()

    const today = new Date().toISOString().slice(0, 10)
    const orderNumber = `BEP-OFF-${Date.now()}`
    const createdStamp = `${today} 10:00:00`

    if (hasStamp) {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName,
           prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl, prepaymentUpdatedAt
         ) VALUES (?, 1, ?, ?, ?, ?, 'paid', 'offline', NULL, NULL, ?)`,
        orderNumber,
        createdStamp,
        createdStamp,
        'bepaid after offline',
        100,
        createdStamp,
      )
    } else {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName,
           prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl
         ) VALUES (?, 1, ?, ?, ?, ?, 'paid', 'offline', NULL, NULL)`,
        orderNumber,
        createdStamp,
        createdStamp,
        'bepaid after offline',
        100,
      )
    }
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = inserted!.id

    const app = express()
    app.use(express.json())
    app.use('/api/webhooks', webhooksRoutes)

    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .send({
        transaction: {
          uid: `bepaid-late-offline-${Date.now()}`,
          status: 'successful',
          amount: 4000,
          tracking_id: orderNumber,
        },
      })

    expect(res.status).toBe(204)

    const row = await db.get<{
      prepaymentAmount: number | string
      prepaymentStatus: string
      paymentMethod: string
      paymentId: string | null
    }>('SELECT prepaymentAmount, prepaymentStatus, paymentMethod, paymentId FROM orders WHERE id = ?', orderId)

    expect(Number(row?.prepaymentAmount)).toBe(100)
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.paymentMethod)).toBe('offline')
    expect(row?.paymentId == null || String(row.paymentId).trim() === '').toBe(true)

    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })

  it('still applies successful notification when pending (open checkout)', async () => {
    await initDB()
    const db = await getDb()

    const today = new Date().toISOString().slice(0, 10)
    const orderNumber = `BEP-PEND-${Date.now()}`
    const createdStamp = `${today} 10:00:00`
    const checkoutToken = `checkout-${Date.now()}`

    await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl
       ) VALUES (?, 1, ?, ?, ?, ?, 'pending', 'online', ?, ?)`,
      orderNumber,
      createdStamp,
      createdStamp,
      'bepaid pending ok',
      40,
      checkoutToken,
      'https://example.test/pay',
    )
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = inserted!.id

    const app = express()
    app.use(express.json())
    app.use('/api/webhooks', webhooksRoutes)

    const bepaidUid = `bepaid-ok-${Date.now()}`
    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .send({
        transaction: {
          uid: bepaidUid,
          status: 'successful',
          amount: 4000,
          tracking_id: orderNumber,
        },
      })

    expect(res.status).toBe(204)

    const row = await db.get<{
      prepaymentAmount: number | string
      prepaymentStatus: string
      paymentMethod: string
      paymentId: string
    }>('SELECT prepaymentAmount, prepaymentStatus, paymentMethod, paymentId FROM orders WHERE id = ?', orderId)

    expect(Number(row?.prepaymentAmount)).toBe(40)
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.paymentMethod)).toBe('online')
    expect(String(row?.paymentId)).toBe(bepaidUid)

    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })

  it('allows idempotent successful retry for the same paymentId', async () => {
    await initDB()
    const db = await getDb()
    const hasStamp = await hasPrepaymentUpdatedAtCol()

    const today = new Date().toISOString().slice(0, 10)
    const orderNumber = `BEP-IDEM-${Date.now()}`
    const createdStamp = `${today} 10:00:00`
    const bepaidUid = `bepaid-idem-${Date.now()}`

    if (hasStamp) {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName,
           prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl, prepaymentUpdatedAt
         ) VALUES (?, 1, ?, ?, ?, ?, 'paid', 'online', ?, NULL, ?)`,
        orderNumber,
        createdStamp,
        createdStamp,
        'bepaid idempotent',
        40,
        bepaidUid,
        createdStamp,
      )
    } else {
      await db.run(
        `INSERT INTO orders (
           number, status, createdAt, created_at, customerName,
           prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl
         ) VALUES (?, 1, ?, ?, ?, ?, 'paid', 'online', ?, NULL)`,
        orderNumber,
        createdStamp,
        createdStamp,
        'bepaid idempotent',
        40,
        bepaidUid,
      )
    }
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = inserted!.id

    const app = express()
    app.use(express.json())
    app.use('/api/webhooks', webhooksRoutes)

    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .send({
        transaction: {
          uid: bepaidUid,
          status: 'successful',
          amount: 4000,
          tracking_id: orderNumber,
        },
      })

    expect(res.status).toBe(204)

    const row = await db.get<{
      prepaymentAmount: number | string
      prepaymentStatus: string
      paymentMethod: string
      paymentId: string
    }>('SELECT prepaymentAmount, prepaymentStatus, paymentMethod, paymentId FROM orders WHERE id = ?', orderId)

    expect(Number(row?.prepaymentAmount)).toBe(40)
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.paymentMethod)).toBe('online')
    expect(String(row?.paymentId)).toBe(bepaidUid)

    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })
})
