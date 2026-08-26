import type { NextFunction, Request, Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth'
import { signMiniAppSession } from '../utils/miniAppSession'

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

describe('authenticate miniApp token scope', () => {
  const prevSecret = process.env.MINIAPP_SESSION_SECRET

  beforeAll(() => {
    process.env.MINIAPP_SESSION_SECRET = 'test-miniapp-auth-scope-secret'
  })

  afterAll(() => {
    if (prevSecret == null) delete process.env.MINIAPP_SESSION_SECRET
    else process.env.MINIAPP_SESSION_SECRET = prevSecret
  })

  it('rejects valid mapp1 token on CRM order file download (no elevation)', async () => {
    const token = signMiniAppSession('123456789')
    const req = {
      method: 'GET',
      path: '/api/orders/42/files/7/download',
      originalUrl: '/api/orders/42/files/7/download',
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request
    const res = mockRes()
    const next = jest.fn() as NextFunction

    await authenticate(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect((req as AuthenticatedRequest).miniApp).toBeUndefined()
    expect((req as AuthenticatedRequest).user).toBeUndefined()
  })

  it('rejects valid mapp1 token on design-assets mutate routes', async () => {
    const token = signMiniAppSession('123456789')
    const req = {
      method: 'POST',
      path: '/api/design-assets',
      originalUrl: '/api/design-assets',
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request
    const res = mockRes()
    const next = jest.fn() as NextFunction

    await authenticate(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('accepts valid mapp1 token under /api/miniapp', async () => {
    const token = signMiniAppSession('987654321')
    const req = {
      method: 'GET',
      path: '/api/miniapp/orders',
      originalUrl: '/api/miniapp/orders',
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request
    const res = mockRes()
    const next = jest.fn() as NextFunction

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect((req as AuthenticatedRequest).miniApp).toEqual({ telegramUserId: '987654321' })
    expect((req as AuthenticatedRequest).user).toBeUndefined()
  })
})
