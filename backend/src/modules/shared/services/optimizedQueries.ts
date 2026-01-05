import { getDb } from '../../../config/database'

export class OptimizedQueries {
  // Оптимизированный запрос для загрузки заказов с пагинацией
  static async getOrdersPaginated(limit: number = 50, offset: number = 0, filters: {
    userId?: number;
    status?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const db = await getDb()
    
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    
    if (filters.userId) {
      whereClause += ' AND (userId = ? OR userId IS NULL)'
      params.push(filters.userId)
    }
    
    if (filters.status) {
      whereClause += ' AND status = ?'
      params.push(filters.status)
    }
    
    if (filters.dateFrom) {
      whereClause += ' AND DATE(createdAt) >= ?'
      params.push(filters.dateFrom)
    }
    
    if (filters.dateTo) {
      whereClause += ' AND DATE(createdAt) <= ?'
      params.push(filters.dateTo)
    }
    
    const orders = await db.all(`
      SELECT 
        o.*,
        os.name as status_name,
        os.color as status_color,
        os.sort_order as status_sort,
        u.name as user_name
      FROM orders o
      LEFT JOIN order_statuses os ON os.id = o.status
      LEFT JOIN users u ON u.id = o.userId
      ${whereClause}
      ORDER BY o.createdAt DESC
      LIMIT ? OFFSET ?
    `, ...params, limit, offset)
    
    const totalCount = await db.get(`
      SELECT COUNT(*) as count FROM orders o ${whereClause}
    `, ...params)
    
    return {
      orders,
      totalCount: totalCount.count,
      hasMore: orders.length === limit
    }
  }
  
  // Оптимизированный запрос для загрузки материалов с категориями
  static async getMaterialsWithDetails(filters: {
    categoryId?: number;
    supplierId?: number;
    search?: string;
  } = {}) {
    const db = await getDb()
    
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    
    if (filters.categoryId) {
      whereClause += ' AND m.category_id = ?'
      params.push(filters.categoryId)
    }
    
    if (filters.supplierId) {
      whereClause += ' AND m.supplier_id = ?'
      params.push(filters.supplierId)
    }
    
    if (filters.search) {
      whereClause += ' AND m.name LIKE ?'
      params.push(`%${filters.search}%`)
    }
    
    return await db.all(`
      SELECT 
        m.*,
        c.name as category_name,
        c.color as category_color,
        s.name as supplier_name,
        s.contact_person as supplier_contact
      FROM materials m
      LEFT JOIN material_categories c ON c.id = m.category_id
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      ${whereClause}
      ORDER BY c.name, m.name
    `, ...params)
  }
  
  // Оптимизированный запрос для статистики заказов
  static async getOrdersStats(dateFrom: string, dateTo: string) {
    const db = await getDb()
    
    return await db.get(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as new_orders,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as in_progress_orders,
        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as cancelled_orders,
        AVG(CAST(createdAt AS REAL)) as avg_processing_time
      FROM orders
      WHERE DATE(createdAt) BETWEEN ? AND ?
    `, dateFrom, dateTo)
  }
  
  // Оптимизированный запрос для отчета по материалам
  static async getMaterialConsumptionReport(dateFrom: string, dateTo: string) {
    const db = await getDb()
    
    return await db.all(`
      SELECT 
        m.name as material_name,
        m.unit,
        SUM(ABS(mm.quantity_change)) as total_consumed,
        AVG(m.sheet_price_single) as avg_price,
        SUM(ABS(mm.quantity_change) * m.sheet_price_single) as total_cost
      FROM material_moves mm
      JOIN materials m ON m.id = mm.material_id
      WHERE mm.move_type IN ('consumption', 'return')
        AND DATE(mm.move_date) BETWEEN ? AND ?
      GROUP BY m.id, m.name, m.unit
      ORDER BY total_consumed DESC
    `, dateFrom, dateTo)
  }
  
  // Оптимизированный запрос для поиска заказов
  static async searchOrders(query: string, limit: number = 20) {
    const db = await getDb()
    
    return await db.all(`
      SELECT 
        o.id,
        o.number,
        o.customerName,
        o.customerPhone,
        o.createdAt,
        os.name as status_name,
        os.color as status_color
      FROM orders o
      LEFT JOIN order_statuses os ON os.id = o.status
      WHERE 
        o.number LIKE ? OR 
        o.customerName LIKE ? OR 
        o.customerPhone LIKE ?
      ORDER BY o.createdAt DESC
      LIMIT ?
    `, `%${query}%`, `%${query}%`, `%${query}%`, limit)
  }
}

