import express from 'express'
import request from 'supertest'
import { initDB, getDb } from '../config/database'
import productRoutes from '../modules/products/routes/products'
import { rateLimiter } from '../middleware/rateLimiter'

describe('Product template configs API', () => {
  const app = express()
  app.use(express.json())
  app.use('/products', productRoutes)

  let productId: number

  beforeAll(async () => {
    await initDB()
    const db = await getDb()

    await db.run('DELETE FROM product_template_configs').catch(() => undefined)
    await db.run('DELETE FROM product_parameters').catch(() => undefined)
    await db.run('DELETE FROM products').catch(() => undefined)
    await db.run('DELETE FROM product_categories').catch(() => undefined)

    const category = await db.run(
      `INSERT INTO product_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      'Тестовая категория',
      'Категория для тестов',
      '',
      1
    )

    const product = await db.run(
      `INSERT INTO products (category_id, name, description, icon, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      category.lastID,
      'Тестовый продукт',
      'Используется в юнит-тестах',
      ''
    )

    productId = product.lastID!
  })

  afterAll(() => {
    rateLimiter.destroy()
  })

  it('возвращает пустой список конфигураций для нового продукта', async () => {
    const response = await request(app).get(`/products/${productId}/configs`)
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('создаёт и возвращает конфигурацию шаблона', async () => {
    const payload = {
      name: 'template',
      config_data: {
        trim_size: { width: 210, height: 297 }
      },
      constraints: {
        print_sheet: 'SRA3'
      }
    }

    const createResponse = await request(app)
      .post(`/products/${productId}/configs`)
      .send(payload)

    expect(createResponse.status).toBe(201)
    expect(createResponse.body).toMatchObject({
      name: 'template',
      config_data: payload.config_data,
      constraints: payload.constraints,
      is_active: true
    })

    const listResponse = await request(app).get(`/products/${productId}/configs`)
    expect(listResponse.status).toBe(200)
    expect(listResponse.body).toHaveLength(1)
    expect(listResponse.body[0]).toMatchObject({
      name: 'template',
      config_data: payload.config_data,
      constraints: payload.constraints
    })
  })

  it('обновляет существующую конфигурацию', async () => {
    const listResponse = await request(app).get(`/products/${productId}/configs`)
    const configId = listResponse.body[0].id

    const updateResponse = await request(app)
      .put(`/products/${productId}/configs/${configId}`)
      .send({
        name: 'template',
        config_data: { trim_size: { width: 148, height: 210 } },
        constraints: { print_sheet: { width: 320, height: 450 } }
      })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body).toMatchObject({
      id: configId,
      config_data: { trim_size: { width: 148, height: 210 } },
      constraints: { print_sheet: { width: 320, height: 450 } }
    })
  })

  it('удаляет конфигурацию', async () => {
    const listResponse = await request(app).get(`/products/${productId}/configs`)
    const configId = listResponse.body[0].id

    const deleteResponse = await request(app).delete(`/products/${productId}/configs/${configId}`)
    expect(deleteResponse.status).toBe(200)
    expect(deleteResponse.body).toEqual({ success: true })

    const afterDelete = await request(app).get(`/products/${productId}/configs`)
    expect(afterDelete.status).toBe(200)
    expect(afterDelete.body).toEqual([])
  })
})

