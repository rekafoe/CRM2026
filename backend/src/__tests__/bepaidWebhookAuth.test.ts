import express from 'express'
import request from 'supertest'
import {
  getBePaidShopCredentials,
  isBePaidWebhookAuthorized,
} from '../services/bepaidCheckoutService'
import webhooksRouter from '../routes/webhooks'

const orderRow: {
  id: number
  prepaymentAmount: number
  prepaymentStatus: string | null
  paymentUrl: string | null
  paymentId: string | null
} = {
  id: 42,
  prepaymentAmount: 0,
  prepaymentStatus: null,
  paymentUrl: null,
  paymentId: null,
}

const runMock = jest.fn(async (..._args: unknown[]) => undefined)

jest.mock('../config/database', () => ({
  getDb: jest.fn(async () => ({
    get: jest.fn(async () => ({ ...orderRow })),
    run: runMock,
  })),
}))

jest.mock('../utils/tableSchemaCache', () => ({
  hasColumn: jest.fn(async () => true),
}))

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/webhooks', webhooksRouter)
  return app
}

function basicAuth(shopId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`
}

describe('isBePaidWebhookAuthorized', () => {
  const originalShopId = process.env.BEPAID_SHOP_ID
  const originalSecret = process.env.BEPAID_SECRET_KEY

  afterEach(() => {
    if (originalShopId === undefined) delete process.env.BEPAID_SHOP_ID
    else process.env.BEPAID_SHOP_ID = originalShopId
    if (originalSecret === undefined) delete process.env.BEPAID_SECRET_KEY
    else process.env.BEPAID_SECRET_KEY = originalSecret
  })

  it('rejects missing credentials or bad Authorization', () => {
    delete process.env.BEPAID_SHOP_ID
    delete process.env.BEPAID_SECRET_KEY
    expect(getBePaidShopCredentials()).toBeNull()
    expect(isBePaidWebhookAuthorized('Basic dXNlcjpwYXNz')).toBe(false)

    process.env.BEPAID_SHOP_ID = 'shop-1'
    process.env.BEPAID_SECRET_KEY = 'secret-xyz'
    expect(isBePaidWebhookAuthorized(undefined)).toBe(false)
    expect(isBePaidWebhookAuthorized('Bearer shop-1')).toBe(false)
    expect(isBePaidWebhookAuthorized(basicAuth('shop-1', 'wrong'))).toBe(false)
    expect(isBePaidWebhookAuthorized(basicAuth('shop-1', 'secret-xyz'))).toBe(true)
  })
})

describe('POST /api/webhooks/bepaid auth', () => {
  const originalShopId = process.env.BEPAID_SHOP_ID
  const originalSecret = process.env.BEPAID_SECRET_KEY
  const app = createApp()

  beforeEach(() => {
    process.env.BEPAID_SHOP_ID = 'shop-1'
    process.env.BEPAID_SECRET_KEY = 'secret-xyz'
    runMock.mockClear()
    orderRow.id = 42
    orderRow.prepaymentAmount = 0
    orderRow.prepaymentStatus = null
    orderRow.paymentUrl = null
    orderRow.paymentId = null
  })

  afterAll(() => {
    if (originalShopId === undefined) delete process.env.BEPAID_SHOP_ID
    else process.env.BEPAID_SHOP_ID = originalShopId
    if (originalSecret === undefined) delete process.env.BEPAID_SECRET_KEY
    else process.env.BEPAID_SECRET_KEY = originalSecret
  })

  const paidBody = {
    transaction: {
      uid: 'uid-1',
      status: 'successful',
      amount: 15000,
      tracking_id: 'ORD-1',
    },
  }

  it('returns 401 without Basic Auth (prevents forged paid status)', async () => {
    const res = await request(app).post('/api/webhooks/bepaid').send(paidBody)
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong Basic Auth', async () => {
    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .set('Authorization', basicAuth('shop-1', 'nope'))
      .send(paidBody)
    expect(res.status).toBe(401)
  })

  it('returns 503 when BePaid keys are not configured', async () => {
    delete process.env.BEPAID_SHOP_ID
    delete process.env.BEPAID_SECRET_KEY
    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .set('Authorization', basicAuth('shop-1', 'secret-xyz'))
      .send(paidBody)
    expect(res.status).toBe(503)
  })

  it('accepts authorized BePaid notification', async () => {
    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .set('Authorization', basicAuth('shop-1', 'secret-xyz'))
      .send(paidBody)
    expect(res.status).toBe(204)
  })

  it('accumulates amount when a paid order has an open follow-up checkout', async () => {
    orderRow.prepaymentAmount = 40
    orderRow.prepaymentStatus = 'paid'
    orderRow.paymentUrl = 'https://checkout.example/open'
    orderRow.paymentId = 'checkout-token'

    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .set('Authorization', basicAuth('shop-1', 'secret-xyz'))
      .send(paidBody)
    expect(res.status).toBe(204)
    expect(runMock).toHaveBeenCalled()
    const args = runMock.mock.calls[0]
    expect(String(args[0])).toContain('prepaymentAmount')
    expect(args[1]).toBe(190)
  })

  it('is idempotent for the same payment uid already marked paid', async () => {
    orderRow.prepaymentAmount = 150
    orderRow.prepaymentStatus = 'paid'
    orderRow.paymentUrl = null
    orderRow.paymentId = 'uid-1'

    const res = await request(app)
      .post('/api/webhooks/bepaid')
      .set('Authorization', basicAuth('shop-1', 'secret-xyz'))
      .send(paidBody)
    expect(res.status).toBe(204)
    expect(runMock).not.toHaveBeenCalled()
  })
})
