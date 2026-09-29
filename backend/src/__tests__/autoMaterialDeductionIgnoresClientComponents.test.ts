import { AutoMaterialDeductionService } from '../modules/warehouse/services/autoMaterialDeductionService'
import { getDb } from '../config/database'
import { normalizeWebsiteItems } from '../modules/orders/utils/websiteOrderNormalize'

describe('auto material deduction ignores crafted client components', () => {
  let victimMaterialId: number
  let bomMaterialId: number
  let productId: number
  let victimInitial: number
  let bomInitial: number
  let hasNewProductMaterialsSchema = false

  beforeAll(async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')

    victimInitial = 400
    bomInitial = 300
    productId = 880000 + Math.floor(Math.random() * 10000)

    const victim = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Victim paper ${Date.now()}`,
      'лист',
      victimInitial,
      0
    )
    victimMaterialId = victim.lastID!

    const bom = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `BOM paper ${Date.now()}`,
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
        2
      )
    } else {
      await db.run(
        'INSERT INTO product_materials (presetCategory, presetDescription, materialId, qtyPerItem) VALUES (?, ?, ?, ?)',
        String(productId),
        '',
        bomMaterialId,
        2
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
    await db.run('DELETE FROM material_moves WHERE material_id IN (?, ?)', victimMaterialId, bomMaterialId)
    await db.run('DELETE FROM materials WHERE id IN (?, ?)', victimMaterialId, bomMaterialId)
    await db.exec('PRAGMA foreign_keys = ON')
  })

  it('normalizeWebsiteItems drops client components', () => {
    const [item] = normalizeWebsiteItems([
      {
        type: String(productId),
        price: 1,
        quantity: 3,
        components: [{ materialId: victimMaterialId, qtyPerItem: 50 }],
      },
    ])
    expect(item.components).toBeUndefined()
  })

  it('does not spend crafted materialId; uses product BOM instead', async () => {
    const db = await getDb()
    await db.exec('PRAGMA foreign_keys = OFF')
    const order = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      `DED-${Date.now()}`,
      1,
      new Date().toISOString()
    )
    const orderId = order.lastID!
    await db.exec('PRAGMA foreign_keys = ON')

    // productId без шаблона → pricing пустой/ошибка → fallback на product_materials BOM
    const result = await AutoMaterialDeductionService.deductMaterialsForOrder(
      orderId,
      [
        {
          type: String(productId),
          params: { productId, description: '' },
          quantity: 3,
          components: [{ materialId: victimMaterialId, qtyPerItem: 50 }],
        },
      ],
      undefined
    )

    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.deductedMaterials.map((m) => m.materialId)).toEqual([bomMaterialId])
    expect(result.deductedMaterials[0]?.quantity).toBe(6)

    const victim = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      victimMaterialId
    )
    const bomRow = await db.get<{ quantity: number }>(
      'SELECT quantity FROM materials WHERE id = ?',
      bomMaterialId
    )
    expect(Number(victim?.quantity)).toBe(victimInitial)
    expect(Number(bomRow?.quantity)).toBe(bomInitial - 6)

    await db.exec('PRAGMA foreign_keys = OFF')
    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.exec('PRAGMA foreign_keys = ON')
  })
})
