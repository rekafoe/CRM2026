import { getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { UnifiedWarehouseService } from '../modules/warehouse/services/unifiedWarehouseService'

describe('skip past «Принят в работу» confirms reservations', () => {
  let materialId: number
  let orderId: number
  let waitingStatusId: number
  let inWorkStatusId: number
  let readyStatusId: number

  beforeAll(async () => {
    const db = await getDb()

    const ensureStatus = async (name: string, sortOrder: number): Promise<number> => {
      const existing = await db.get<{ id: number; sort_order?: number }>(
        `SELECT id, sort_order FROM order_statuses WHERE name = ? LIMIT 1`,
        [name]
      )
      if (existing?.id) {
        if (Number(existing.sort_order) !== sortOrder) {
          await db.run(`UPDATE order_statuses SET sort_order = ? WHERE id = ?`, sortOrder, existing.id)
        }
        return existing.id
      }
      const inserted = await db.run(
        `INSERT INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)`,
        [name, '#5c6bc0', sortOrder]
      )
      return Number(inserted.lastID)
    }

    waitingStatusId = await ensureStatus('Ожидает', 1)
    inWorkStatusId = await ensureStatus('Принят в работу', 3)
    readyStatusId = await ensureStatus('Готов', 5)

    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `SkipInWork Paper ${Date.now()}`,
      'лист',
      20,
      0
    )
    materialId = material.lastID!

    const order = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `SKIP-INWORK-${Date.now()}`,
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
    await db.run('UPDATE materials SET quantity = 20 WHERE id = ?', materialId)
    await db.run('UPDATE orders SET status = ? WHERE id = ?', waitingStatusId, orderId)
  })

  it('списывает склад при прыжке Ожидает → Готов (мимо «Принят в работу»)', async () => {
    const db = await getDb()
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      7,
      'crm hold',
      expiresAt
    )

    await OrderService.updateOrderStatus(orderId, readyStatusId)

    const order = await db.get<{ status: number }>('SELECT status FROM orders WHERE id = ?', orderId)
    expect(Number(order?.status)).toBe(readyStatusId)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    expect(material?.quantity).toBe(13)

    const reservation = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE order_id = ? ORDER BY id DESC LIMIT 1',
      orderId
    )
    expect(reservation?.status).toBe('fulfilled')
  })

  it('по-прежнему списывает при точном «Принят в работу»', async () => {
    const db = await getDb()
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      4,
      'crm hold',
      expiresAt
    )

    await OrderService.updateOrderStatus(orderId, inWorkStatusId)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    expect(material?.quantity).toBe(16)
  })

  it('не списывает повторно при переходе Готов → дальше после уже fulfilled', async () => {
    const db = await getDb()
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString()
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'fulfilled', ?, ?)`,
      materialId,
      orderId,
      5,
      'already spent',
      expiresAt
    )
    await db.run('UPDATE materials SET quantity = 15 WHERE id = ?', materialId)
    await db.run('UPDATE orders SET status = ? WHERE id = ?', readyStatusId, orderId)

    // Прыжок «назад» не должен трогать fulfilled; создаём ещё один active чужой не должен
    const reservations = await UnifiedWarehouseService.getReservationsByOrder(orderId)
    const active = reservations.filter((r) => r.status === 'reserved')
    expect(active).toHaveLength(0)

    await OrderService.updateOrderStatus(orderId, inWorkStatusId)

    const material = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    // inWork sort < ready sort: переход назад — shouldConfirm false (oldSort >= inWorkSort)
    expect(material?.quantity).toBe(15)
  })
})
