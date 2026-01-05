import { getDb } from '../config/database'
import { logger } from '../utils/logger'

export interface LowStockAlert {
  id: number
  materialId: number
  materialName: string
  currentQuantity: number
  minQuantity: number
  alertLevel: 'warning' | 'critical' | 'out_of_stock'
  createdAt: Date
  isResolved: boolean
  resolvedAt?: Date
  resolvedBy?: number
}

export interface StockCheckResult {
  alerts: LowStockAlert[]
  totalAlerts: number
  criticalAlerts: number
  warningAlerts: number
  outOfStockAlerts: number
}

export class LowStockNotificationService {
  /**
   * Проверить остатки материалов и создать уведомления
   */
  static async checkStockLevels(): Promise<StockCheckResult> {
    const db = await getDb()
    const alerts: LowStockAlert[] = []
    
    try {
      // Получаем все материалы с их остатками
      const materials = await db.all(`
        SELECT 
          m.id,
          m.name,
          m.quantity,
          m.min_quantity,
          m.category_id,
          c.name as category_name
        FROM materials m
        LEFT JOIN material_categories c ON c.id = m.category_id
        WHERE m.quantity >= 0
        ORDER BY m.quantity ASC
      `)

      for (const material of materials) {
        const currentQuantity = material.quantity
        const minQuantity = material.min_quantity || 0
        
        // Определяем уровень предупреждения
        let alertLevel: 'warning' | 'critical' | 'out_of_stock' = 'warning'
        
        if (currentQuantity <= 0) {
          alertLevel = 'out_of_stock'
        } else if (currentQuantity <= minQuantity * 0.5) {
          alertLevel = 'critical'
        } else if (currentQuantity <= minQuantity) {
          alertLevel = 'warning'
        }

        // Создаем уведомление только если есть проблема
        if (alertLevel !== 'warning' || currentQuantity <= minQuantity) {
          // Проверяем, есть ли уже активное уведомление для этого материала
          const existingAlert = await db.get(`
            SELECT id FROM low_stock_alerts 
            WHERE material_id = ? AND is_resolved = 0
          `, material.id)

          if (!existingAlert) {
            // Создаем новое уведомление
            const alertId = await db.run(`
              INSERT INTO low_stock_alerts 
              (material_id, current_quantity, min_quantity, alert_level, created_at, is_resolved)
              VALUES (?, ?, ?, ?, datetime('now'), 0)
            `, material.id, currentQuantity, minQuantity, alertLevel)

            alerts.push({
              id: alertId.lastID!,
              materialId: material.id,
              materialName: material.name,
              currentQuantity,
              minQuantity,
              alertLevel,
              createdAt: new Date(),
              isResolved: false
            })

            logger.warn('Создано уведомление о низком остатке', {
              materialId: material.id,
              materialName: material.name,
              currentQuantity,
              minQuantity,
              alertLevel
            })
          }
        }
      }

      // Подсчитываем статистику
      const totalAlerts = alerts.length
      const criticalAlerts = alerts.filter(a => a.alertLevel === 'critical').length
      const warningAlerts = alerts.filter(a => a.alertLevel === 'warning').length
      const outOfStockAlerts = alerts.filter(a => a.alertLevel === 'out_of_stock').length

      logger.info('Проверка остатков завершена', {
        totalAlerts,
        criticalAlerts,
        warningAlerts,
        outOfStockAlerts
      })

      return {
        alerts,
        totalAlerts,
        criticalAlerts,
        warningAlerts,
        outOfStockAlerts
      }

    } catch (error: any) {
      logger.error('Ошибка проверки остатков', error)
      throw error
    }
  }

  /**
   * Получить все активные уведомления
   */
  static async getActiveAlerts(): Promise<LowStockAlert[]> {
    const db = await getDb()
    
    try {
      const alerts = await db.all(`
        SELECT 
          lsa.id,
          lsa.material_id,
          m.name as material_name,
          lsa.current_quantity,
          lsa.min_quantity,
          lsa.alert_level,
          lsa.created_at,
          lsa.is_resolved,
          lsa.resolved_at,
          lsa.resolved_by,
          u.name as resolved_by_name
        FROM low_stock_alerts lsa
        JOIN materials m ON m.id = lsa.material_id
        LEFT JOIN users u ON u.id = lsa.resolved_by
        WHERE lsa.is_resolved = 0
        ORDER BY 
          CASE lsa.alert_level 
            WHEN 'out_of_stock' THEN 1
            WHEN 'critical' THEN 2
            WHEN 'warning' THEN 3
          END,
          lsa.created_at DESC
      `)

      return alerts.map((alert: any) => ({
        id: alert.id,
        materialId: alert.material_id,
        materialName: alert.material_name,
        currentQuantity: alert.current_quantity,
        minQuantity: alert.min_quantity,
        alertLevel: alert.alert_level,
        createdAt: new Date(alert.created_at),
        isResolved: Boolean(alert.is_resolved),
        resolvedAt: alert.resolved_at ? new Date(alert.resolved_at) : undefined,
        resolvedBy: alert.resolved_by,
        resolvedByName: alert.resolved_by_name
      }))
    } catch (error: any) {
      logger.error('Ошибка получения активных уведомлений', error)
      return []
    }
  }

