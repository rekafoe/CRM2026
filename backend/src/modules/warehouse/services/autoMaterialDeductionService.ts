import { getDb } from '../../../config/database'
import { logger } from '../../../utils/logger'
import { WarehouseTransactionService } from './warehouseTransactionService'

export interface MaterialRequirement {
  materialId: number
  quantity: number
  reason: string
  orderId?: number
  userId?: number
}

export interface AutoDeductionResult {
  success: boolean
  deductedMaterials: Array<{
    materialId: number
    quantity: number
    materialName: string
  }>
  warnings: string[]
  errors: string[]
}

export class AutoMaterialDeductionService {
  /**
   * Автоматическое списание материалов при создании заказа
   */
  static async deductMaterialsForOrder(
    orderId: number,
    items: Array<{
      type: string
      params: any
      quantity: number
      components?: Array<{ materialId: number; qtyPerItem: number }>
    }>,
    userId?: number
  ): Promise<AutoDeductionResult> {
    const result: AutoDeductionResult = {
      success: true,
      deductedMaterials: [],
      warnings: [],
      errors: []
    }

    try {
      const db = await getDb()
      
      // Собираем все требования к материалам
      const materialRequirements: MaterialRequirement[] = []
      
      for (const item of items) {
        if (item.components && item.components.length > 0) {
          // Если есть явно указанные компоненты
          for (const component of item.components) {
            const totalQuantity = component.qtyPerItem * item.quantity
            materialRequirements.push({
              materialId: component.materialId,
              quantity: totalQuantity,
              reason: `Автоматическое списание для заказа ${orderId}`,
              orderId,
              userId
            })
          }
        } else {
          // Пытаемся найти материалы по типу товара
          const presetMaterials = await this.getMaterialsForProductType(item.type, item.params)
          for (const material of presetMaterials) {
            const totalQuantity = material.qtyPerItem * item.quantity
            materialRequirements.push({
              materialId: material.materialId,
              quantity: totalQuantity,
              reason: `Автоматическое списание для заказа ${orderId}`,
              orderId,
              userId
            })
          }
        }
      }

      // Группируем требования по материалам
      const groupedRequirements = this.groupMaterialRequirements(materialRequirements)

      // Проверяем доступность материалов
      const availabilityCheck = await this.checkMaterialAvailability(groupedRequirements)
      
      if (!availabilityCheck.success) {
        result.success = false
        result.errors = availabilityCheck.errors
        return result
      }

      // Добавляем предупреждения
      result.warnings = availabilityCheck.warnings

      // Выполняем списание материалов
      for (const requirement of groupedRequirements) {
        try {
          const material = await db.get(
            'SELECT name FROM materials WHERE id = ?',
            requirement.materialId
          )

          await WarehouseTransactionService.spendMaterial(
            requirement.materialId,
            requirement.quantity,
            requirement.reason,
            requirement.orderId,
            requirement.userId
          )

          result.deductedMaterials.push({
            materialId: requirement.materialId,
            quantity: requirement.quantity,
            materialName: material?.name || `Материал ID ${requirement.materialId}`
          })

          logger.info('Материал списан автоматически', {
            materialId: requirement.materialId,
            quantity: requirement.quantity,
            orderId
          })
        } catch (error: any) {
          logger.error('Ошибка списания материала', error)
          result.errors.push(`Ошибка списания материала ID ${requirement.materialId}: ${error.message}`)
        }
      }

      logger.info('Автоматическое списание материалов завершено', {
        orderId,
        deductedCount: result.deductedMaterials.length,
        warningsCount: result.warnings.length,
        errorsCount: result.errors.length
      })

    } catch (error: any) {
      logger.error('Ошибка автоматического списания материалов', error)
      result.success = false
      result.errors.push(`Общая ошибка: ${error.message}`)
    }

    return result
  }

