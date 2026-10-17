import { getDb } from '../config/database'
import {
  replaceComponentReservationsInTx,
  reservationIdsFromComponents,
} from '../modules/orders/services/replaceComponentReservations'

/**
 * Concurrent CRM «Обновить позицию» (replaceParams) used to cancel reservationIds
 * from a row read *before* BEGIN. Two requests both cancelled the same ids, each
 * inserted new holds, and only the last params won — orphan active holds remained
 * and were confirmed on «Принят в работу» (double write-off).
 *
 * updateItem now BEGIN IMMEDIATE + re-reads params; this test locks the cancel/reserve
 * helper contract: a second replace must cancel the first replace's new hold ids.
 */
describe('replaceComponentReservationsInTx race contract', () => {
  let materialId: number
  let orderId: number

  beforeAll(async () => {
    const db = await getDb()
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Race paper ${Date.now()}`,
      'лист',
      10_000,
      0,
    )
    materialId = material.lastID!
    const order = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `RACE-${Date.now()}`,
      1,
      new Date().toISOString(),
    )
    orderId = order.lastID!
  })

  afterAll(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE order_id = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })

  beforeEach(async () => {
    const db = await getDb()
    await db.run('DELETE FROM material_reservations WHERE order_id = ?', orderId)
  })

  async function activeHoldIds(): Promise<number[]> {
    const db = await getDb()
    const rows = (await db.all(
      `SELECT id FROM material_reservations WHERE order_id = ? AND status = 'active' ORDER BY id`,
      orderId,
    )) as Array<{ id: number }>
    return (rows || []).map((row) => Number(row.id))
  }

  it('stale cancel of the same reservationIds leaves orphan active holds (bug baseline)', async () => {
    const db = await getDb()
    const seed = await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      10,
      'seed',
      new Date(Date.now() + 86_400_000).toISOString(),
    )
    const seedId = seed.lastID!
    const staleComponents = [{ materialId, qtyPerItem: 1, reservationId: seedId }]

    // Two "parallel" replaces both start from the same stale snapshot.
    const first = await replaceComponentReservationsInTx(
      db,
      orderId,
      staleComponents,
      [{ materialId, qtyPerItem: 1 }],
      10,
    )
    const second = await replaceComponentReservationsInTx(
      db,
      orderId,
      staleComponents,
      [{ materialId, qtyPerItem: 1 }],
      10,
    )

    const active = await activeHoldIds()
    const firstId = first.components[0]?.reservationId
    const secondId = second.components[0]?.reservationId
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
    // Seed cancelled twice; both new holds still active → orphan.
    expect(active).toEqual(expect.arrayContaining([firstId!, secondId!]))
    expect(active.length).toBeGreaterThanOrEqual(2)
  })

  it('second replace that re-reads first result cancels the prior hold (fixed path)', async () => {
    const db = await getDb()
    const seed = await db.run(
      `INSERT INTO material_reservations
        (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      materialId,
      orderId,
      10,
      'seed',
      new Date(Date.now() + 86_400_000).toISOString(),
    )
    const seedId = seed.lastID!

    const first = await replaceComponentReservationsInTx(
      db,
      orderId,
      [{ materialId, qtyPerItem: 1, reservationId: seedId }],
      [{ materialId, qtyPerItem: 1 }],
      10,
    )
    const freshComponents = first.components
    expect(reservationIdsFromComponents(freshComponents)).toHaveLength(1)

    const second = await replaceComponentReservationsInTx(
      db,
      orderId,
      freshComponents,
      [{ materialId, qtyPerItem: 1 }],
      12,
    )

    const active = await activeHoldIds()
    const firstId = first.components[0]?.reservationId
    const secondId = second.components[0]?.reservationId
    expect(secondId).toBeTruthy()
    expect(active).toEqual([secondId!])
    expect(active).not.toContain(firstId)
    expect(active).not.toContain(seedId)
  })
})
