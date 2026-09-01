import { getDb, initDB } from '../config/database'
import { OrderItemController } from '../modules/orders/controllers/orderItemController'
import type { Request, Response } from 'express'

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {}
  res.status = ((code: number) => {
    res.statusCode = code
    return res as Response
  }) as Response['status']
  res.json = ((body: unknown) => {
    res.body = body
    return res as Response
  }) as Response['json']
  res.end = (() => res as Response) as Response['end']
  return res as Response & { statusCode?: number; body?: unknown }
}

describe('updateItem adjusts stock for _miniappComponents qty delta', () => {
  let materialId: number
  let orderId: number
  let itemId: number
  let waitingStatusId: number

  beforeAll(async () => {
    await initDB()
    const db = await getDb()

    const existing = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name = ? LIMIT 1`,
      ['Ожидает']
    )
    if (existing?.id) {
      waitingStatusId = existing.id
    } else {
      const inserted = await db.run(
        `INSERT INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)`,
        ['Ожидает', '#999', 1]
      )
      waitingStatusId = Number(inserted.lastID)
    }

    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `MiniappQty Paper ${Date.now()}`,
      'лист',
      100,
      0
    )
    materialId = material.lastID!

    const order = await db.run(
      'INSERT INTO orders (number, status, source, createdAt) VALUES (?, ?, ?, ?)',
      `MINIAPP-QTY-${Date.now()}`,
      waitingStatusId,
      'website',
      new Date().toISOString()
    )
    orderId = order.lastID!
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })

  beforeEach(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    // Имитация auto-deduction: qtyPerItem=2, quantity=5 → списано 10, остаток 90
    await db.run('UPDATE materials SET quantity = 90 WHERE id = ?', materialId)
    const params = JSON.stringify({
      _miniappComponents: [{ materialId, qtyPerItem: 2 }],
    })
    const item = await db.run(
      'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
      orderId,
      'Визитки',
      params,
      10,
      5
    )
    itemId = item.lastID!
  })

  it('досписывает склад при увеличении тиража website/miniapp позиции', async () => {
    const db = await getDb()
    const req = {
      params: { orderId: String(orderId), itemId: String(itemId) },
      body: { quantity: 8 },
      user: { id: 1 },
    } as unknown as Request
    const res = mockRes()

    await OrderItemController.updateItem(req, res)

    expect(res.statusCode === undefined || res.statusCode < 400).toBe(true)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    // 90 - (2 * 3) = 84
    expect(material?.quantity).toBe(84)

    const item = await db.get<{ quantity: number }>('SELECT quantity FROM items WHERE id = ?', itemId)
    expect(item?.quantity).toBe(8)

    const move = await db.get<{ delta: number; reason: string }>(
      `SELECT delta, reason FROM material_moves
       WHERE material_id = ? AND order_id = ?
       ORDER BY id DESC LIMIT 1`,
      materialId,
      orderId
    )
    expect(move?.delta).toBe(-6)
    expect(String(move?.reason || '')).toMatch(/miniapp\/website/)
  })

  it('возвращает склад при уменьшении тиража website/miniapp позиции', async () => {
    const db = await getDb()
    const req = {
      params: { orderId: String(orderId), itemId: String(itemId) },
      body: { quantity: 3 },
      user: { id: 1 },
    } as unknown as Request
    const res = mockRes()

    await OrderItemController.updateItem(req, res)

    expect(res.statusCode === undefined || res.statusCode < 400).toBe(true)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    // 90 + (2 * 2) = 94
    expect(material?.quantity).toBe(94)

    const item = await db.get<{ quantity: number }>('SELECT quantity FROM items WHERE id = ?', itemId)
    expect(item?.quantity).toBe(3)

    const move = await db.get<{ delta: number; reason: string }>(
      `SELECT delta, reason FROM material_moves
       WHERE material_id = ? AND order_id = ?
       ORDER BY id DESC LIMIT 1`,
      materialId,
      orderId
    )
    expect(move?.delta).toBe(4)
    expect(String(move?.reason || '')).toMatch(/miniapp\/website/)
  })
})
