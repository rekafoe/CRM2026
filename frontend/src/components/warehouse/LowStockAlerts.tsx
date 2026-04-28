import React, { useState, useEffect } from 'react'
import { useLogger } from '../../utils/logger'
import { useStockAlerts, useCheckStockLevels, useResolveStockAlert } from '../../api/hooks/useNotifications'
import { useUIStore } from '../../stores/uiStore'
import './LowStockAlerts.css'

interface LowStockAlert {
  id: number
  materialId: number
  materialName: string
  currentQuantity: number
  minQuantity: number
  alertLevel: 'warning' | 'critical' | 'out_of_stock'
  created_at: string
  isResolved: boolean
  resolvedAt?: string
  resolvedBy?: number
  resolvedByName?: string
}

interface AlertStats {
  totalAlerts: number
  activeAlerts: number
  resolvedAlerts: number
  criticalAlerts: number
  warningAlerts: number
  outOfStockAlerts: number
}

export const LowStockAlerts: React.FC = () => {
  const logger = useLogger('LowStockAlerts')
  const { showToast } = useUIStore()
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active')
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  
  // API хуки
  const { data: alerts = [], isLoading, error } = useStockAlerts()
  const checkStockLevels = useCheckStockLevels()
  const resolveStockAlert = useResolveStockAlert()

  // Вычисляем статистику из данных
  const stats: AlertStats = React.useMemo(() => {
    // Защита от ошибок - убеждаемся, что alerts это массив
    const alertsArray = Array.isArray(alerts) ? alerts : []
    
    const totalAlerts = alertsArray.length
    const activeAlerts = alertsArray.filter(a => !a.isResolved).length
    const resolvedAlerts = alertsArray.filter(a => a.isResolved).length
    const criticalAlerts = alertsArray.filter(a => a.alertLevel === 'critical' && !a.isResolved).length
    const warningAlerts = alertsArray.filter(a => a.alertLevel === 'warning' && !a.isResolved).length
    const outOfStockAlerts = alertsArray.filter(a => a.alertLevel === 'out_of_stock' && !a.isResolved).length

    return {
      totalAlerts,
      activeAlerts,
      resolvedAlerts,
      criticalAlerts,
      warningAlerts,
      outOfStockAlerts
    }
  }, [alerts])

  // Проверка остатков
  const handleCheckStockLevels = async () => {
    try {
      const result = await checkStockLevels.mutateAsync()
      const checkedAlerts = Array.isArray(result?.data) ? result.data.length : 0
      setLastCheckedAt(new Date())
      showToast(`Проверка завершена. Найдено предупреждений: ${checkedAlerts}`, 'success')
      logger.info('Проверка остатков завершена')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Не удалось проверить остатки'
      showToast(errorMessage, 'error')
      logger.error('Ошибка проверки остатков', err)
    }
  }

  // Отметить уведомление как решенное
  const handleResolveAlert = async (alertId: number) => {
    try {
      await resolveStockAlert.mutateAsync(alertId)
      showToast('Уведомление отмечено как решенное', 'success')
      logger.info('Уведомление отмечено как решенное', { alertId })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Не удалось отметить уведомление как решенное'
      showToast(errorMessage, 'error')
      logger.error('Ошибка отметки уведомления как решенного', err)
    }
  }


  // Фильтрация уведомлений
  const alertsArray = Array.isArray(alerts) ? alerts : []
  const filteredAlerts = alertsArray.filter(alert => {
    if (filter === 'active') return !alert.isResolved
    if (filter === 'resolved') return alert.isResolved
    return true
  })

  // Получение класса для уровня предупреждения
  const getAlertLevelClass = (level: string) => {
    switch (level) {
      case 'out_of_stock': return 'alert-out-of-stock'
      case 'critical': return 'alert-critical'
      case 'warning': return 'alert-warning'
      default: return 'alert-warning'
    }
  }

  // Получение иконки для уровня предупреждения
  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'out_of_stock': return '🚫'
      case 'critical': return '⚠️'
      case 'warning': return '⚠️'
      default: return '⚠️'
    }
  }

  // Получение текста для уровня предупреждения
  const getAlertLevelText = (level: string) => {
    switch (level) {
      case 'out_of_stock': return 'Нет в наличии'
      case 'critical': return 'Критически низкий остаток'
      case 'warning': return 'Низкий остаток'
      default: return 'Предупреждение'
    }
  }

  // Логируем загрузку данных
  useEffect(() => {
    if (alerts.length > 0) {
      logger.info('Уведомления о низких остатках загружены', { count: alerts.length })
    }
  }, [alerts, logger])

  if (isLoading && alerts.length === 0) {
    return (
      <div className="low-stock-alerts">
        <div className="loading">
          <div className="spinner"></div>
          <p>Загрузка уведомлений...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="low-stock-alerts">
      <div className="alerts-header">
        <h2>📦 Уведомления о низких остатках</h2>
        <div className="alerts-actions">
          {lastCheckedAt && (
            <span className="alerts-last-checked">
              Последняя проверка: {lastCheckedAt.toLocaleString('ru-RU')}
            </span>
          )}
          <button 
            className="btn btn-primary"
            onClick={handleCheckStockLevels}
            disabled={checkStockLevels.isPending}
          >
            {checkStockLevels.isPending ? '⏳ Проверка...' : '🔍 Проверить остатки'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          <span>{error.message}</span>
        </div>
      )}

      {/* Статистика */}
      {stats && (
        <div className="alerts-stats">
          <div className="stat-item">
            <span className="stat-label">Всего уведомлений:</span>
            <span className="stat-value">{stats.totalAlerts}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Активные:</span>
            <span className="stat-value active">{stats.activeAlerts}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Решенные:</span>
            <span className="stat-value resolved">{stats.resolvedAlerts}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Критические:</span>
            <span className="stat-value critical">{stats.criticalAlerts}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Нет в наличии:</span>
            <span className="stat-value out-of-stock">{stats.outOfStockAlerts}</span>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div className="alerts-filters">
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Активные ({alertsArray.filter(a => !a.isResolved).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            Решенные ({alertsArray.filter(a => a.isResolved).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все ({alerts.length})
          </button>
        </div>
      </div>

      {/* Список уведомлений */}
      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="no-alerts">
            <div className="no-alerts-icon">✅</div>
            <p>Нет уведомлений для отображения</p>
          </div>
        ) : (
          filteredAlerts.map(alert => (
            <div key={alert.id} className={`alert-item ${getAlertLevelClass(alert.alertLevel)}`}>
              <div className="alert-header">
                <div className="alert-level">
                  <span className="alert-icon">{getAlertIcon(alert.alertLevel)}</span>
                  <span className="alert-level-text">{getAlertLevelText(alert.alertLevel)}</span>
                </div>
                <div className="alert-date">
                  {new Date((alert as any).created_at ?? (alert as any).createdAt).toLocaleString('ru-RU')}
                </div>
              </div>
              
              <div className="alert-content">
                <div className="alert-material">
                  <strong>{alert.materialName}</strong>
                </div>
                
                <div className="alert-quantities">
                  <div className="quantity-item">
                    <span className="quantity-label">Текущий остаток:</span>
                    <span className="quantity-value">{alert.currentQuantity}</span>
                  </div>
                  <div className="quantity-item">
                    <span className="quantity-label">Минимальный остаток:</span>
                    <span className="quantity-value">{alert.minQuantity}</span>
                  </div>
                </div>

                {alert.isResolved && (
                  <div className="alert-resolved">
                    <span className="resolved-icon">✅</span>
                    <span>Решено {alert.resolvedAt && new Date(alert.resolvedAt).toLocaleString('ru-RU')}</span>
                    {alert.resolvedByName && (
                      <span className="resolved-by">пользователем {alert.resolvedByName}</span>
                    )}
                  </div>
                )}
              </div>

              {!alert.isResolved && (
                <div className="alert-actions">
                  <button 
                    className="btn btn-success btn-sm"
                    onClick={() => handleResolveAlert(alert.id)}
                    disabled={resolveStockAlert.isPending}
                  >
                    {resolveStockAlert.isPending ? '⏳' : '✅'} Отметить как решенное
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
