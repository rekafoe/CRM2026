import { getDb } from '../config/database'
import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'

describe('AutoMaterialDeductionService + reservations', () => {
  let materialId: number
  let reservedOrderId: number
  let checkoutOrderId: number

  beforeAll(async () => {
    const db = await getDb()
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `AutoDeduct Paper ${Date.now()}`,
      'лист',
      100,
      0,
    )
    materialId = material.lastID!

    const reservedOrder = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `RESERVE-${Date.now()}`,
      1,
      new Date().toISOString(),
    )
    reservedOrderId = reservedOrder.lastID!

    const checkoutOrder = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `CHECKOUT-${Date.now()}`,
      1,
      new Date().toISOString(),
    )
    checkoutOrderId = checkoutOrder.lastID!

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      reservedOrderId,
      80,
      'CRM reserve for in-work order',
      expiresAt.toISOString(),
    )
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE material_id = ?', materialId)
    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
    await db.run('DELETE FROM orders WHERE id IN (?, ?)', reservedOrderId, checkoutOrderId)
  })

  it('не списывает stock, уже занятый активным резервом другого заказа', async () => {
    const before = await (await getDb()).get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )

    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      checkoutOrderId,
      [
        {
          type: 'print',
          params: {},
          quantity: 1,
          components: [{ materialId, qtyPerItem: 30 }],
        },
      ],
    )

    expect(result.success).toBe(false)
    expect(result.errors.some((e) => /Недостаточно материала|в резерве/i.test(e))).toBe(true)
    expect(result.deductedMaterials).toHaveLength(0)

    const after = await (await getDb()).get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )
    expect(after?.quantity).toBe(before?.quantity)
  })

  it('списывает только свободный остаток сверх резерва', async () => {
    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      checkoutOrderId,
      [
        {
          type: 'print',
          params: {},
          quantity: 1,
          components: [{ materialId, qtyPerItem: 15 }],
        },
      ],
    )

    expect(result.success).toBe(true)
    expect(result.deductedMaterials).toEqual([
      expect.objectContaining({ materialId, quantity: 15 }),
    ])

    const after = await (await getDb()).get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )
    expect(after?.quantity).toBe(85)
  })
})