  /**
   * Получить материалы для типа продукта
   */
  private static async getMaterialsForProductType(
    productType: string,
    params: any
  ): Promise<Array<{ materialId: number; qtyPerItem: number }>> {
    const db = await getDb()
    
    try {
      const columns = (await db.all<{ name: string }>('PRAGMA table_info(product_materials)')) as unknown as Array<{ name: string }>
      const hasNewSchema = columns.some((c) => c.name === 'material_id')

      if (hasNewSchema) {
        // Новая структура: product_id, material_id, qty_per_sheet
        const productId = typeof productType === 'string' && /^\d+$/.test(productType) ? Number(productType) : NaN
        if (!Number.isFinite(productId)) return []
        const rows = await db.all<{ material_id: number; qty_per_sheet: number }>(
          'SELECT material_id, qty_per_sheet FROM product_materials WHERE product_id = ?',
          productId
        )
        const list = Array.isArray(rows) ? rows : rows != null ? [rows] : []
        return list.map((m) => ({
          materialId: m.material_id,
          qtyPerItem: m.qty_per_sheet
        }))
      }

      // Старая структура: presetCategory, presetDescription, materialId, qtyPerItem
      const materials = await db.all<{ materialId: number; qtyPerItem: number }>(
        'SELECT materialId, qtyPerItem FROM product_materials WHERE presetCategory = ? AND presetDescription = ?',
        productType,
        params.description || ''
      )
      const list = Array.isArray(materials) ? materials : materials != null ? [materials] : []
      return list.map((m) => ({
        materialId: m.materialId,
        qtyPerItem: m.qtyPerItem
      }))
    } catch (error) {
      logger.warn('Не удалось найти материалы для типа продукта', {
        productType,
        error: (error as Error).message
      })
      return []
    }
  }

  /**
   * Группировать требования по материалам
   */
  private static groupMaterialRequirements(
    requirements: MaterialRequirement[]
  ): MaterialRequirement[] {
    const grouped = new Map<number, MaterialRequirement>()

    for (const req of requirements) {
      if (grouped.has(req.materialId)) {
        grouped.get(req.materialId)!.quantity += req.quantity
      } else {
        grouped.set(req.materialId, { ...req })
      }
    }

    return Array.from(grouped.values())
  }

  /**
   * Проверить доступность материалов
   */
  private static async checkMaterialAvailability(
    requirements: MaterialRequirement[]
  ): Promise<{ success: boolean; warnings: string[]; errors: string[] }> {
    const db = await getDb()
    const warnings: string[] = []
    const errors: string[] = []

    for (const req of requirements) {
      try {
        const material = await db.get(`
          SELECT name, quantity, min_quantity 
          FROM materials 
          WHERE id = ?
        `, req.materialId)

        if (!material) {
          errors.push(`Материал с ID ${req.materialId} не найден`)
          continue
        }

        const availableQuantity = material.quantity
        const minQuantity = material.min_quantity || 0
        const remainingAfterDeduction = availableQuantity - req.quantity

        if (remainingAfterDeduction < 0) {
          errors.push(
            `Недостаточно материала "${material.name}". Доступно: ${availableQuantity}, требуется: ${req.quantity}`
          )
        } else if (remainingAfterDeduction < minQuantity) {
          warnings.push(
            `После списания материала "${material.name}" остаток будет ниже минимального (${minQuantity})`
          )
        }
      } catch (error: any) {
        errors.push(`Ошибка проверки материала ID ${req.materialId}: ${error.message}`)
      }
    }

    return {
      success: errors.length === 0,
      warnings,
      errors
    }
  }

  /**
   * Получить историю автоматических списаний
   */
  static async getDeductionHistory(orderId: number): Promise<any[]> {
    const db = await getDb()
    
    try {
      const history = await db.all(`
        SELECT 
          mm.id,
          mm.material_id AS materialId,
          m.name as materialName,
          mm.delta,
          mm.reason,
          mm.created_at,
          u.name as userName
        FROM material_moves mm
        LEFT JOIN materials m ON m.id = mm.material_id
        LEFT JOIN users u ON u.id = mm.user_id
        WHERE mm.order_id = ? AND mm.delta < 0
        ORDER BY mm.created_at DESC
      `, orderId)

      return history
    } catch (error: any) {
      logger.error('Ошибка получения истории списаний', error)
      return []
    }
  }

  /**
   * Отменить автоматическое списание (возврат материалов)
   */
  static async cancelDeduction(orderId: number, userId?: number): Promise<boolean> {
    try {
      const db = await getDb()
      
      // Получаем все списания по заказу
      const deductions = await db.all(`
        SELECT material_id AS materialId, ABS(delta) as quantity
        FROM material_moves
        WHERE order_id = ? AND delta < 0
      `, orderId)

      if (deductions.length === 0) {
        logger.warn('Нет списаний для отмены', { orderId })
        return true
      }

      // Возвращаем материалы
      for (const deduction of deductions) {
        await WarehouseTransactionService.addMaterial(
          deduction.materialId,
          deduction.quantity,
          `Отмена списания для заказа ${orderId}`,
          orderId,
          userId
        )
      }

      logger.info('Автоматическое списание отменено', {
        orderId,
        returnedMaterials: deductions.length
      })

      return true
    } catch (error: any) {
      logger.error('Ошибка отмены списания', error)
      return false
    }
  }
}
