import React, { useState, useEffect } from 'react'
import { MoneyAmount } from '../ui'
import './MaterialsAnalytics.css'

interface MaterialAnalytics {
  materialId: number
  materialName: string
  category: string
  supplier: string
  currentStock: number
  minStock: number
  maxStock: number
  averageConsumption: number
  consumptionTrend: 'increasing' | 'decreasing' | 'stable'
  turnoverRate: number
  stockValue: number
  lastMovement: string
  movementCount: number
}

interface AnalyticsSummary {
  totalMaterials: number
  totalValue: number
  lowStockCount: number
  outOfStockCount: number
  averageTurnover: number
}

interface Trends {
  stockTrend: 'increasing' | 'decreasing' | 'stable'
  consumptionTrend: 'increasing' | 'decreasing' | 'stable'
  valueTrend: 'increasing' | 'decreasing' | 'stable'
}

export const MaterialsAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<MaterialAnalytics[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [trends, setTrends] = useState<Trends | null>(null)
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'trends' | 'recommendations'>('overview')
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value' | 'turnover'>('name')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  // Загрузка аналитики
  const loadAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/materials-analytics/full', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken') || 'admin-token-123'}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Ошибка загрузки аналитики')
      }

      const data = await response.json()
      setAnalytics(data.data.materials)
      setSummary(data.data.summary)
      setTrends(data.data.trends)
      setRecommendations(data.data.recommendations)
      console.log('Аналитика материалов загружена', { 
        totalMaterials: data.data.summary.totalMaterials,
        totalValue: data.data.summary.totalValue
      })
    } catch (err: any) {
      setError(err.message)
      console.error('Ошибка загрузки аналитики', err)
    } finally {
      setLoading(false)
    }
  }

  // Получение уникальных категорий
  const categories = ['all', ...Array.from(new Set(analytics.map(a => a.category).filter(Boolean)))]

  // Фильтрация и сортировка материалов
  const filteredAndSortedAnalytics = analytics
    .filter(a => filterCategory === 'all' || a.category === filterCategory)
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.materialName.localeCompare(b.materialName)
        case 'stock':
          return b.currentStock - a.currentStock
        case 'value':
          return b.stockValue - a.stockValue
        case 'turnover':
          return b.turnoverRate - a.turnoverRate
        default:
          return 0
      }
    })

  // Получение иконки для тренда
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return '📈'
      case 'decreasing': return '📉'
      case 'stable': return '➡️'
      default: return '➡️'
    }
  }

  // Получение класса для тренда
  const getTrendClass = (trend: string) => {
    switch (trend) {
      case 'increasing': return 'trend-increasing'
      case 'decreasing': return 'trend-decreasing'
      case 'stable': return 'trend-stable'
      default: return 'trend-stable'
    }
  }

  // Получение статуса запаса
  const getStockStatus = (current: number, min: number) => {
    if (current === 0) return { status: 'out-of-stock', icon: '🔴', text: 'Нет в наличии' }
    if (current <= min) return { status: 'low-stock', icon: '⚠️', text: 'Низкий запас' }
    if (current <= min * 1.5) return { status: 'medium-stock', icon: '🟡', text: 'Средний запас' }
    return { status: 'good-stock', icon: '✅', text: 'Нормальный запас' }
  }

  useEffect(() => {
    loadAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="materials-analytics">
        <div className="analytics-header">
          <h2>📊 Аналитика материалов</h2>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <p>Загрузка аналитики...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="materials-analytics">
      <div className="analytics-header">
        <h2>📊 Аналитика материалов</h2>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={loadAnalytics}
            disabled={loading}
          >
            🔄 Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* Сводка */}
      {summary && (
        <div className="analytics-summary">
          <div className="summary-card">
            <div className="summary-icon">📦</div>
            <div className="summary-value">{summary.totalMaterials}</div>
            <div className="summary-label">Всего материалов</div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">💰</div>
            <div className="summary-value"><MoneyAmount value={summary.totalValue} decimals={0} /></div>
            <div className="summary-label">Общая стоимость</div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">⚠️</div>
            <div className="summary-value">{summary.lowStockCount}</div>
            <div className="summary-label">Низкий запас</div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">🔴</div>
            <div className="summary-value">{summary.outOfStockCount}</div>
            <div className="summary-label">Нет в наличии</div>
          </div>
          <div className="summary-card">
            <div className="summary-icon">🔄</div>
            <div className="summary-value">{summary.averageTurnover.toFixed(2)}</div>
            <div className="summary-label">Средняя оборачиваемость</div>
          </div>
        </div>
      )}

      {/* Тренды */}
      {trends && (
        <div className="analytics-trends">
          <h3>📈 Тренды</h3>
          <div className="trends-grid">
            <div className="trend-item">
              <div className="trend-label">Запасы</div>
              <div className={`trend-value ${getTrendClass(trends.stockTrend)}`}>
                {getTrendIcon(trends.stockTrend)} {trends.stockTrend}
              </div>
            </div>
            <div className="trend-item">
              <div className="trend-label">Потребление</div>
              <div className={`trend-value ${getTrendClass(trends.consumptionTrend)}`}>
                {getTrendIcon(trends.consumptionTrend)} {trends.consumptionTrend}
              </div>
            </div>
            <div className="trend-item">
              <div className="trend-label">Стоимость</div>
              <div className={`trend-value ${getTrendClass(trends.valueTrend)}`}>
                {getTrendIcon(trends.valueTrend)} {trends.valueTrend}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Рекомендации */}
      {recommendations.length > 0 && (
        <div className="analytics-recommendations">
          <h3>💡 Рекомендации</h3>
          <div className="recommendations-list">
            {recommendations.map((rec, index) => (
              <div key={index} className="recommendation-item">
                <span className="recommendation-icon">💡</span>
                <span className="recommendation-text">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Табы */}
      <div className="analytics-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Обзор
        </button>
        <button 
          className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >
          📦 Материалы
        </button>
        <button 
          className={`tab-btn ${activeTab === 'trends' ? 'active' : ''}`}
          onClick={() => setActiveTab('trends')}
        >
          📈 Тренды
        </button>
        <button 
          className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          💡 Рекомендации
        </button>
      </div>

      {/* Контент табов */}
      <div className="analytics-content">
        {activeTab === 'materials' && (
          <div className="materials-tab">
            <div className="materials-filters">
              <div className="filter-group">
                <label>Сортировка:</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="filter-select"
                >
                  <option value="name">По названию</option>
                  <option value="stock">По остатку</option>
                  <option value="value">По стоимости</option>
                  <option value="turnover">По оборачиваемости</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Категория:</label>
                <select 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="filter-select"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'Все категории' : category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="materials-list">
              {filteredAndSortedAnalytics.map(material => {
                const stockStatus = getStockStatus(material.currentStock, material.minStock)
                return (
                  <div key={material.materialId} className="material-analytics-card">
                    <div className="material-header">
                      <div className="material-name">{material.materialName}</div>
                      <div className={`material-status ${stockStatus.status}`}>
                        <span className="status-icon">{stockStatus.icon}</span>
                        <span className="status-text">{stockStatus.text}</span>
                      </div>
                    </div>
                    
                    <div className="material-details">
                      <div className="detail-row">
                        <span className="detail-label">Категория:</span>
                        <span className="detail-value">{material.category}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Поставщик:</span>
                        <span className="detail-value">{material.supplier}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Остаток:</span>
                        <span className="detail-value">{material.currentStock} (мин: {material.minStock})</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Стоимость:</span>
                        <span className="detail-value"><MoneyAmount value={material.stockValue} /></span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Оборачиваемость:</span>
                        <span className="detail-value">{material.turnoverRate.toFixed(2)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Потребление:</span>
                        <span className="detail-value">{material.averageConsumption.toFixed(2)}/день</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Тренд:</span>
                        <span className={`detail-value ${getTrendClass(material.consumptionTrend)}`}>
                          {getTrendIcon(material.consumptionTrend)} {material.consumptionTrend}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="trends-tab">
            <div className="trends-charts">
              <div className="chart-placeholder">
                <div className="chart-icon">📊</div>
                <div className="chart-text">Графики трендов</div>
                <div className="chart-description">
                  Здесь будут отображаться графики изменения запасов, потребления и стоимости материалов
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="recommendations-tab">
            <div className="recommendations-content">
              {recommendations.length === 0 ? (
                <div className="no-recommendations">
                  <div className="no-recommendations-icon">✅</div>
                  <p>Нет рекомендаций</p>
                </div>
              ) : (
                <div className="recommendations-grid">
                  {recommendations.map((rec, index) => (
                    <div key={index} className="recommendation-card">
                      <div className="recommendation-icon">💡</div>
                      <div className="recommendation-text">{rec}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
