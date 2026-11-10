import express from 'express'
import request from 'supertest'
import { authenticate } from '../middleware/auth'

/**
 * ensure / projects / clone-draft стоят после requireWebsiteOrderApiKey в publicEditor.ts,
 * но auth middleware раньше режет JWT. Без PUBLIC_ROUTE_RULES сайт с одним API-ключом
 * получает 401 и не доходит до проверки ключа.
 */
describe('public-editor projects/customers auth gates', () => {
  const app = express()
  app.use(authenticate)
  app.get('/api/public-editor/projects', (_req, res) => {
    res.json({ ok: true, route: 'projects' })
  })
  app.post('/api/public-editor/projects/7/clone-draft', (_req, res) => {
    res.json({ ok: true, route: 'clone' })
  })
  app.post('/api/public-editor/customers/ensure', (_req, res) => {
    res.json({ ok: true, route: 'ensure' })
  })
  app.get('/api/public-editor/secret', (_req, res) => {
    res.json({ ok: true, route: 'secret' })
  })

  it('allows anonymous (API-key later) GET /projects', async () => {
    const response = await request(app).get('/api/public-editor/projects?customerId=1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, route: 'projects' })
  })

  it('allows anonymous POST /projects/:id/clone-draft', async () => {
    const response = await request(app).post('/api/public-editor/projects/7/clone-draft')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, route: 'clone' })
  })

  it('allows anonymous POST /customers/ensure', async () => {
    const response = await request(app).post('/api/public-editor/customers/ensure')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, route: 'ensure' })
  })

  it('still requires auth for unrelated public-editor paths', async () => {
    const response = await request(app).get('/api/public-editor/secret')
    expect(response.status).toBe(401)
  })
})
