/**
 * send-payment-link must not erase invoice bank (or paid) prepaid when staff
 * opens a BePaid link — full bank must reject over-debt amounts; partial bank
 * keeps status/amount and only attaches paymentUrl/paymentId.
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

jest.mock('../services/bepaidCheckoutService', () => ({
  createBePaidCheckout: jest.fn(async () => ({
    token: 'checkout-token-bank',
    redirectUrl: 'https://checkout.example/pay/bank',
  })),
  BePaidCheckoutError: class BePaidCheckoutError extends Error {
    httpStatus = 502
  },
  resolveBePaidReturnUrls: jest.fn(() => ({
    successUrl: 'https://site/ok',
    failUrl: 'https://site/fail',
    notificationUrl: 'https://api/webhooks/bepaid',
  })),
  splitCustomerName: jest.fn(() => ({ firstName: 'Ivan', lastName: 'Petrov' })),
}))

jest.mock('../utils/isValidEmail', () => ({
  isValidEmailAddress: jest.fn(() => true),
}))

jest.mock('../services/orderStatusSmsService', () => ({
  sendOrderSmsManual: jest.fn(async () => ({ ok: true })),
}))

jest.mock('../services/mailOutboxService', () => ({
  enqueueMail: jest.fn(async () => undefined),
}))

jest.mock('../middleware', () => {
  const actual = jest.requireActual('../middleware')
  return {
    ...actual,
    authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  }
})

import ordersRouter from '../routes/orders'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user?: { id: number; role: string } }).user = {
      id: 1,
      role: 'admin',
    }
    next()
  })
  app.use('/api/orders', ordersRouter)
  return app
}

describe('POST /api/orders/:id/send-payment-link bank wipe', () => {
  beforeEach(() => {
    runMock.mockClear()
    getMock.mockReset()
  })

  it('rejects full-total link when invoice bank already covers the order', async () => {
    const bankOrder = {
      id: 42,
      number: 'ORD-0042',
      customerName: 'OOO Test',
      customerPhone: '+375291111111',
      customerEmail: 'legal@example.com',
      customer_id: null,
      totalAmount: 250,
      prepaymentAmount: 250,
      prepaymentStatus: 'bank',
      paymentMethod: 'online',
      paymentUrl: null,
      paymentId: null,
      payment_channel: 'invoice',
    }
    getMock.mockResolvedValueOnce(bankOrder)

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/42/send-payment-link')
      .send({ amount: 250, channel: 'none' })

    expect(res.status).toBe(400)
    expect(String(res.body?.message || '')).toMatch(/остаток долга/i)
    expect(runMock).not.toHaveBeenCalled()
  })

  it('keeps bank prepaymentAmount/status when creating a remainder link', async () => {
    const bankOrder = {
      id: 43,
      number: 'ORD-0043',
      customerName: 'OOO Test',
      customerPhone: '+375291111111',
      customerEmail: 'legal@example.com',
      customer_id: null,
      totalAmount: 250,
      prepaymentAmount: 100,
      prepaymentStatus: 'bank',
      paymentMethod: 'online',
      paymentUrl: null,
      paymentId: null,
      payment_channel: 'invoice',
    }
    getMock
      .mockResolvedValueOnce(bankOrder)
      .mockResolvedValueOnce({
        ...bankOrder,
        paymentUrl: 'https://checkout.example/pay/bank',
        paymentId: 'checkout-token-bank',
      })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/43/send-payment-link')
      .send({ amount: 150, channel: 'none' })

    expect(res.status).toBe(200)

    const updates = runMock.mock.calls.map((c) => String(c[0]))
    const clobberPending = updates.find(
      (sql) =>
        sql.includes('prepaymentStatus') &&
        sql.includes('pending') &&
        sql.includes('prepaymentAmount'),
    )
    expect(clobberPending).toBeUndefined()

    const linkOnly = updates.find(
      (sql) =>
        sql.includes('paymentUrl') &&
        sql.includes('paymentId') &&
        !sql.includes('prepaymentAmount'),
    )
    expect(linkOnly).toBeTruthy()
    const linkArgs = runMock.mock.calls.find((c) => String(c[0]) === linkOnly)
    expect(linkArgs?.slice(1)).toEqual([
      'https://checkout.example/pay/bank',
      'checkout-token-bank',
      43,
    ])
  })
})
