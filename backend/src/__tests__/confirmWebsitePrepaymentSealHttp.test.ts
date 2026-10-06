import 'dotenv/config'

const API_KEY = 'confirm-seal-test-key'
process.env.WEBSITE_ORDER_API_KEY = API_KEY

import express from 'express'
import request from 'supertest'
import { initDB, getDb } from '../config/database'
import ordersRoutes from '../routes/orders'

describe('confirm-prepayment sealed prepaid', () => {
  beforeAll(async () => {
    process.env.WEBSITE_ORDER_API_KEY = API_KEY
    await initDB()
  })

  function app() {
    const server = express()
    server.use(express.json())
    server.use('/api/orders', ordersRoutes)
    return server
  }

  it('does not overwrite Issue-sealed prepaid on late successful confirm', async () => {
    const db = await getDb()
    const number = `CONF-ISSUE-${Date.now()}`
    const issuePaymentId = `ISSUE-${Date.now()}-1`
    await db.run(
      `INSERT INTO orders (
         number, status, source, createdAt, created_at, customerName,
         prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl
       ) VALUES (?, 7, 'website', datetime('now'), datetime('now'), 'confirm issue',
                 100, 'paid', 'offline', ?, NULL)`,
      number,
      issuePaymentId,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()
    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, date("now","localtime"), 60)',
      order!.id,
    )

    const res = await request(app())
      .post(`/api/orders/from-website/${order!.id}/confirm-prepayment`)
      .set('X-API-Key', API_KEY)
      .send({
        paymentStatus: 'successful',
        amount: 40,
        paymentId: `bepaid-late-${Date.now()}`,
      })

    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(true)
    expect(res.body.reason).toBe('issued')

    const row = await db.get<{
      prepaymentAmount: number | string
      prepaymentStatus: string
      paymentMethod: string
      paymentId: string | null
    }>('SELECT prepaymentAmount, prepaymentStatus, paymentMethod, paymentId FROM orders WHERE id = ?', order!.id)

    expect(Number(row?.prepaymentAmount)).toBe(100)
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.paymentMethod)).toBe('offline')
    expect(String(row?.paymentId)).toBe(issuePaymentId)

    await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', order!.id)
    await db.run('DELETE FROM orders WHERE id = ?', order!.id)
  })

  it('does not overwrite offline-paid prepaid on late successful confirm', async () => {
    const db = await getDb()
    const number = `CONF-OFF-${Date.now()}`
    await db.run(
      `INSERT INTO orders (
         number, status, source, createdAt, created_at, customerName,
         prepaymentAmount, prepaymentStatus, paymentMethod, paymentId, paymentUrl
       ) VALUES (?, 1, 'website', datetime('now'), datetime('now'), 'confirm offline',
                 100, 'paid', 'offline', NULL, NULL)`,
      number,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()

    const res = await request(app())
      .post(`/api/orders/from-website/${order!.id}/confirm-prepayment`)
      .set('X-API-Key', API_KEY)
      .send({
        paymentStatus: 'successful',
        amount: 40,
        paymentId: `bepaid-late-off-${Date.now()}`,
      })

    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(true)
    expect(res.body.reason).toBe('already_paid')

    const row = await db.get<{
      prepaymentAmount: number | string
      paymentMethod: string
    }>('SELECT prepaymentAmount, paymentMethod FROM orders WHERE id = ?', order!.id)
    expect(Number(row?.prepaymentAmount)).toBe(100)
    expect(String(row?.paymentMethod)).toBe('offline')

    await db.run('DELETE FROM orders WHERE id = ?', order!.id)
  })
})
