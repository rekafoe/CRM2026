import { getDb } from '../config/database'
import { MaterialAlert } from '../models'

export class MaterialAlertService {
  // Получить все уведомления
  static async getAllAlerts(filters: {
    is_read?: boolean;
    alert_type?: string;
    material_id?: number;
    limit?: number;
    offset?: number;
  }) {
    const { is_read, alert_type, material_id, limit, offset } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (is_read !== undefined) { where.push('ma.is_read = ?'); params.push(is_read ? 1 : 0) }
    if (alert_type) { where.push('ma.alert_type = ?'); params.push(alert_type) }
    if (material_id) { where.push('ma.material_id = ?'); params.push(Number(material_id)) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const limitSql = limit ? `LIMIT ${limit}` : ''
    const offsetSql = offset ? `OFFSET ${offset}` : ''
    
    const db = await getDb()
    const alerts = await db.all<MaterialAlert>(
      `SELECT 
        ma.id, ma.material_id, m.name as material_name, ma.alert_type,
        ma.current_quantity, ma.threshold_quantity, ma.message,
        ma.is_read, ma.created_at, ma.read_at, ma.user_id
       FROM material_alerts ma
       JOIN materials m ON m.id = ma.material_id
      ${whereSql}
      ORDER BY ma.created_at DESC
      ${limitSql} ${offsetSql}`,
      ...params
    )
    return alerts
  }

  // Получить непрочитанные уведомления
  static async getUnreadAlerts() {
    const db = await getDb()
    const alerts = await db.all<MaterialAlert>(
      `SELECT 
        ma.id, ma.material_id, m.name as material_name, ma.alert_type,
        ma.current_quantity, ma.threshold_quantity, ma.message,
        ma.is_read, ma.created_at, ma.read_at, ma.user_id
       FROM material_alerts ma
       JOIN materials m ON m.id = ma.material_id
       WHERE ma.is_read = 0
       ORDER BY ma.created_at DESC`
    )
    return alerts
  }

  // Отметить уведомление как прочитанное
  static async markAsRead(alertId: number, userId?: number) {
    const db = await getDb()
    await db.run(
      'UPDATE material_alerts SET is_read = 1, read_at = CURRENT_TIMESTAMP, user_id = ? WHERE id = ?',
      userId || null,
      alertId
    )
  }

  // Отметить все уведомления как прочитанные
  static async markAllAsRead(userId?: number) {
    const db = await getDb()
    await db.run(
      'UPDATE material_alerts SET is_read = 1, read_at = CURRENT_TIMESTAMP, user_id = ? WHERE is_read = 0',
      userId || null
    )
  }

  // Удалить уведомление
  static async deleteAlert(alertId: number) {
    const db = await getDb()
    await db.run('DELETE FROM material_alerts WHERE id = ?', alertId)
  }

  // Удалить старые уведомления (старше 30 дней)
  static async deleteOldAlerts() {
    const db = await getDb()
    await db.run(
      'DELETE FROM material_alerts WHERE created_at < datetime("now", "-30 days")'
    )
  }

  // Проверить и создать уведомления о низких остатках
  static async checkLowStockAlerts() {
    const db = await getDb()
    
    // Получаем материалы с низкими остатками
    const lowStockMaterials = await db.all<any>(
      `SELECT 
        m.id, m.name, m.quantity, m.min_quantity,
        c.name as category_name, s.name as supplier_name
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       WHERE m.min_quantity IS NOT NULL 
       AND m.quantity <= m.min_quantity
       AND m.id NOT IN (
         SELECT material_id FROM material_alerts 
         WHERE alert_type = 'low_stock' AND is_read = 0
       )`
    )

    const alerts: any[] = []
    
    for (const material of lowStockMaterials) {
      const alertType = material.quantity <= 0 ? 'out_of_stock' : 'low_stock'
      const message = material.quantity <= 0 
        ? `Материал "${material.name}" закончился!`
        : `Материал "${material.name}" заканчивается. Остаток: ${material.quantity} ${material.unit || 'шт'}, минимум: ${material.min_quantity} ${material.unit || 'шт'}`

      const result = await db.run(
        'INSERT INTO material_alerts (material_id, alert_type, current_quantity, threshold_quantity, message) VALUES (?, ?, ?, ?, ?)',
        material.id,
        alertType,
        material.quantity,
        material.min_quantity,
        message
      )
      
      alerts.push({
        id: result.lastID,
        material_id: material.id,
        material_name: material.name,
        alert_type: alertType,
        current_quantity: material.quantity,
        threshold_quantity: material.min_quantity,
        message,
        is_read: false,
        created_at: new Date().toISOString()
      })
    }

    return alerts
  }

  // Получить статистику уведомлений
  static async getAlertStats() {
    const db = await getDb()
    const stats = await db.get<{
      total_alerts: number;
      unread_alerts: number;
      low_stock_alerts: number;
      out_of_stock_alerts: number;
    }>(
      `SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN is_read = 0 THEN 1 END) as unread_alerts,
        COUNT(CASE WHEN alert_type = 'low_stock' AND is_read = 0 THEN 1 END) as low_stock_alerts,
        COUNT(CASE WHEN alert_type = 'out_of_stock' AND is_read = 0 THEN 1 END) as out_of_stock_alerts
       FROM material_alerts`
    )
    return stats
  }
}
