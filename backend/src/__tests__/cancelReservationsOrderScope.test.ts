import { UnifiedWarehouseService } from '../modules/warehouse/services/unifiedWarehouseService'
import { getDb } from '../config/database'

describe('UnifiedWarehouseService.cancelReservations order scope', () => {
  let materialId: number
  let orderA: number
  let orderB: number
  let holdA: number
  let holdB: number

  beforeAll(async () => {
    const db = await getDb()
    const stamp = Date.now()
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Scope paper ${stamp}`,
      'лист',
      500,
      10,
    )
    materialId = material.lastID!

    const a = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `SCOPE-A-${stamp}`,
      1,
      new Date().toISOString(),
    )
    orderA = a.lastID!
    const b = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `SCOPE-B-${stamp}`,
      1,
      new Date().toISOString(),
    )
    orderB = b.lastID!

    const expires = new Date()
    expires.setHours(expires.getHours() + 24)
    const expiresAt = expires.toISOString()

    const ra = await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderA,
      10,
      'hold A',
      expiresAt,
    )
    holdA = ra.lastID!
    const rb = await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderB,
      5,
      'hold B',
      expiresAt,
    )
    holdB = rb.lastID!
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE id IN (?, ?)', holdA, holdB)
    await db.run('DELETE FROM orders WHERE id IN (?, ?)', orderA, orderB)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })

  it('does not cancel another order hold when orderId is scoped', async () => {
    const db = await getDb()

    // Junk order B planted victim holdA id in params; delete/qty↓ must pass orderB.
    await UnifiedWarehouseService.cancelReservations([holdA, holdB], { orderId: orderB })

    const rowA = await db.get<{ status: string }>('SELECT status FROM material_reservations WHERE id = ?', holdA)
    const rowB = await db.get<{ status: string }>('SELECT status FROM material_reservations WHERE id = ?', holdB)
    expect(rowA?.status).toBe('active')
    expect(rowB?.status).toBe('cancelled')
  })
})
