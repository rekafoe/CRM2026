import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { MaterialTransactionService } from '../modules/warehouse/services/materialTransactionService'

/**
 * Regression for OrderItemController.updateItem legacy (no-components) path:
 * spend()/return() open withTransaction → nested BEGIN under the controller's BEGIN.
 * Fix uses spendInTransaction / addInTransaction on the open db handle.
 */
describe('updateItem legacy path nested transaction guard', () => {
  beforeAll(async () => {
    await initDB()
  })

  it('spend() cannot nest inside an open BEGIN; spendInTransaction can', async () => {
    const db = await getDb()

    const mat = await db.run(
      `INSERT INTO materials (name, unit, quantity, min_quantity)
       VALUES (?, 'лист', 50, 0)`,
      `legacy-nested-mat-${Date.now()}`,
    )
    const materialId = Number(mat.lastID)

    await db.run('BEGIN')
    await expect(
      MaterialTransactionService.spend({
        materialId,
        quantity: 2,
        reason: 'nested spend should fail',
      }),
    ).rejects.toThrow(/transaction within a transaction/i)
    await db.run('ROLLBACK')

    await db.run('BEGIN')
    await MaterialTransactionService.spendInTransaction(db, {
      materialId,
      quantity: 3,
      reason: 'inline spend ok',
    })
    await MaterialTransactionService.addInTransaction(db, {
      materialId,
      quantity: 1,
      reason: 'inline return ok',
    })
    await db.run('COMMIT')

    const stock = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      materialId,
    )
    expect(Number(stock?.quantity)).toBe(48) // 50 - 3 + 1

    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })
})
