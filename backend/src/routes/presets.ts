import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { AuthenticatedRequest } from '../middleware'

const router = Router()

// GET /api/presets — список категорий с их товарами и допами
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDb()
  const categories = (await db.all<any>(
    'SELECT id, category, color FROM preset_categories ORDER BY category'
  )) as unknown as Array<{ id: number; category: string; color: string }>
  const items = (await db.all<any>(
    'SELECT id, category_id, description, price FROM preset_items'
  )) as unknown as Array<{ id: number; category_id: number; description: string; price: number }>
  const extras = (await db.all<any>(
    'SELECT id, category_id, name, price, type, unit FROM preset_extras'
  )) as unknown as Array<{ id: number; category_id: number; name: string; price: number; type: string; unit: string | null }>
  const result = categories.map((c) => ({
    category: c.category,
    color: c.color,
    items: items
      .filter((i) => i.category_id === c.id)
      .map((i) => ({ description: i.description, price: i.price })),
    extras: extras
      .filter((e) => e.category_id === c.id)
      .map((e) => ({ name: e.name, price: e.price, type: e.type as any, unit: e.unit || undefined }))
  }))
  res.json(result)
}))

// GET /api/product-materials/:category/:description
router.get('/:category/:description', asyncHandler(async (req, res) => {
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT pm.materialId, pm.qtyPerItem, m.name, m.unit, m.quantity, m.min_quantity as min_quantity
       FROM product_materials pm
       JOIN materials m ON m.id = pm.materialId
       WHERE pm.presetCategory = ? AND pm.presetDescription = ?`,
    req.params.category,
    req.params.description
  )
  res.json(rows)
}))

// POST /api/product-materials — задать состав материалов для пресета
router.post('/materials', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }
  const {
    presetCategory,
    presetDescription,
    materials
  } = req.body as {
    presetCategory: string
    presetDescription: string
    materials: { materialId: number; qtyPerItem: number }[]
  }

  const db = await getDb()
  await db.run(
    'DELETE FROM product_materials WHERE presetCategory = ? AND presetDescription = ?',
    presetCategory,
    presetDescription
  )
  for (const m of materials) {
    await db.run(
      'INSERT INTO product_materials (presetCategory, presetDescription, materialId, qtyPerItem) VALUES (?, ?, ?, ?)',
      presetCategory,
      presetDescription,
      m.materialId,
      m.qtyPerItem
    )
  }
  res.status(204).end()
}))

export default router
