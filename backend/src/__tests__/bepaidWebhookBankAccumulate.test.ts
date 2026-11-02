/**
 * BePaid webhook must accumulate installment on top of invoice bank (or paid)
 * when send-payment-link left an open paymentUrl, instead of SET-replacing.
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

import webhooksRouter from '../routes/webhooks'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/webhooks', webhooksRouter)
  return app
}

describe('POST /api/webhooks/bepaid bank accumulate', () => {
  beforeEach(() => {
    runMock.mockClear()
    getMock.mockReset()
  })

  it('adds BePaid installment on top of invoice bank when checkout is open', async () => {
    getMock.mockResolvedValueOnce({
      id: 55,
      prepaymentAmount: 100,
      prepaymentStatus: 'bank',
      paymentUrl: 'https://checkout.example/pay/rem',
      paymentId: 'checkout-token-rem',
    })

    const app = createApp()
    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .send({
        transaction: {
          uid: 'tx-paid-1',
          status: 'successful',
          amount: 15000,
          tracking_id: 'ORD-0055',
        },
      })

    expect(res.status).toBe(204)
    expect(runMock).toHaveBeenCalled()
    const paidCall = runMock.mock.calls.find((c) => String(c[0]).includes("prepaymentStatus = 'paid'"))
    expect(paidCall).toBeTruthy()
    // 100 bank + 150 BePaid
    expect(paidCall?.[1]).toBe(250)
  })

  it('does not downgrade bank to pending on incomplete notification', async () => {
    getMock.mockResolvedValueOnce({
      id: 56,
      prepaymentAmount: 100,
      prepaymentStatus: 'bank',
      paymentUrl: 'https://checkout.example/pay/rem',
      paymentId: 'checkout-token-rem',
    })

    const app = createApp()
    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .send({
        transaction: {
          uid: 'tx-pending-1',
          status: 'pending',
          amount: 15000,
          tracking_id: 'ORD-0056',
        },
      })

    expect(res.status).toBe(204)
    expect(runMock).not.toHaveBeenCalled()
  })
})
