import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'
import { MaterialTransactionService } from '../modules/warehouse/services/materialTransactionService'
import { getDb } from '../config/database'

describe('auto material deduction rejects non-positive qty', () => {
  let materialId: number
  let initialQty: number

  beforeAll(async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')
    initialQty = 500
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `NegQty paper ${Date.now()}`,
      'лист',
      initialQty,
      0
    )
    materialId = material.lastID!
    await db.exec('PRAGMA foreign_keys = ON')
  })

  afterAll(async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')
    await db.run('DELETE FROM material_moves WHERE material_id = ?', materialId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
    await db.exec('PRAGMA foreign_keys = ON')
  })

  it('does not inflate stock when client sends negative qtyPerItem', async () => {
    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      900001,
      [
        {
          type: '99',
          params: {},
          quantity: 2,
          components: [{ materialId, qtyPerItem: -100 }],
        },
      ],
      undefined
    )

    expect(result.success).toBe(true)
    expect(result.deductedMaterials).toEqual([])

    const db = await getDb()
    const row = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(row?.quantity)).toBe(initialQty)
  })

  it('spend() rejects negative quantity instead of increasing stock', async () => {
    await expect(
      MaterialTransactionService.spend({
        materialId,
        quantity: -25,
        reason: 'crafted negative spend',
      })
    ).rejects.toThrow(/больше 0/)

    const db = await getDb()
    const row = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(row?.quantity)).toBe(initialQty)
  })
})
