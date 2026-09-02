import { getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { OrderManagementService } from '../services/orderManagementService'
import { UnifiedWarehouseService } from '../modules/warehouse/services/unifiedWarehouseService'

describe('issue confirms active material reservations', () => {
  let materialId = 0
  let orderId = 0
  let reservationId = 0
  const suffix = Date.now()

  beforeAll(async () => {
    const db = await getDb()

    const mat = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Issue confirm paper ${suffix}`,
      'лист',
      500,
      0,
    )
    materialId = Number(mat.lastID)

    const ord = await db.run(
      'INSERT INTO orders (number, status, createdAt, prepaymentAmount, source) VALUES (?, ?, ?, ?, ?)',
      `ISSUE-CONF-${suffix}`,
      1,
      new Date().toISOString(),
      0,
      'crm',
    )
    orderId = Number(ord.lastID)

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const res = await db.run(
      `INSERT INTO material_reservations
         (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      40,
      'test hold for issue',
      expires,
    )
    reservationId = Number(res.lastID)
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM material_reservations WHERE id = ?', reservationId)
    await db.run('DELETE FROM material_reservations WHERE order_id = ?', orderId)
    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', orderId).catch(() => undefined)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })

  it('OrderService.confirmActiveReservationsForOrder spends and fulfills holds', async () => {
    const db = await getDb()
    const before = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(before?.quantity)).toBe(500)

    await OrderService.confirmActiveReservationsForOrder(orderId)

    const after = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(after?.quantity)).toBe(460)

    const hold = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE id = ?',
      reservationId,
    )
    expect(String(hold?.status)).toBe('fulfilled')

    const listed = await UnifiedWarehouseService.getReservationsByOrder(orderId)
    expect(listed.filter((r) => r.status === 'reserved')).toHaveLength(0)
  })

  it('OrderManagementService.issueOrder confirms remaining holds before status=7', async () => {
    const db = await getDb()

    // Second hold (first already fulfilled by previous test)
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const res2 = await db.run(
      `INSERT INTO material_reservations
         (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      15,
      'test hold for management issue',
      expires,
    )
    const reservationId2 = Number(res2.lastID)

    const before = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    const qtyBefore = Number(before?.quantity)

    // manual ≈ CRM orders table path used by pool «выдать»
    const result = await OrderManagementService.issueOrder(orderId, 'manual', null, null)
    expect(result).not.toBeNull()

    const after = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(after?.quantity)).toBe(qtyBefore - 15)

    const hold = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE id = ?',
      reservationId2,
    )
    expect(String(hold?.status)).toBe('fulfilled')

    const order = await db.get<{ status: number }>('SELECT status FROM orders WHERE id = ?', orderId)
    expect(Number(order?.status)).toBe(7)

    await db.run('DELETE FROM material_reservations WHERE id = ?', reservationId2)
  })
})
