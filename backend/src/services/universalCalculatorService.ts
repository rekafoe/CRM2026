import { getDb } from '../config/database'
import { ProductMaterialRule, CalculatorConfig } from '../models'

export class UniversalCalculatorService {
  // Получить конфигурацию калькулятора для продукта
  static async getCalculatorConfig(productType: string, productName?: string) {
    const db = await getDb()
    
    let whereClause = 'WHERE pmr.product_type = ?'
    const params: any[] = [productType]
    
    if (productName) {
      whereClause += ' AND pmr.product_name = ?'
      params.push(productName)
    }
    
    const rules = await db.all<any>(
      `SELECT 
        pmr.id, pmr.product_type, pmr.product_name, pmr.material_id,
        m.name as material_name, m.unit, m.sheet_price_single,
        pmr.qty_per_item, pmr.calculation_type, pmr.is_required, pmr.notes,
        c.name as category_name, c.color as category_color,
        s.name as supplier_name
       FROM product_material_rules pmr
       JOIN materials m ON m.id = pmr.material_id
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
      ${whereClause}
      ORDER BY pmr.is_required DESC, c.name, m.name`,
      ...params
    )
    
    return {
      product_type: productType,
      product_name: productName || 'Универсальный',
      rules,
      total_materials: rules.length,
      total_cost: 0 // Будет рассчитано при расчете
    }
  }

  // Получить все доступные типы продуктов
  static async getProductTypes() {
    const db = await getDb()
    const types = await db.all<{ product_type: string; count: number }>(
      'SELECT DISTINCT product_type, COUNT(*) as count FROM product_material_rules GROUP BY product_type ORDER BY product_type'
    )
    return types
  }

  // Получить все продукты определенного типа
  static async getProductsByType(productType: string) {
    const db = await getDb()
    const products = await db.all<{ product_name: string; count: number }>(
      'SELECT product_name, COUNT(*) as count FROM product_material_rules WHERE product_type = ? GROUP BY product_name ORDER BY product_name',
      productType
    )
    return products
  }

  // Рассчитать стоимость и количество материалов
  static async calculateProductCost(
    productType: string, 
    productName: string, 
    quantity: number, 
    options: Record<string, any> = {}
  ) {
    const config = await this.getCalculatorConfig(productType, productName)
    
    if (!config.rules.length) {
      throw new Error(`Не найдены правила для продукта ${productType} - ${productName}`)
    }

    const calculations = []
    let totalCost = 0
    let totalMaterials = 0

    for (const rule of config.rules) {
      let calculatedQty = 0
      
      // Рассчитываем количество материала в зависимости от типа расчета
      switch (rule.calculation_type) {
        case 'per_item':
          calculatedQty = rule.qty_per_item * quantity
          break
        case 'per_sheet':
          // Для листовок: количество листов = количество листовок / количество на листе
          const sheetsPerItem = options.sheets_per_item || 1
          calculatedQty = rule.qty_per_item * Math.ceil(quantity / sheetsPerItem)
          break
        case 'per_sqm':
          // Для площади: количество * площадь на единицу
          const areaPerItem = options.area_per_item || 1
          calculatedQty = rule.qty_per_item * quantity * areaPerItem
          break
        case 'fixed':
          // Фиксированное количество независимо от количества
          calculatedQty = rule.qty_per_item
          break
        default:
          calculatedQty = rule.qty_per_item * quantity
      }

      // Округляем вверх для целых материалов
      const roundedQty = Math.ceil(calculatedQty)
      const materialCost = roundedQty * (rule.sheet_price_single || 0)
      
      calculations.push({
        rule_id: rule.id,
        material_id: rule.material_id,
        material_name: rule.material_name,
        unit: rule.unit,
        qty_per_item: rule.qty_per_item,
        calculation_type: rule.calculation_type,
        calculated_qty: calculatedQty,
        rounded_qty: roundedQty,
        unit_price: rule.sheet_price_single || 0,
        total_cost: materialCost,
        is_required: rule.is_required,
        category_name: rule.category_name,
        category_color: rule.category_color,
        supplier_name: rule.supplier_name
      })

      totalCost += materialCost
      totalMaterials += roundedQty
    }

    return {
      product_type: productType,
      product_name: productName,
      quantity,
      options,
      calculations,
      summary: {
        total_materials: totalMaterials,
        total_cost: totalCost,
        cost_per_item: totalCost / quantity,
        required_materials: calculations.filter(c => c.is_required).length,
        optional_materials: calculations.filter(c => !c.is_required).length
      }
    }
  }

