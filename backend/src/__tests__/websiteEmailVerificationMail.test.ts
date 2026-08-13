import express from 'express'
import request from 'supertest'
import { authMiddleware } from '../middleware/auth'
import { constantTimeKeyEquals } from '../middleware/authMailApiKey'
import { rateLimiter } from '../middleware/rateLimiter'
import mailRoutes from '../routes/mail'
import { enqueueMail } from '../services/mailOutboxService'
import {
  buildWebsiteEmailVerificationMessage,
  WEBSITE_EMAIL_VERIFICATION_SUBJECT,
} from '../services/websiteEmailVerificationService'

jest.mock('../services/mailOutboxService', () => ({
  enqueueMail: jest.fn(),
  getMailOutboxStats: jest.fn(),
  listMailJobsForOrder: jest.fn(),
  noteMailJobBounce: jest.fn(),
  processMailOutboxBatch: jest.fn(),
}))

const mockedEnqueueMail = enqueueMail as jest.MockedFunction<typeof enqueueMail>

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(authMiddleware)
  app.use('/api/mail', mailRoutes)
  return app
}

function createGatewayOnlyApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/mail', mailRoutes)
  return app
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    to: 'user@example.com',
    userName: 'Иван',
    verificationUrl: 'https://printcore.by/verify-email?token=token-123',
    idempotencyKey: 'verify-user-123',
    ...overrides,
  }
}

