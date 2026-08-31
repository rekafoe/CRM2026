import { getDb } from '../config/database'
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

describe('deleteItem restores stock for _miniappComponents', () => {
  let materialId: number
  let orderId: number
  let itemId: number
  let waitingStatusId: number

  beforeAll(async () => {
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
      `MiniappDelete Paper ${Date.now()}`,
      'лист',
      50,
      0
    )
    materialId = material.lastID!

    const order = await db.run(
      'INSERT INTO orders (number, status, source, createdAt) VALUES (?, ?, ?, ?)',
      `MINIAPP-DEL-${Date.now()}`,
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
    await db.run('UPDATE materials SET quantity = 50 WHERE id = ?', materialId)

    // Имитация auto-deduction: склад уже списан, состав в _miniappComponents
    await db.run('UPDATE materials SET quantity = 40 WHERE id = ?', materialId)
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

  it('возвращает списанный объём при удалении website/miniapp позиции', async () => {
    const db = await getDb()
    const req = {
      params: { orderId: String(orderId), itemId: String(itemId) },
      user: { id: 1 },
    } as unknown as Request
    const res = mockRes()

    await OrderItemController.deleteItem(req, res)

    expect(res.statusCode).toBe(204)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    // 40 + (2 * 5) = 50
    expect(material?.quantity).toBe(50)

    const item = await db.get('SELECT id FROM items WHERE id = ?', itemId)
    expect(item).toBeUndefined()

    const move = await db.get<{ delta: number; reason: string }>(
      `SELECT delta, reason FROM material_moves
       WHERE material_id = ? AND order_id = ?
       ORDER BY id DESC LIMIT 1`,
      materialId,
      orderId
    )
    expect(move?.delta).toBe(10)
    expect(String(move?.reason || '')).toMatch(/miniapp\/website/i)
  })
})
