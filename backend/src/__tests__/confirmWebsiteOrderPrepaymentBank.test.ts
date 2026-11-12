/**
 * Website confirm-prepayment must not SET-wipe invoice bank (or paid) prepaid,
 * mirror CRM BePaid webhook: accumulate when paymentUrl open, else max;
 * failed must not zero alreadyCollected; non-website / soft-cancel skipped.
 */
import express from 'express'
import request from 'supertest'

const runMock = jest.fn(async (..._args: unknown[]) => undefined)
const getMock = jest.fn()

jest.mock('../config/database', () => ({
  getDb: jest.fn(async () => ({
    get: getMock,
    run: runMock,
    all: jest.fn(async () => []),
  })),
}))

jest.mock('../utils/tableSchemaCache', () => ({
  hasColumn: jest.fn(async () => true),
}))

const API_KEY = 'website-confirm-prepay-test-key'
const previousKey = process.env.WEBSITE_ORDER_API_KEY
process.env.WEBSITE_ORDER_API_KEY = API_KEY

import ordersRouter from '../routes/orders'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/orders', ordersRouter)
  return app
}

describe('POST /api/orders/from-website/confirm-prepayment bank wipe', () => {
  beforeEach(() => {
    runMock.mockClear()
    getMock.mockReset()
  })

  afterAll(() => {
    if (previousKey === undefined) delete process.env.WEBSITE_ORDER_API_KEY
    else process.env.WEBSITE_ORDER_API_KEY = previousKey
  })

  it('does not SET-wipe invoice bank when there is no open checkout', async () => {
    getMock
      .mockResolvedValueOnce({
        id: 77,
        source: 'website',
        number: 'WEB-0077',
        prepaymentAmount: 200,
        prepaymentStatus: 'bank',
        paymentUrl: null,
        paymentId: null,
        is_cancelled: 0,
      })
      .mockResolvedValueOnce({
        id: 77,
        source: 'website',
        number: 'WEB-0077',
        prepaymentAmount: 200,
        prepaymentStatus: 'paid',
        paymentMethod: 'online',
        totalAmount: 200,
      })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/from-website/77/confirm-prepayment')
      .set('X-API-Key', API_KEY)
      .send({
        paymentStatus: 'successful',
        amount: 50,
        paymentId: 'tx-stale-site',
      })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const paidCall = runMock.mock.calls.find((c) => String(c[0]).includes("prepaymentStatus = 'paid'"))
    expect(paidCall).toBeTruthy()
    // Keep collected 200; do not replace with smaller BePaid 50
    expect(paidCall?.[1]).toBe(200)
  })

  it('accumulates BePaid installment on bank when checkout is open', async () => {
    getMock
      .mockResolvedValueOnce({
        id: 78,
        source: 'website',
        number: 'WEB-0078',
        prepaymentAmount: 100,
        prepaymentStatus: 'bank',
        paymentUrl: 'https://checkout.example/pay/rem',
        paymentId: 'checkout-token-rem',
        is_cancelled: 0,
      })
      .mockResolvedValueOnce({
        id: 78,
        source: 'website',
        number: 'WEB-0078',
        prepaymentAmount: 250,
        prepaymentStatus: 'paid',
        paymentMethod: 'online',
        totalAmount: 250,
      })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/from-website/confirm-prepayment')
      .set('X-API-Key', API_KEY)
      .send({
        orderNumber: 'WEB-0078',
        paymentStatus: 'successful',
        amount: 150,
        paymentId: 'tx-paid-site',
      })

    expect(res.status).toBe(200)
    const paidCall = runMock.mock.calls.find((c) => String(c[0]).includes("prepaymentStatus = 'paid'"))
    expect(paidCall).toBeTruthy()
    expect(paidCall?.[1]).toBe(250)
  })

  it('does not zero bank prepaid on failed BePaid confirm', async () => {
    getMock.mockResolvedValueOnce({
      id: 79,
      source: 'website',
      number: 'WEB-0079',
      prepaymentAmount: 200,
      prepaymentStatus: 'bank',
      paymentUrl: null,
      paymentId: null,
      is_cancelled: 0,
    })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/from-website/79/confirm-prepayment')
      .set('X-API-Key', API_KEY)
      .send({
        paymentStatus: 'failed',
        paymentId: 'tx-fail-site',
      })

    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(true)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('rejects non-website orders', async () => {
    getMock.mockResolvedValueOnce({
      id: 80,
      source: 'crm',
      number: 'CRM-0080',
      prepaymentAmount: 0,
      prepaymentStatus: null,
      paymentUrl: null,
      paymentId: null,
      is_cancelled: 0,
    })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/from-website/80/confirm-prepayment')
      .set('X-API-Key', API_KEY)
      .send({
        paymentStatus: 'successful',
        amount: 40,
        paymentId: 'tx-crm',
      })

    expect(res.status).toBe(403)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('skips soft-cancelled website orders', async () => {
    getMock.mockResolvedValueOnce({
      id: 81,
      source: 'website',
      number: 'WEB-0081',
      prepaymentAmount: 0,
      prepaymentStatus: 'pending',
      paymentUrl: null,
      paymentId: null,
      is_cancelled: 1,
    })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/from-website/81/confirm-prepayment')
      .set('X-API-Key', API_KEY)
      .send({
        paymentStatus: 'successful',
        amount: 40,
        paymentId: 'tx-cancel',
      })

    expect(res.status).toBe(200)
    expect(res.body.skipped).toBe(true)
    expect(res.body.reason).toBe('cancelled')
    expect(runMock).not.toHaveBeenCalled()
  })
})
