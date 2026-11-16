import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'
import { getDb } from '../config/database'

/**
 * UV print_without_material: pricing returns empty materials[], but AutoMaterialDeduction
 * used to fall through to product_materials BOM and spend sheet stock on website/miniapp
 * checkout. CRM reserve/delete already skip via orderParamsDeclareUvPrintWithoutMaterial.
 */
describe('auto material deduction skips UV print_without_material BOM', () => {
  let bomMaterialId: number
  let productId: number
  let bomInitial: number
  let hasNewProductMaterialsSchema = false

  beforeAll(async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')

    bomInitial = 250
    productId = 890000 + Math.floor(Math.random() * 10000)

    const bom = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `UV BOM sheet ${Date.now()}`,
      'лист',
      bomInitial,
      0
    )
    bomMaterialId = bom.lastID!

    const columns = (await db.all<{ name: string }>(
      'PRAGMA table_info(product_materials)'
    )) as unknown as Array<{ name: string }>
    hasNewProductMaterialsSchema = columns.some((c) => c.name === 'material_id')

    if (hasNewProductMaterialsSchema) {
      await db.run(
        'INSERT INTO product_materials (product_id, material_id, qty_per_sheet) VALUES (?, ?, ?)',
        productId,
        bomMaterialId,
        1
      )
    } else {
      await db.run(
        'INSERT INTO product_materials (presetCategory, presetDescription, materialId, qtyPerItem) VALUES (?, ?, ?, ?)',
        String(productId),
        '',
        bomMaterialId,
        1
      )
    }

    await db.exec('PRAGMA foreign_keys = ON')
  })

  afterAll(async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')
    if (hasNewProductMaterialsSchema) {
      await db.run('DELETE FROM product_materials WHERE product_id = ?', productId)
    } else {
      await db.run(
        'DELETE FROM product_materials WHERE presetCategory = ? AND materialId = ?',
        String(productId),
        bomMaterialId
      )
    }
    await db.run('DELETE FROM material_moves WHERE material_id = ?', bomMaterialId)
    await db.run('DELETE FROM materials WHERE id = ?', bomMaterialId)
    await db.exec('PRAGMA foreign_keys = ON')
  })

  it('does not spend product_materials BOM when print_without_material is declared', async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')
    const order = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `UV-PWM-${Date.now()}`,
      1,
      new Date().toISOString()
    )
    const orderId = order.lastID!
    await db.exec('PRAGMA foreign_keys = ON')

    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      orderId,
      [
        {
          type: String(productId),
          params: {
            productId,
            description: '',
            print_without_material: true,
            specifications: {
              print_without_material: true,
              uv_print: { color: { enabled: true, passes: 1 } },
            },
          },
          quantity: 4,
        },
      ],
      undefined
    )

    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.deductedMaterials).toEqual([])

    const bomRow = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      bomMaterialId
    )
    expect(Number(bomRow?.quantity)).toBe(bomInitial)

    await db.exec('PRAGMA foreign_keys = OFF')
    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.exec('PRAGMA foreign_keys = ON')
  })
})
