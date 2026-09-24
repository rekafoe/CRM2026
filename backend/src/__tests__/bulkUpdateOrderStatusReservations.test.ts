import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { UnifiedWarehouseService } from '../modules/warehouse/services/unifiedWarehouseService'

describe('bulkUpdateOrderStatus confirms material reservations', () => {
  beforeAll(async () => {
    await initDB()
  })

  it('spends reserved stock when bulk-setting «Принят в работу»', async () => {
    const db = await getDb()

    const inWork = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name = 'Принят в работу' LIMIT 1`,
    )
    const waiting = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name IN ('Ожидает', 'Новый') ORDER BY id ASC LIMIT 1`,
    )
    expect(inWork?.id).toBeTruthy()
    expect(waiting?.id).toBeTruthy()

    const mat = await db.run(
      `INSERT INTO materials (name, unit, quantity, min_quantity)
       VALUES (?, 'лист', 100, 0)`,
      `bulk-res-mat-${Date.now()}`,
    )
    const materialId = Number(mat.lastID)

    const orderNumber = `BULK-RES-${Date.now()}`
    const orderIns = await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, source)
       VALUES (?, ?, datetime('now'), datetime('now'), 'Bulk Res Test', 0, 'crm')`,
      orderNumber,
      waiting!.id,
    )
    const orderId = Number(orderIns.lastID)

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, 7, 'active', 'test hold', ?)`,
      materialId,
      orderId,
      expiresAt.toISOString(),
    )

    await OrderService.bulkUpdateOrderStatus([orderId], Number(inWork!.id))

    const stock = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )
    expect(Number(stock?.quantity)).toBe(93)

    const reservations = await UnifiedWarehouseService.getReservationsByOrder(orderId)
    expect(reservations.filter((r) => r.status === 'reserved')).toHaveLength(0)

    const fulfilled = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE order_id = ? ORDER BY id DESC LIMIT 1',
      orderId,
    )
    expect(String(fulfilled?.status)).toBe('fulfilled')

    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM material_reservations WHERE order_id = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })
})
