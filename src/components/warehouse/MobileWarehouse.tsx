import React, { useState, useEffect } from 'react'
import './MobileWarehouse.css'

interface Material {
  id: number
  name: string
  quantity: number
  min_quantity: number
  unit: string
  category_name: string
  supplier_name: string
}

interface MobileWarehouseProps {
  onClose: () => void;
}

export const MobileWarehouse: React.FC<MobileWarehouseProps> = ({ onClose }) => {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showLowStock, setShowLowStock] = useState(false)

  // Загрузка материалов
  const loadMaterials = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/materials', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken') || 'admin-token-123'}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Ошибка загрузки материалов')
      }

      const data = await response.json()
      setMaterials(data)
      console.log('Материалы загружены', { count: data.length })
    } catch (err: any) {
      setError(err.message)
      console.error('Ошибка загрузки материалов', err)
    } finally {
      setLoading(false)
    }
  }

  // Фильтрация материалов
  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         material.category_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         material.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = filterCategory === 'all' || material.category_name === filterCategory
    
    const matchesLowStock = !showLowStock || material.quantity <= material.min_quantity
    
    return matchesSearch && matchesCategory && matchesLowStock
  })

  // Получение уникальных категорий
  const categories = ['all', ...Array.from(new Set(materials.map(m => m.category_name).filter(Boolean)))]

  // Получение статистики
  const stats = {
    total: materials.length,
    lowStock: materials.filter(m => m.quantity <= m.min_quantity).length,
    outOfStock: materials.filter(m => m.quantity === 0).length
  }

  useEffect(() => {
    loadMaterials()
  }, [])

  if (loading) {
    return (
      <div className="mobile-warehouse">
        <div className="mobile-header">
          <h2>📱 Мобильный склад</h2>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <p>Загрузка материалов...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-warehouse">
      <div className="mobile-header">
        <h2>📱 Мобильный склад</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* Статистика */}
      <div className="mobile-stats">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Всего</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">{stats.lowStock}</div>
          <div className="stat-label">Низкий запас</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔴</div>
          <div className="stat-value">{stats.outOfStock}</div>
          <div className="stat-label">Нет в наличии</div>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <div className="mobile-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Поиск материалов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filterCategory === 'all' ? 'active' : ''}`}
            onClick={() => setFilterCategory('all')}
          >
            Все
          </button>
          {categories.slice(1).map(category => (
            <button
              key={category}
              className={`filter-btn ${filterCategory === category ? 'active' : ''}`}
              onClick={() => setFilterCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="toggle-filters">
          <button
            className={`toggle-btn ${showLowStock ? 'active' : ''}`}
            onClick={() => setShowLowStock(!showLowStock)}
          >
            {showLowStock ? '🔴' : '⚪'} Только низкий запас
          </button>
        </div>
      </div>

      {/* Список материалов */}
      <div className="mobile-materials-list">
        {filteredMaterials.length === 0 ? (
          <div className="no-materials">
            <div className="no-materials-icon">📦</div>
            <p>Материалы не найдены</p>
          </div>
        ) : (
          filteredMaterials.map(material => (
            <div key={material.id} className="material-card">
              <div className="material-header">
                <div className="material-name">{material.name}</div>
                <div className={`material-status ${
                  material.quantity === 0 ? 'out-of-stock' :
                  material.quantity <= material.min_quantity ? 'low-stock' : 'normal'
                }`}>
                  {material.quantity === 0 ? '🔴' :
                   material.quantity <= material.min_quantity ? '⚠️' : '✅'}
                </div>
              </div>
              
              <div className="material-details">
                <div className="material-quantity">
                  <span className="quantity-label">Остаток:</span>
                  <span className="quantity-value">{material.quantity} {material.unit}</span>
                </div>
                
                {material.min_quantity > 0 && (
                  <div className="material-min-quantity">
                    <span className="min-label">Мин. остаток:</span>
                    <span className="min-value">{material.min_quantity} {material.unit}</span>
                  </div>
                )}
                
                <div className="material-category">
                  <span className="category-label">Категория:</span>
                  <span className="category-value">{material.category_name || 'Не указана'}</span>
                </div>
                
                {material.supplier_name && (
                  <div className="material-supplier">
                    <span className="supplier-label">Поставщик:</span>
                    <span className="supplier-value">{material.supplier_name}</span>
                  </div>
                )}
              </div>

              <div className="material-actions">
                <button className="action-btn primary">
                  📝 Редактировать
                </button>
                <button className="action-btn secondary">
                  📦 Пополнить
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Быстрые действия */}
      <div className="mobile-quick-actions">
        <button className="quick-action-btn">
          📦 Сканировать QR
        </button>
        <button className="quick-action-btn">
          📊 Отчет
        </button>
        <button className="quick-action-btn">
          🔄 Обновить
        </button>
      </div>
    </div>
  )
}
