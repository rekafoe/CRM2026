import { getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { UnifiedWarehouseService } from '../modules/warehouse/services/unifiedWarehouseService'

describe('confirm reservations before «Принят в работу»', () => {
  let materialId: number
  let orderId: number
  let waitingStatusId: number
  let inWorkStatusId: number

  beforeAll(async () => {
    const db = await getDb()

    const ensureStatus = async (name: string, sortOrder: number): Promise<number> => {
      const existing = await db.get<{ id: number }>(
        `SELECT id FROM order_statuses WHERE name = ? LIMIT 1`,
        [name]
      )
      if (existing?.id) return existing.id
      const inserted = await db.run(
        `INSERT INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)`,
        [name, '#5c6bc0', sortOrder]
      )
      return Number(inserted.lastID)
    }

    waitingStatusId = await ensureStatus('Ожидает', 1)
    inWorkStatusId = await ensureStatus('Принят в работу', 3)

    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `InWork Reserve Paper ${Date.now()}`,
      'лист',
      10,
      0
    )
    materialId = material.lastID!

    const order = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `INWORK-${Date.now()}`,
      waitingStatusId,
      new Date().toISOString()
    )
    orderId = order.lastID!
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE material_id = ?', materialId)
    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })

  afterEach(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE material_id = ?', materialId)
    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('UPDATE materials SET quantity = 10 WHERE id = ?', materialId)
    await db.run('UPDATE orders SET status = ? WHERE id = ?', waitingStatusId, orderId)
  })

  it('не подтверждает истёкший резерв и не списывает склад', async () => {
    const db = await getDb()
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    const inserted = await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      8,
      'expired hold',
      expiredAt
    )
    const reservationId = inserted.lastID!

    await expect(UnifiedWarehouseService.confirmReservations([reservationId])).rejects.toThrow(
      /истёк/i
    )

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    expect(material?.quantity).toBe(10)

    const reservation = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE id = ?',
      reservationId
    )
    expect(reservation?.status).toBe('active')
  })

  it('при истёкшем резерве не переводит заказ в «Принят в работу»', async () => {
    const db = await getDb()
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      8,
      'expired hold',
      expiredAt
    )

    await expect(OrderService.updateOrderStatus(orderId, inWorkStatusId)).rejects.toThrow(
      /истёк/i
    )

    const order = await db.get<{ status: number }>('SELECT status FROM orders WHERE id = ?', orderId)
    expect(Number(order?.status)).toBe(waitingStatusId)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    expect(material?.quantity).toBe(10)
  })

  it('при нехватке склада после чужого списания не меняет статус заказа', async () => {
    const db = await getDb()
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      8,
      'active hold',
      expiresAt
    )
    // Склад уже ушёл (например website auto-deduction обошёл резерв)
    await db.run('UPDATE materials SET quantity = 2 WHERE id = ?', materialId)

    await expect(OrderService.updateOrderStatus(orderId, inWorkStatusId)).rejects.toThrow(
      /Недостаточно материала/i
    )

    const order = await db.get<{ status: number }>('SELECT status FROM orders WHERE id = ?', orderId)
    expect(Number(order?.status)).toBe(waitingStatusId)
  })

  it('подтверждает активный резерв и затем ставит «Принят в работу»', async () => {
    const db = await getDb()
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      8,
      'active hold',
      expiresAt
    )

    await OrderService.updateOrderStatus(orderId, inWorkStatusId)

    const order = await db.get<{ status: number }>('SELECT status FROM orders WHERE id = ?', orderId)
    expect(Number(order?.status)).toBe(inWorkStatusId)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    expect(material?.quantity).toBe(2)

    const reservation = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE order_id = ? ORDER BY id DESC LIMIT 1',
      orderId
    )
    expect(reservation?.status).toBe('fulfilled')
  })
})
