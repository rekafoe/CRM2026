import { Router } from 'express'
import { MaterialController } from '../controllers/materialController'
import { asyncHandler, authenticate } from '../../../middleware'

const router = Router()

// Все роуты материалов требуют аутентификации (кроме публичных)
// router.use(authenticate) // Убрано для публичного доступа к /api/materials

// Публичный доступ для калькулятора
router.get('/', asyncHandler(MaterialController.getAllMaterials))

// Защищенные маршруты
router.post('/', authenticate, asyncHandler(MaterialController.createOrUpdateMaterial))
router.put('/:id', authenticate, asyncHandler(MaterialController.updateMaterial))
router.delete('/:id', authenticate, asyncHandler(MaterialController.deleteMaterial))
router.get('/low-stock', authenticate, asyncHandler(MaterialController.getLowStockMaterials))
router.get('/moves', authenticate, asyncHandler(MaterialController.getMaterialMoves))
router.get('/moves/stats', authenticate, asyncHandler(MaterialController.getMaterialMovesStats))
router.post('/spend', authenticate, asyncHandler(MaterialController.spendMaterial))

// Временный endpoint для тестирования калькулятора
router.get('/test-calculator', asyncHandler(async (req, res) => {
  try {
    const { getDb } = await import('../../../config/database')
    const db = await getDb()
    
    // Проверяем, есть ли таблица product_material_rules
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='product_material_rules'")
    
    if ((tables as any[]).length === 0) {
      // Создаем таблицу
      await db.exec(`
        CREATE TABLE IF NOT EXISTS product_material_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_type TEXT NOT NULL,
          product_name TEXT NOT NULL,
          material_id INTEGER NOT NULL,
          qty_per_item REAL NOT NULL,
          calculation_type TEXT NOT NULL,
          is_required BOOLEAN DEFAULT 1,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      
      // Добавляем тестовые данные
      const materials = await db.all("SELECT id, name FROM materials LIMIT 2")
      if ((materials as any[]).length > 0) {
        await db.run(`
          INSERT INTO product_material_rules 
          (product_type, product_name, material_id, qty_per_item, calculation_type, is_required, notes)
          VALUES 
          ('flyers', 'Листовки A6', ${(materials as any[])[0].id}, 1, 'per_sheet', 1, 'Бумага для печати'),
          ('flyers', 'Листовки A6', ${(materials as any[])[1]?.id || (materials as any[])[0].id}, 0.1, 'per_sheet', 1, 'Краска для печати'),
          ('business_cards', 'Визитки', ${(materials as any[])[0].id}, 1, 'per_sheet', 1, 'Бумага для визиток')
        `)
      }
    }
    
    // Получаем типы продуктов
    const types = await db.all("SELECT product_type, COUNT(*) as count FROM product_material_rules GROUP BY product_type")
    
    res.json({
      success: true,
      message: 'Калькулятор инициализирован',
      types: types,
      tables: (tables as any[]).length > 0 ? 'exists' : 'created'
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}))

export default router
