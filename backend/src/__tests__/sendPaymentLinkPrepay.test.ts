/**
 * send-payment-link must not erase an already-recorded paid prepayment when
 * staff creates a follow-up BePaid link for remaining debt.
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
    token: 'checkout-token-2',
    redirectUrl: 'https://checkout.example/pay/2',
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

describe('POST /api/orders/:id/send-payment-link paid clobber', () => {
  beforeEach(() => {
    runMock.mockClear()
    getMock.mockReset()
  })

  it('keeps paid prepaymentAmount/status when creating a debt follow-up link', async () => {
    const paidOrder = {
      id: 10,
      number: 'ORD-0010',
      customerName: 'Ivan Petrov',
      customerPhone: '+375291111111',
      customerEmail: 'ivan@example.com',
      customer_id: null,
      totalAmount: 100,
      prepaymentAmount: 40,
      prepaymentStatus: 'paid',
      paymentMethod: 'offline',
      paymentUrl: null,
      paymentId: null,
    }
    getMock
      .mockResolvedValueOnce(paidOrder)
      .mockResolvedValueOnce({
        ...paidOrder,
        paymentUrl: 'https://checkout.example/pay/2',
        paymentId: 'checkout-token-2',
        paymentMethod: 'online',
      })

    const app = createApp()
    const res = await request(app)
      .post('/api/orders/10/send-payment-link')
      .send({ amount: 60, channel: 'none' })

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
      'https://checkout.example/pay/2',
      'checkout-token-2',
      10,
    ])
  })
})