  /**
   * Отметить уведомление как решенное
   */
  static async resolveAlert(alertId: number, userId?: number): Promise<boolean> {
    const db = await getDb()
    
    try {
      await db.run(`
        UPDATE low_stock_alerts 
        SET is_resolved = 1, resolved_at = datetime('now'), resolved_by = ?
        WHERE id = ? AND is_resolved = 0
      `, userId, alertId)

      logger.info('Уведомление отмечено как решенное', { alertId, userId })
      return true
    } catch (error: any) {
      logger.error('Ошибка отметки уведомления как решенного', error)
      return false
    }
  }

  /**
   * Автоматически решить уведомления для материалов с достаточным остатком
   */
  static async autoResolveAlerts(): Promise<number> {
    const db = await getDb()
    let resolvedCount = 0
    
    try {
      // Получаем все активные уведомления
      const activeAlerts = await db.all(`
        SELECT lsa.id, lsa.material_id, lsa.min_quantity, m.quantity
        FROM low_stock_alerts lsa
        JOIN materials m ON m.id = lsa.material_id
        WHERE lsa.is_resolved = 0
      `)

      for (const alert of activeAlerts) {
        const currentQuantity = alert.quantity
        const minQuantity = alert.min_quantity || 0
        
        // Если остаток превышает минимальный, решаем уведомление
        if (currentQuantity > minQuantity) {
          await db.run(`
            UPDATE low_stock_alerts 
            SET is_resolved = 1, resolved_at = datetime('now'), resolved_by = NULL
            WHERE id = ?
          `, alert.id)
          
          resolvedCount++
        }
      }

      if (resolvedCount > 0) {
        logger.info('Автоматически решены уведомления', { resolvedCount })
      }

      return resolvedCount
    } catch (error: any) {
      logger.error('Ошибка автоматического решения уведомлений', error)
      return 0
    }
  }

  /**
   * Получить статистику уведомлений
   */
  static async getAlertStats(): Promise<{
    totalAlerts: number
    activeAlerts: number
    resolvedAlerts: number
    criticalAlerts: number
    warningAlerts: number
    outOfStockAlerts: number
  }> {
    const db = await getDb()
    
    try {
      const stats = await db.get(`
        SELECT 
          COUNT(*) as total_alerts,
          SUM(CASE WHEN is_resolved = 0 THEN 1 ELSE 0 END) as active_alerts,
          SUM(CASE WHEN is_resolved = 1 THEN 1 ELSE 0 END) as resolved_alerts,
          SUM(CASE WHEN alert_level = 'critical' AND is_resolved = 0 THEN 1 ELSE 0 END) as critical_alerts,
          SUM(CASE WHEN alert_level = 'warning' AND is_resolved = 0 THEN 1 ELSE 0 END) as warning_alerts,
          SUM(CASE WHEN alert_level = 'out_of_stock' AND is_resolved = 0 THEN 1 ELSE 0 END) as out_of_stock_alerts
        FROM low_stock_alerts
      `)

      return {
        totalAlerts: stats.total_alerts || 0,
        activeAlerts: stats.active_alerts || 0,
        resolvedAlerts: stats.resolved_alerts || 0,
        criticalAlerts: stats.critical_alerts || 0,
        warningAlerts: stats.warning_alerts || 0,
        outOfStockAlerts: stats.out_of_stock_alerts || 0
      }
    } catch (error: any) {
      logger.error('Ошибка получения статистики уведомлений', error)
      return {
        totalAlerts: 0,
        activeAlerts: 0,
        resolvedAlerts: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        outOfStockAlerts: 0
      }
    }
  }

  /**
   * Настроить автоматическую проверку остатков
   */
  static async scheduleStockCheck(): Promise<void> {
    // Этот метод можно расширить для интеграции с cron или другими планировщиками
    logger.info('Запланирована проверка остатков материалов')
  }
}