  // Создать или обновить правило материала
  static async createOrUpdateRule(rule: Partial<ProductMaterialRule>) {
    const db = await getDb()
    
    try {
      if (rule.id) {
        await db.run(
          'UPDATE product_material_rules SET product_type = ?, product_name = ?, material_id = ?, qty_per_item = ?, calculation_type = ?, is_required = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          rule.product_type,
          rule.product_name,
          rule.material_id,
          rule.qty_per_item,
          rule.calculation_type,
          rule.is_required ? 1 : 0,
          rule.notes || null,
          rule.id
        )
      } else {
        await db.run(
          'INSERT INTO product_material_rules (product_type, product_name, material_id, qty_per_item, calculation_type, is_required, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          rule.product_type,
          rule.product_name,
          rule.material_id,
          rule.qty_per_item,
          rule.calculation_type,
          rule.is_required ? 1 : 0,
          rule.notes || null
        )
      }
      
      return await this.getCalculatorConfig(rule.product_type!, rule.product_name!)
    } catch (e: any) {
      if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed')) {
        const err: any = new Error('Правило с такими параметрами уже существует')
        err.status = 409
        throw err
      }
      throw e
    }
  }

  // Удалить правило
  static async deleteRule(ruleId: number) {
    const db = await getDb()
    await db.run('DELETE FROM product_material_rules WHERE id = ?', ruleId)
  }

  // Получить все правила с фильтрацией
  static async getAllRules(filters: {
    product_type?: string;
    product_name?: string;
    material_id?: number;
    is_required?: boolean;
  }) {
    const { product_type, product_name, material_id, is_required } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (product_type) { where.push('pmr.product_type = ?'); params.push(product_type) }
    if (product_name) { where.push('pmr.product_name = ?'); params.push(product_name) }
    if (material_id) { where.push('pmr.material_id = ?'); params.push(Number(material_id)) }
    if (is_required !== undefined) { where.push('pmr.is_required = ?'); params.push(is_required ? 1 : 0) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const db = await getDb()
    
    const rules = await db.all<ProductMaterialRule>(
      `SELECT 
        pmr.id, pmr.product_type, pmr.product_name, pmr.material_id,
        m.name as material_name, m.unit, m.sheet_price_single,
        pmr.qty_per_item, pmr.calculation_type, pmr.is_required, pmr.notes,
        c.name as category_name, c.color as category_color,
        s.name as supplier_name, pmr.created_at, pmr.updated_at
       FROM product_material_rules pmr
       JOIN materials m ON m.id = pmr.material_id
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
      ${whereSql}
      ORDER BY pmr.product_type, pmr.product_name, pmr.is_required DESC, m.name`,
      ...params
    )
    
    return rules
  }

  // Клонировать правила от одного продукта к другому
  static async cloneRules(fromProductType: string, fromProductName: string, toProductType: string, toProductName: string) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      // Получаем исходные правила
      const sourceRules = await db.all<any>(
        'SELECT material_id, qty_per_item, calculation_type, is_required, notes FROM product_material_rules WHERE product_type = ? AND product_name = ?',
        fromProductType, fromProductName
      )
      
      if (!sourceRules.length) {
        throw new Error(`Не найдены правила для продукта ${fromProductType} - ${fromProductName}`)
      }
      
      // Создаем новые правила
      for (const rule of sourceRules) {
        await db.run(
          'INSERT INTO product_material_rules (product_type, product_name, material_id, qty_per_item, calculation_type, is_required, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          toProductType,
          toProductName,
          rule.material_id,
          rule.qty_per_item,
          rule.calculation_type,
          rule.is_required,
          rule.notes
        )
      }
      
      await db.run('COMMIT')
      return await this.getCalculatorConfig(toProductType, toProductName)
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }
}
