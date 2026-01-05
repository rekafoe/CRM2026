import React, { useState, useEffect } from 'react'
import './CostCalculation.css?v=2'

interface MaterialCost {
  materialId: number
  materialName: string
  quantity: number
  unitPrice: number
  totalCost: number
  unit: string
}

interface ServiceCost {
  serviceId: number
  serviceName: string
  quantity: number
  unitPrice: number
  totalCost: number
  unit: string
}

interface ProductCostBreakdown {
  productId: string
  productName: string
  materialCosts: MaterialCost[]
  serviceCosts: ServiceCost[]
  totalMaterialCost: number
  totalServiceCost: number
  totalCost: number
  margin: number
  sellingPrice: number
  profit: number
  profitMargin: number
}

interface CostCalculationResult {
  success: boolean
  breakdown: ProductCostBreakdown
  recommendations: string[]
  warnings: string[]
}

export const CostCalculation: React.FC = () => {
  const token = localStorage.getItem('crmToken') || 'admin-token-123'
  const [result, setResult] = useState<CostCalculationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Параметры расчета
  const [productType, setProductType] = useState('flyers')
  const [productVariant, setProductVariant] = useState('A4')
  const [quantity, setQuantity] = useState(100)
  const [specifications, setSpecifications] = useState<any>({})

  // Опции для выбора
  const productTypes = [
    { value: 'flyers', label: 'Листовки' },
    { value: 'business-cards', label: 'Визитки' },
    { value: 'posters', label: 'Плакаты' },
    { value: 'stickers', label: 'Наклейки' },
    { value: 'brochures', label: 'Брошюры' }
  ]

  const productVariants = [
    { value: 'A4', label: 'A4' },
    { value: 'A5', label: 'A5' },
    { value: 'A3', label: 'A3' },
    { value: 'SRA3', label: 'SRA3' },
    { value: 'custom', label: 'Произвольный' }
  ]

  // Расчет себестоимости
  const calculateCost = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/cost-calculation/calculate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productType,
          productVariant,
          quantity,
          specifications
        })
      })

      if (!response.ok) {
        throw new Error('Ошибка расчета себестоимости')
      }

      const data = await response.json()
      console.log('Получены данные от сервера:', data)
      setResult(data.data)
      console.log('Себестоимость рассчитана', { 
        productType, 
        productVariant, 
        quantity,
        totalCost: data.data?.breakdown?.totalCost,
        profit: data.data?.breakdown?.profit
      })
    } catch (err: any) {
      setError(err.message)
      console.error('Ошибка расчета себестоимости', err)
    } finally {
      setLoading(false)
    }
  }

  // Анализ прибыльности
  const analyzeProfitability = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/cost-calculation/profitability', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productType,
          productVariant,
          quantity
        })
      })

      if (!response.ok) {
        throw new Error('Ошибка анализа прибыльности')
      }

      const data = await response.json()
      console.log('Анализ прибыльности завершен', data.data)
      
      // Здесь можно добавить отображение анализа
      alert(`Анализ прибыльности: ${data.data.profitability.profitabilityLevel} уровень`)
    } catch (err: any) {
      setError(err.message)
      console.error('Ошибка анализа прибыльности', err)
    } finally {
      setLoading(false)
    }
  }

  // Получение иконки для уровня прибыльности
  const getProfitabilityIcon = (margin: number) => {
    if (margin > 50) return '🟢'
    if (margin > 20) return '🟡'
    if (margin > 0) return '🟠'
    return '🔴'
  }

  // Получение класса для уровня прибыльности
  const getProfitabilityClass = (margin: number) => {
    if (margin > 50) return 'profitability-high'
    if (margin > 20) return 'profitability-medium'
    if (margin > 0) return 'profitability-low'
    return 'profitability-negative'
  }

  return (
    <div className="cost-calculation">
      <div className="cost-calculation-header">
        <h2>💰 Расчет себестоимости товаров</h2>
        <p>Рассчитайте себестоимость и прибыльность ваших продуктов</p>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* Форма параметров */}
      <div className="calculation-form">
        <div className="form-group">
          <label htmlFor="productType">Тип продукта:</label>
          <select
            id="productType"
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
            className="form-select"
          >
            {productTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="productVariant">Вариант:</label>
          <select
            id="productVariant"
            value={productVariant}
            onChange={(e) => setProductVariant(e.target.value)}
            className="form-select"
          >
            {productVariants.map(variant => (
              <option key={variant.value} value={variant.value}>
                {variant.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="quantity">Количество:</label>
          <input
            id="quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min="1"
            className="form-input"
          />
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={calculateCost}
            disabled={loading}
          >
            {loading ? '🔄 Расчет...' : '🧮 Рассчитать себестоимость'}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={analyzeProfitability}
            disabled={loading}
          >
            📊 Анализ прибыльности
          </button>
        </div>
      </div>

      {/* Результаты расчета */}
      {result && result.success && result.breakdown && (
        <div className="calculation-results">
          <div className="results-header">
            <h3>📊 Результаты расчета</h3>
            <div className="profitability-indicator">
              <span className={`profitability-badge ${getProfitabilityClass(result.breakdown.profitMargin || 0)}`}>
                {getProfitabilityIcon(result.breakdown.profitMargin || 0)}
                {(result.breakdown.profitMargin || 0).toFixed(1)}% маржа
              </span>
            </div>
          </div>

          {/* Основные показатели */}
          <div className="key-metrics">
            <div className="metric-card">
              <div className="metric-label">Общая себестоимость</div>
              <div className="metric-value">{(result.breakdown.totalCost || 0).toFixed(2)} BYN</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Цена продажи</div>
              <div className="metric-value">{(result.breakdown.sellingPrice || 0).toFixed(2)} BYN</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Прибыль</div>
              <div className={`metric-value ${(result.breakdown.profit || 0) >= 0 ? 'positive' : 'negative'}`}>
                {(result.breakdown.profit || 0).toFixed(2)} BYN
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Маржинальность</div>
              <div className="metric-value">{(result.breakdown.profitMargin || 0).toFixed(1)}%</div>
            </div>
          </div>

          {/* Детализация затрат */}
          <div className="cost-breakdown">
            <h4>📦 Затраты на материалы</h4>
            <div className="cost-list">
              {(result.breakdown.materialCosts || []).map((cost, index) => (
                <div key={index} className="cost-item">
                  <div className="cost-info">
                    <span className="cost-name">{cost.materialName}</span>
                    <span className="cost-details">
                      {cost.quantity} {cost.unit} × {(cost.unitPrice || 0).toFixed(2)} BYN
                    </span>
                  </div>
                  <div className="cost-total">{(cost.totalCost || 0).toFixed(2)} BYN</div>
                </div>
              ))}
              <div className="cost-total-item">
                <span className="total-label">Итого материалы:</span>
                <span className="total-value">{(result.breakdown.totalMaterialCost || 0).toFixed(2)} BYN</span>
              </div>
            </div>

            {(result.breakdown.serviceCosts || []).length > 0 && (
              <>
                <h4>🔧 Затраты на услуги</h4>
                <div className="cost-list">
                  {(result.breakdown.serviceCosts || []).map((cost, index) => (
                    <div key={index} className="cost-item">
                      <div className="cost-info">
                        <span className="cost-name">{cost.serviceName}</span>
                        <span className="cost-details">
                          {cost.quantity} {cost.unit} × {(cost.unitPrice || 0).toFixed(2)} BYN
                        </span>
                      </div>
                      <div className="cost-total">{(cost.totalCost || 0).toFixed(2)} BYN</div>
                    </div>
                  ))}
                  <div className="cost-total-item">
                    <span className="total-label">Итого услуги:</span>
                    <span className="total-value">{(result.breakdown.totalServiceCost || 0).toFixed(2)} BYN</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Рекомендации и предупреждения */}
          {(result.recommendations || []).length > 0 && (
            <div className="recommendations">
              <h4>💡 Рекомендации</h4>
              <ul>
                {(result.recommendations || []).map((rec, index) => (
                  <li key={index} className="recommendation-item">{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {(result.warnings || []).length > 0 && (
            <div className="warnings">
              <h4>⚠️ Предупреждения</h4>
              <ul>
                {(result.warnings || []).map((warning, index) => (
                  <li key={index} className="warning-item">{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