describe('POST /api/mail/website/email-verification', () => {
  const originalAuthMailApiKey = process.env.AUTH_MAIL_API_KEY
  const originalWebsiteOrderApiKey = process.env.WEBSITE_ORDER_API_KEY
  const originalNodeEnv = process.env.NODE_ENV
  const originalDevOrigins = process.env.AUTH_MAIL_VERIFICATION_DEV_ORIGINS
  const app = createApp()
  const gatewayOnlyApp = createGatewayOnlyApp()

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH_MAIL_API_KEY = 'mail-gateway-secret'
    process.env.NODE_ENV = 'test'
    delete process.env.AUTH_MAIL_VERIFICATION_DEV_ORIGINS
    mockedEnqueueMail.mockResolvedValue({ id: 101 })
  })

  afterAll(() => {
    if (originalAuthMailApiKey === undefined) delete process.env.AUTH_MAIL_API_KEY
    else process.env.AUTH_MAIL_API_KEY = originalAuthMailApiKey
    if (originalWebsiteOrderApiKey === undefined) delete process.env.WEBSITE_ORDER_API_KEY
    else process.env.WEBSITE_ORDER_API_KEY = originalWebsiteOrderApiKey
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalDevOrigins === undefined) delete process.env.AUTH_MAIL_VERIFICATION_DEV_ORIGINS
    else process.env.AUTH_MAIL_VERIFICATION_DEV_ORIGINS = originalDevOrigins
    rateLimiter.destroy()
  })

  it('rejects a missing or wrong dedicated key', async () => {
    const missing = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.1')
      .send(validBody())
    expect(missing.status).toBe(401)

    const wrong = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.2')
      .set('X-API-Key', 'wrong-key')
      .send(validBody())
    expect(wrong.status).toBe(401)
    expect(mockedEnqueueMail).not.toHaveBeenCalled()
  })

  it('does not accept an admin Bearer token or WEBSITE_ORDER_API_KEY', async () => {
    process.env.WEBSITE_ORDER_API_KEY = 'website-order-secret'

    const bearer = await request(gatewayOnlyApp)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.6')
      .set('Authorization', 'Bearer mail-gateway-secret')
      .send(validBody())
    expect(bearer.status).toBe(401)

    const websiteKey = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('X-API-Key', 'website-order-secret')
      .send(validBody())
    expect(websiteKey.status).toBe(401)
    expect(mockedEnqueueMail).not.toHaveBeenCalled()
  })

  it('fails closed with 503 when AUTH_MAIL_API_KEY is unset', async () => {
    delete process.env.AUTH_MAIL_API_KEY
    const response = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.3')
      .set('X-API-Key', 'any-key')
      .send(validBody())

    expect(response.status).toBe(503)
    expect(mockedEnqueueMail).not.toHaveBeenCalled()
  })

  it('uses a fixed transactional template and does not accept arbitrary content', async () => {
    const response = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.4')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody())

    expect(response.status).toBe(202)
    expect(response.body).toEqual({
      ok: true,
      jobId: 101,
      duplicate: false,
      queued: true,
    })
    expect(mockedEnqueueMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: WEBSITE_EMAIL_VERIFICATION_SUBJECT,
        jobType: 'transactional',
        idempotencyKey: 'website-email-verification:verify-user-123',
        maxAttempts: 5,
      }),
    )

    const arbitrary = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.5')
      .set('X-API-Key', 'mail-gateway-secret')
      .send({
        ...validBody(),
        subject: 'Arbitrary subject',
        html: '<p>open relay</p>',
      })
    expect(arbitrary.status).toBe(400)
    expect(mockedEnqueueMail).toHaveBeenCalledTimes(1)
  })

  it('rejects unknown and dangerous body fields', async () => {
    for (const [index, field] of ['content', 'from', 'bcc', 'redirectUrl', 'constructor'].entries()) {
      const response = await request(app)
        .post('/api/mail/website/email-verification')
        .set('X-Forwarded-For', `203.0.113.${10 + index}`)
        .set('X-API-Key', 'mail-gateway-secret')
        .send({ ...validBody(), [field]: 'not-allowed' })
      expect(response.status).toBe(400)
    }
    expect(mockedEnqueueMail).not.toHaveBeenCalled()
  })

  it('validates recipient email and field lengths', async () => {
    for (const [index, body] of [
      validBody({ to: 'not-an-email' }),
      validBody({ to: 'a@b..example' }),
      validBody({ userName: '' }),
      validBody({ userName: 'x'.repeat(121) }),
      validBody({ idempotencyKey: 'short' }),
    ].entries()) {
      const response = await request(app)
        .post('/api/mail/website/email-verification')
        .set('X-Forwarded-For', `203.0.113.${30 + index}`)
        .set('X-API-Key', 'mail-gateway-secret')
        .send(body)
      expect(response.status).toBe(400)
    }
    expect(mockedEnqueueMail).not.toHaveBeenCalled()
  })

  it.each([
    'http://printcore.by/verify-email?token=abc',
    'https://evil.example/verify-email?token=abc',
    'https://printcore.by:8443/verify-email?token=abc',
    'https://printcore.by/other?token=abc',
    'https://printcore.by/verify-email?token=abc&next=https://evil.example',
    'https://user@printcore.by/verify-email?token=abc',
    '//printcore.by/verify-email?token=abc',
    'https://printcore.by/verify-email?token=abc#fragment',
  ])('rejects disallowed verification URL %s', async (verificationUrl) => {
    const response = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '198.51.100.200')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody({ verificationUrl }))

    expect(response.status).toBe(400)
    expect(mockedEnqueueMail).not.toHaveBeenCalled()
  })

  it('allows an explicitly configured loopback origin only outside production', async () => {
    process.env.AUTH_MAIL_VERIFICATION_DEV_ORIGINS = 'http://localhost:3000'
    const devResponse = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.50')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody({
        verificationUrl: 'http://localhost:3000/verify-email?token=dev-token',
      }))
    expect(devResponse.status).toBe(202)

    process.env.NODE_ENV = 'production'
    const productionResponse = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.51')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody({
        verificationUrl: 'http://localhost:3000/verify-email?token=dev-token',
      }))
    expect(productionResponse.status).toBe(400)
  })

  it('escapes userName and URL in HTML', () => {
    const message = buildWebsiteEmailVerificationMessage({
      userName: '<img src=x onerror=alert(1)> & "Иван"',
      verificationUrl: 'https://printcore.by/verify-email?token=a&unsafe="quoted"',
    })

    expect(message.html).toContain(
      '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Иван&quot;',
    )
    expect(message.html).toContain(
      'href="https://printcore.by/verify-email?token=a&amp;unsafe=&quot;quoted&quot;"',
    )
    expect(message.html).not.toContain('<img src=x')
  })

  it('passes a stable namespaced idempotency key to the existing outbox', async () => {
    mockedEnqueueMail
      .mockResolvedValueOnce({ id: 77 })
      .mockResolvedValueOnce({ id: 77, duplicate: true })

    const first = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.60')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody())
    const retry = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.61')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody())

    expect(first.body).toMatchObject({ jobId: 77, duplicate: false })
    expect(retry.body).toMatchObject({ jobId: 77, duplicate: true })
    expect(mockedEnqueueMail.mock.calls[0][0].idempotencyKey).toBe(
      mockedEnqueueMail.mock.calls[1][0].idempotencyKey,
    )
  })

  it('applies the dedicated endpoint rate limit', async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const response = await request(app)
        .post('/api/mail/website/email-verification')
        .set('X-Forwarded-For', '203.0.113.250')
        .set('X-API-Key', 'mail-gateway-secret')
        .send(validBody({ idempotencyKey: `rate-limit-${attempt}` }))
      expect(response.status).toBe(202)
    }

    const limited = await request(app)
      .post('/api/mail/website/email-verification')
      .set('X-Forwarded-For', '203.0.113.250')
      .set('X-API-Key', 'mail-gateway-secret')
      .send(validBody({ idempotencyKey: 'rate-limit-21' }))
    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBeDefined()
  })

  it('keeps existing mail routes behind CRM authentication', async () => {
    const response = await request(app)
      .get('/api/mail/config')
      .set('X-Forwarded-For', '203.0.113.70')
    expect(response.status).toBe(401)
  })
})

describe('mail gateway constant-time key comparison', () => {
  it('matches only equal keys, including different-length failures', () => {
    expect(constantTimeKeyEquals('same-secret', 'same-secret')).toBe(true)
    expect(constantTimeKeyEquals('same-secret', 'other-secret')).toBe(false)
    expect(constantTimeKeyEquals('short', 'a-much-longer-secret')).toBe(false)
    expect(constantTimeKeyEquals('', 'same-secret')).toBe(false)
  })
})
