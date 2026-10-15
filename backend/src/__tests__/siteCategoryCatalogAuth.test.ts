import express from 'express'
import request from 'supertest'
import { authenticate } from '../middleware/auth'

describe('site category catalog auth', () => {
  it('allows anonymous reads of the stable route-key catalog', async () => {
    const app = express()
    app.use(authenticate)
    app.get('/api/products/categories/by-route-key/:routeKey/catalog', (_req, res) => {
      res.json({ ok: true })
    })

    const response = await request(app)
      .get('/api/products/categories/by-route-key/stickers/catalog?withMinPrice=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })
})
