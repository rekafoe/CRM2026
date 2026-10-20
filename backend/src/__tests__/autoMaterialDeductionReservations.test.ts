import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'
import { getDb } from '../config/database'

/**
 * Website/miniapp auto-deduct must not spend stock already held by CRM reservations.
 * Otherwise checkout steals reserved qty and «Принят в работу» cannot confirm → under-write-off.
 */
describe('AutoMaterialDeductionService respects active reservations', () => {
  let materialId: number
  let holdOrderId: number
  let checkoutOrderId: number
  let reservationId: number

  beforeAll(async () => {
    const db = await getDb()
    const stamp = Date.now()

    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `AutoDeduct reserve paper ${stamp}`,
      'лист',
      100,
      0
    )
    materialId = material.lastID!

    const holdOrder = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `HOLD-${stamp}`,
      1,
      new Date().toISOString()
    )
    holdOrderId = holdOrder.lastID!

    const checkoutOrder = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `CHK-${stamp}`,
      1,
      new Date().toISOString()
    )
    checkoutOrderId = checkoutOrder.lastID!

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    const reservation = await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      holdOrderId,
      100,
      'CRM hold for test',
      expiresAt.toISOString()
    )
    reservationId = reservation.lastID!
  })

  afterAll(async () => {
    const db = await getDb()
    if (reservationId) {
      await db.run('DELETE FROM material_reservations WHERE id = ?', reservationId)
    }
    if (materialId) {
      await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
      await db.run('DELETE FROM materials WHERE id = ?', materialId)
    }
    if (holdOrderId) {
      await db.run('DELETE FROM orders WHERE id = ?', holdOrderId)
    }
    if (checkoutOrderId) {
      await db.run('DELETE FROM orders WHERE id = ?', checkoutOrderId)
    }
  })

  it('отклоняет auto-deduct, когда весь остаток уже в активном резерве', async () => {
    const db = await getDb()
    const before = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )

    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      checkoutOrderId,
      [
        {
          type: 'test',
          params: {},
          quantity: 1,
          components: [{ materialId, qtyPerItem: 50 }],
        },
      ]
    )

    expect(result.success).toBe(false)
    expect(result.deductedMaterials).toEqual([])
    expect(result.errors.join(' ')).toMatch(/Недостаточно материала/)

    const after = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId
    )
    expect(after?.quantity).toBe(before?.quantity)

    const hold = await db.get<{ status: string }>(
      'SELECT status FROM material_reservations WHERE id = ?',
      reservationId
    )
    expect(hold?.status).toBe('active')
  })
})
