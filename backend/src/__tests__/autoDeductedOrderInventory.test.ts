import { getDb } from '../config/database'
import { MaterialTransactionService } from '../modules/warehouse/services/materialTransactionService'
import { UnifiedWarehouseService } from '../modules/warehouse/services/unifiedWarehouseService'
import { OrderService } from '../modules/orders/services/orderService'
import {
  aggregateComponentNeeds,
  applyComponentNeedsDeltaInTransaction,
  cancelActiveReservationsForOrder,
  loadMaterialUnits,
  orderHasWarehouseSpend,
  readStoredDeductionComponents,
} from '../modules/orders/services/autoDeductedOrderInventory'

describe('autoDeductedOrderInventory — no double write-off after CRM replace', () => {
  let materialId: number
  let orderId: number
  let startingQty: number

  beforeAll(async () => {
    const db = await getDb()
    startingQty = 500
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `AutoDeduct Paper ${Date.now()}`,
      'лист',
      startingQty,
      0,
    )
    materialId = material.lastID!

    const order = await db.run(
      `INSERT INTO orders (number, status, source, createdAt) VALUES (?, ?, ?, ?)`,
      `WEB-AD-${Date.now()}`,
      1,
      'website',
      new Date().toISOString(),
    )
    orderId = order.lastID!
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE order_id = ?', orderId)
    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })

  it('detects prior auto-deduction spends and reads _miniappComponents', async () => {
    const db = await getDb()
    expect(await orderHasWarehouseSpend(db, orderId)).toBe(false)

    await MaterialTransactionService.spend({
      materialId,
      quantity: 10,
      reason: `Автоматическое списание для заказа ${orderId}`,
      orderId,
    })
    expect(await orderHasWarehouseSpend(db, orderId)).toBe(true)

    const comps = readStoredDeductionComponents({
      _miniappComponents: [{ materialId, qtyPerItem: 2 }],
      components: [{ materialId: 999, qtyPerItem: 1 }],
    })
    expect(comps).toEqual([{ materialId, qtyPerItem: 2 }])
  })

  it('replace after auto-deduction adjusts stock via delta and leaves no active holds', async () => {
    const db = await getDb()
    const before = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )
    const qtyBefore = Number(before?.quantity)

    // Simulate a prior buggy CRM replace that created an active hold on already-spent order.
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      10,
      'buggy replace hold',
      expiresAt.toISOString(),
    )

    await cancelActiveReservationsForOrder(db, orderId)

    const units = await loadMaterialUnits(db, [materialId])
    const oldNeeds = aggregateComponentNeeds([{ materialId, qtyPerItem: 2 }], 5, units) // 10
    const newNeeds = aggregateComponentNeeds([{ materialId, qtyPerItem: 2 }], 7, units) // 14
    await db.run('BEGIN')
    try {
      await applyComponentNeedsDeltaInTransaction(db, {
        orderId,
        oldNeeds,
        newNeeds,
      })
      await db.run('COMMIT')
    } catch (e) {
      await db.run('ROLLBACK')
      throw e
    }

    const after = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )
    expect(Number(after?.quantity)).toBe(qtyBefore - 4)

    const activeHolds = await db.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM material_reservations
        WHERE order_id = ? AND status IN ('active', 'reserved')`,
      orderId,
    )
    expect(Number(activeHolds?.c || 0)).toBe(0)

    // Accept-to-work confirm would no-op: nothing left to spend.
    const reservations = await UnifiedWarehouseService.getReservationsByOrder(orderId)
    const toConfirm = reservations.filter((r) => r.status === 'reserved').map((r) => r.id)
    expect(toConfirm).toHaveLength(0)
  })

  it('deductMaterialsForExistingOrder cancels active holds before spending', async () => {
    const db = await getDb()
    const stamp = Date.now()
    const mat = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Finalize Hold Paper ${stamp}`,
      'лист',
      200,
      0,
    )
    const mid = mat.lastID!
    const ord = await db.run(
      `INSERT INTO orders (number, status, source, createdAt, miniapp_checkout_state)
       VALUES (?, ?, ?, ?, ?)`,
      `MAP-AD-${stamp}`,
      1,
      'mini_app',
      new Date().toISOString(),
      'draft',
    )
    const oid = ord.lastID!
    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)`,
      oid,
      'print',
      JSON.stringify({
        description: 'card',
        _miniappComponents: [{ materialId: mid, qtyPerItem: 3 }],
      }),
      1,
      4,
    )
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      mid,
      oid,
      12,
      'crm replace on draft',
      expiresAt.toISOString(),
    )

    const result = await OrderService.deductMaterialsForExistingOrder(oid)
    expect(result.success).toBe(true)

    const matAfter = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      mid,
    )
    expect(Number(matAfter?.quantity)).toBe(200 - 12)

    const active = await db.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM material_reservations
        WHERE order_id = ? AND status IN ('active', 'reserved')`,
      oid,
    )
    expect(Number(active?.c || 0)).toBe(0)

    // Second confirm path must not find holds to spend again.
    const reservations = await UnifiedWarehouseService.getReservationsByOrder(oid)
    expect(reservations.filter((r) => r.status === 'reserved')).toHaveLength(0)

    await db.run('DELETE FROM material_reservations WHERE order_id = ?', oid)
    await db.run('DELETE FROM material_moves WHERE order_id = ?', oid)
    await db.run('DELETE FROM items WHERE orderId = ?', oid)
    await db.run('DELETE FROM orders WHERE id = ?', oid)
    await db.run('DELETE FROM materials WHERE id = ?', mid)
  })
})
