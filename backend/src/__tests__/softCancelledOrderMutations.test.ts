import { getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { OrderItemController } from '../modules/orders/controllers/orderItemController'
import { OrderController } from '../modules/orders/controllers/orderController'
import type { Request, Response } from 'express'

async function ensureOrdersColumn(name: string, ddl: string): Promise<void> {
  const db = await getDb()
  const columns = (await db.all(`PRAGMA table_info(orders)`)) as Array<{ name: string }>
  if ((columns || []).some((c) => c.name === name)) return
  await db.exec(ddl)
}

async function ensureInWorkStatus(): Promise<number> {
  const db = await getDb()
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM order_statuses WHERE name = 'Принят в работу' LIMIT 1`,
  )
  if (existing?.id != null) return Number(existing.id)
  const maxSort = await db.get<{ s: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 as s FROM order_statuses`,
  )
  const inserted = await db.run(
    `INSERT INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)`,
    'Принят в работу',
    '#1976d2',
    Number(maxSort?.s ?? 2),
  )
  return Number(inserted.lastID)
}

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
  return res as Response & { statusCode?: number; body?: unknown }
}

describe('soft-cancelled order mutations', () => {
  beforeAll(async () => {
    await ensureOrdersColumn('is_cancelled', 'ALTER TABLE orders ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0')
  })

  it('rejects addItem after soft-cancel and does not create holds or spend stock', async () => {
    const db = await getDb()
    const stamp = Date.now()
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Cancel-mutate paper ${stamp}`,
      'лист',
      50,
      0,
    )
    const materialId = material.lastID!
    const order = await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, source, is_cancelled)
       VALUES (?, 1, datetime('now'), datetime('now'), 'cancel mutate', 'crm', 0)`,
      `CRM-SOFT-${stamp}`,
    )
    const orderId = order.lastID!

    await OrderService.softCancelOrder(orderId, undefined, 'cleanup abandoned')

    const req = {
      params: { id: String(orderId) },
      body: {
        type: 'sheet',
        params: { description: 'test line' },
        price: 10,
        quantity: 2,
        components: [{ materialId, qtyPerItem: 1 }],
      },
      user: { id: 1 },
    } as unknown as Request
    const res = mockRes()
    await OrderItemController.addItem(req, res)

    expect(res.statusCode).toBe(409)
    expect((res.body as { code?: string })?.code).toBe('ORDER_SOFT_CANCELLED')

    const holds = await db.get<{ c: number }>(
      `SELECT COUNT(*) as c FROM material_reservations WHERE order_id = ? AND status = 'active'`,
      orderId,
    )
    expect(Number(holds?.c)).toBe(0)

    const stock = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(stock?.quantity)).toBe(50)
  })

  it('rejects updateOrderStatus to in-work after soft-cancel (no confirm spend)', async () => {
    const db = await getDb()
    const stamp = Date.now() + 1
    const inWorkId = await ensureInWorkStatus()
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Cancel-status paper ${stamp}`,
      'лист',
      40,
      0,
    )
    const materialId = material.lastID!
    const order = await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, source, is_cancelled)
       VALUES (?, 1, datetime('now'), datetime('now'), 'cancel status', 'crm', 0)`,
      `CRM-STAT-${stamp}`,
    )
    const orderId = order.lastID!
    await db.run(
      `INSERT INTO material_reservations
         (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', 'pre-cancel hold', datetime('now', '+1 day'))`,
      materialId,
      orderId,
      5,
    )

    await OrderService.softCancelOrder(orderId, undefined, 'cancel before accept')

    await expect(OrderService.updateOrderStatus(orderId, inWorkId)).rejects.toMatchObject({
      code: 'ORDER_SOFT_CANCELLED',
    })

    const stock = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(stock?.quantity)).toBe(40)
  })

  it('rejects website confirm-prepayment on soft-cancelled order', async () => {
    const db = await getDb()
    const stamp = Date.now() + 2
    const order = await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName, source,
         prepaymentAmount, prepaymentStatus, is_cancelled
       ) VALUES (?, 1, datetime('now'), datetime('now'), 'site cancel', 'website', 0, 'pending', 0)`,
      `SITE-SOFT-${stamp}`,
    )
    const orderId = order.lastID!
    await OrderService.softCancelOrder(orderId, undefined, 'site abandoned')

    const req = {
      params: { orderId: String(orderId) },
      body: { paymentStatus: 'successful', amount: 25, paymentId: `pay-${stamp}` },
    } as unknown as Request
    const res = mockRes()
    await OrderController.confirmWebsiteOrderPrepayment(req, res)

    expect(res.statusCode).toBe(409)
    expect((res.body as { code?: string })?.code).toBe('ORDER_SOFT_CANCELLED')

    const row = await db.get<{ prepaymentAmount: number; prepaymentStatus: string | null }>(
      'SELECT prepaymentAmount, prepaymentStatus FROM orders WHERE id = ?',
      orderId,
    )
    expect(Number(row?.prepaymentAmount || 0)).toBe(0)
    expect(row?.prepaymentStatus == null || row?.prepaymentStatus === 'pending').toBe(true)
  })
})
