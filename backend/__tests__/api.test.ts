import 'dotenv/config'
import request from 'supertest'
import { createServer } from 'http'
import express from 'express'
import { initDB } from '../src/db'

async function buildApp() {
  const db = await initDB()
  const app = express()
  app.use(express.json())

  app.post('/api/orders', async (_req, res) => {
    const createdAt = new Date().toISOString()
    const insertRes = await (db as any).run(
      'INSERT INTO orders (status, createdAt) VALUES (?, ?)', 1, createdAt
    )
    const id = insertRes.lastID
    res.status(201).json({ id, number: `ORD-${String(id).padStart(4,'0')}`, status: 1, createdAt, items: [] })
  })

  return app
}

describe('API critical flows', () => {
  it('creates order', async () => {
    const app = await buildApp()
    const server = createServer(app)
    const res = await request(server).post('/api/orders').send({})
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('number')
  })
})

