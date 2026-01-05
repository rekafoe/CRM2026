import { getDb } from '../config/database'
import { MaterialPriceHistory } from '../models'

export class MaterialCostTrackingService {
  // Получить историю цен материала
  static async getPriceHistory(materialId: number, limit?: number) {
    const db = await getDb()
    const limitSql = limit ? `LIMIT ${limit}` : ''
    
    const history = await db.all<MaterialPriceHistory>(
      `SELECT 
        mph.id, mph.material_id, m.name as material_name,
        mph.old_price, mph.new_price, mph.change_reason,
        mph.changed_by, u.name as changed_by_name, mph.created_at
       FROM material_price_history mph
       JOIN materials m ON m.id = mph.material_id
       LEFT JOIN users u ON u.id = mph.changed_by
       WHERE mph.material_id = ?
       ORDER BY mph.created_at DESC
       ${limitSql}`,
      materialId
    )
    return history
  }

  // Получить историю цен всех материалов
  static async getAllPriceHistory(filters: {
    materialId?: number;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const { materialId, from, to, limit, offset } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (materialId) { where.push('mph.material_id = ?'); params.push(Number(materialId)) }
    if (from) { where.push('mph.created_at >= ?'); params.push(from) }
    if (to) { where.push('mph.created_at <= ?'); params.push(to) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const limitSql = limit ? `LIMIT ${limit}` : ''
    const offsetSql = offset ? `OFFSET ${offset}` : ''
    
    const db = await getDb()
    const history = await db.all<MaterialPriceHistory>(
      `SELECT 
        mph.id, mph.material_id, m.name as material_name,
        mph.old_price, mph.new_price, mph.change_reason,
        mph.changed_by, u.name as changed_by_name, mph.created_at
       FROM material_price_history mph
       JOIN materials m ON m.id = mph.material_id
       LEFT JOIN users u ON u.id = mph.changed_by
      ${whereSql}
      ORDER BY mph.created_at DESC
      ${limitSql} ${offsetSql}`,
      ...params
    )
    return history
  }

  // Обновить цену материала с записью в историю
  static async updatePrice(materialId: number, newPrice: number, reason: string, userId?: number) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      // Получаем текущую цену
      const currentMaterial = await db.get<{ sheet_price_single: number }>(
        'SELECT sheet_price_single FROM materials WHERE id = ?',
        materialId
      )
      
      const oldPrice = currentMaterial?.sheet_price_single || null
      
      // Обновляем цену
      await db.run(
        'UPDATE materials SET sheet_price_single = ? WHERE id = ?',
        newPrice,
        materialId
      )
      
      // Записываем в историю
      await db.run(
        'INSERT INTO material_price_history (material_id, old_price, new_price, change_reason, changed_by) VALUES (?, ?, ?, ?, ?)',
        materialId,
        oldPrice,
        newPrice,
        reason,
        userId || null
      )
      
      await db.run('COMMIT')
      
      return {
        material_id: materialId,
        old_price: oldPrice,
        new_price: newPrice,
        change_reason: reason
      }
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Получить статистику по ценам
  static async getPriceStats(filters: {
    materialId?: number;
    from?: string;
    to?: string;
  }) {
    const { materialId, from, to } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (materialId) { where.push('mph.material_id = ?'); params.push(Number(materialId)) }
    if (from) { where.push('mph.created_at >= ?'); params.push(from) }
    if (to) { where.push('mph.created_at <= ?'); params.push(to) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const db = await getDb()
    
    const stats = await db.get<{
      total_changes: number;
      price_increases: number;
      price_decreases: number;
      avg_increase: number;
      avg_decrease: number;
      max_increase: number;
      max_decrease: number;
    }>(
      `SELECT 
        COUNT(*) as total_changes,
        COUNT(CASE WHEN mph.new_price > COALESCE(mph.old_price, 0) THEN 1 END) as price_increases,
        COUNT(CASE WHEN mph.new_price < COALESCE(mph.old_price, 0) THEN 1 END) as price_decreases,
        AVG(CASE WHEN mph.new_price > COALESCE(mph.old_price, 0) THEN mph.new_price - mph.old_price END) as avg_increase,
        AVG(CASE WHEN mph.new_price < COALESCE(mph.old_price, 0) THEN mph.old_price - mph.new_price END) as avg_decrease,
        MAX(CASE WHEN mph.new_price > COALESCE(mph.old_price, 0) THEN mph.new_price - mph.old_price END) as max_increase,
        MAX(CASE WHEN mph.new_price < COALESCE(mph.old_price, 0) THEN mph.old_price - mph.new_price END) as max_decrease
       FROM material_price_history mph
      ${whereSql}`,
      ...params
    )
    return stats
  }

  // Получить материалы с изменением цен за период
  static async getMaterialsWithPriceChanges(filters: {
    from: string;
    to: string;
    categoryId?: number;
    supplierId?: number;
  }) {
    const { from, to, categoryId, supplierId } = filters
    const where: string[] = ['mph.created_at >= ?', 'mph.created_at <= ?']
    const params: any[] = [from, to]
    
    if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)) }
    if (supplierId) { where.push('m.supplier_id = ?'); params.push(Number(supplierId)) }
    
    const whereSql = 'WHERE ' + where.join(' AND ')
    const db = await getDb()
    
    const materials = await db.all<any>(
      `SELECT 
        m.id, m.name, m.unit, m.sheet_price_single as current_price,
        c.name as category_name, s.name as supplier_name,
        COUNT(mph.id) as price_changes,
        MIN(mph.created_at) as first_change,
        MAX(mph.created_at) as last_change,
        MIN(mph.new_price) as min_price,
        MAX(mph.new_price) as max_price
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       JOIN material_price_history mph ON mph.material_id = m.id
      ${whereSql}
      GROUP BY m.id, m.name, m.unit, m.sheet_price_single, c.name, s.name
      ORDER BY price_changes DESC, m.name`,
      ...params
    )
    
    return materials
  }

  // Получить тренды цен по категориям
  static async getPriceTrendsByCategory(filters: {
    from: string;
    to: string;
  }) {
    const { from, to } = filters
    const db = await getDb()
    
    const trends = await db.all<any>(
      `SELECT 
        c.id as category_id, c.name as category_name, c.color as category_color,
        COUNT(DISTINCT mph.material_id) as materials_with_changes,
        COUNT(mph.id) as total_changes,
        AVG(mph.new_price) as avg_price,
        MIN(mph.new_price) as min_price,
        MAX(mph.new_price) as max_price
       FROM material_categories c
       LEFT JOIN materials m ON m.category_id = c.id
       LEFT JOIN material_price_history mph ON mph.material_id = m.id
       WHERE mph.created_at >= ? AND mph.created_at <= ?
       GROUP BY c.id, c.name, c.color
       ORDER BY total_changes DESC`,
      from, to
    )
    
    return trends
  }
}
