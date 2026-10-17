import 'dotenv/config'
import express from 'express'
import request from 'supertest'
import webhooksRoutes from '../routes/webhooks'
import { initDB, getDb } from '../config/database'

/**
 * After Issue seals prepaid (paymentId ISSUE-… + debt_closed), a late BePaid
 * successful notification still resolves the order by tracking_id/number.
 * It must not overwrite sealed prepaymentAmount / paymentMethod.
 */
describe('BePaid webhook after Issue', () => {
  it('ignores successful notification for an already-issued order', async () => {
    await initDB()
    const db = await getDb()

    const today = new Date().toISOString().slice(0, 10)
    const orderNumber = `BEP-ISSUE-${Date.now()}`
    const createdStamp = `${today} 10:00:00`
    const issuePaymentId = `ISSUE-${Date.now()}-1`

    await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl
       ) VALUES (?, 7, ?, ?, ?, ?, 'paid', 'offline', ?, NULL)`,
      orderNumber,
      createdStamp,
      createdStamp,
      'bepaid after issue',
      100,
      issuePaymentId,
    )
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    const orderId = inserted!.id

    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
      orderId,
      today,
      100,
    )

    const app = express()
    app.use(express.json())
    app.use('/api/webhooks', webhooksRoutes)

    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .send({
        transaction: {
          uid: `bepaid-late-${Date.now()}`,
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

    expect(Number(row?.prepaymentAmount)).toBe(100)
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.paymentMethod)).toBe('offline')
    expect(String(row?.paymentId)).toBe(issuePaymentId)

    await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })

  it('still applies successful notification before Issue', async () => {
    await initDB()
    const db = await getDb()

    const today = new Date().toISOString().slice(0, 10)
    const orderNumber = `BEP-OPEN-${Date.now()}`
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
      'bepaid before issue',
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
})
