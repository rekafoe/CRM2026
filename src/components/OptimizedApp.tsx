import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react'
import { useOptimizedData } from '../hooks/useOptimizedData'
import { optimizedApiClient } from '../api/optimizedApi'
import OptimizedOrderList from './OptimizedOrderList'
import { WarehouseDashboard } from './warehouse/WarehouseDashboard'
import type { Order } from '../types'

// Ленивая загрузка тяжелых компонентов
const CalculatorRulesPage = lazy(() => import('../pages/CalculatorRulesPage'))

interface OptimizedAppProps {
  currentUser: any
  onLogout: () => void
}

const OptimizedApp: React.FC<OptimizedAppProps> = ({ currentUser, onLogout }) => {
  // Состояние
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [contextUserId, setContextUserId] = useState<number | null>(null)
  const [contextDate, setContextDate] = useState(new Date().toISOString().slice(0, 10))
  const [showMaterials, setShowMaterials] = useState(false)
  const [currentPage, setCurrentPage] = useState<string>('orders')

  // Оптимизированная загрузка данных
  const { data: statuses, loading: statusesLoading } = useOptimizedData({
    fetchFn: () => optimizedApiClient.getOrdersStats(contextDate, contextDate),
    cacheKey: 'order_statuses',
    cacheTTL: 10 * 60 * 1000, // 10 минут
  })

  const { data: allUsers, loading: usersLoading } = useOptimizedData({
    fetchFn: () => optimizedApiClient.getOrdersStats(contextDate, contextDate),
    cacheKey: 'users',
    cacheTTL: 15 * 60 * 1000, // 15 минут
  })

  const { data: lowStock, loading: lowStockLoading } = useOptimizedData({
    fetchFn: () => optimizedApiClient.getMaterials(),
    cacheKey: 'low_stock',
    cacheTTL: 5 * 60 * 1000, // 5 минут
    enabled: currentUser?.role === 'admin'
  })

  // Оптимизированная загрузка заказов с пагинацией
  const { 
    data: orders, 
    loading: ordersLoading, 
    refetch: refetchOrders 
  } = useOptimizedData({
    fetchFn: () => optimizedApiClient.getOrders({
      userId: contextUserId || undefined,
      dateFrom: contextDate,
      dateTo: contextDate
    }),
    cacheKey: `orders:${contextUserId}:${contextDate}`,
    cacheTTL: 2 * 60 * 1000, // 2 минуты
    dependencies: [contextUserId, contextDate]
  })

  // Мемоизированные обработчики
  const handleSelectOrder = useCallback((id: number) => {
    setSelectedId(id)
  }, [])

  const handleCreateOrder = useCallback(async () => {
    try {
      // Создаем заказ через оптимизированный API
      const newOrder = await optimizedApiClient.getOrders() // Заглушка
      // Обновляем кэш
      await optimizedApiClient.invalidateOrdersCache()
      refetchOrders()
    } catch (error) {
      console.error('Ошибка создания заказа:', error)
    }
  }, [refetchOrders])

  const handleContextChange = useCallback((userId: number | null, date: string) => {
    setContextUserId(userId)
    setContextDate(date)
  }, [])

  // Мемоизированные вычисления
  const selectedOrder = useMemo(() => {
    return orders.find((o: Order) => o.id === selectedId) || null
  }, [orders, selectedId])

  const lowStockCount = useMemo(() => {
    return lowStock?.filter((item: any) => item.quantity <= item.min_quantity).length || 0
  }, [lowStock])

  // Эффекты
  useEffect(() => {
    if (currentUser && !contextUserId) {
      setContextUserId(currentUser.id)
    }
  }, [currentUser, contextUserId])

  // Рендер компонентов страниц
  const renderPage = useCallback(() => {
    switch (currentPage) {
      case 'materials':
        return (
          <Suspense fallback={<div>Загрузка...</div>}>
            <WarehouseDashboard />
          </Suspense>
        )
      case 'calculator-rules':
        return (
          <Suspense fallback={<div>Загрузка...</div>}>
            <CalculatorRulesPage />
          </Suspense>
        )
      default:
        return (
          <div className="detail">
            {selectedOrder ? (
              <div className="order-detail">
                <h2>Заказ #{selectedOrder.number}</h2>
                <p>Статус: {selectedOrder.status}</p>
                <p>Клиент: {selectedOrder.customerName}</p>
                <p>Телефон: {selectedOrder.customerPhone}</p>
              </div>
            ) : (
              <div className="no-selection">
                <p>Выберите заказ для просмотра деталей</p>
              </div>
            )}
          </div>
        )
    }
  }, [currentPage, selectedOrder])

  if (statusesLoading || usersLoading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>CRM Система</h1>
        <div className="user-info">
          <span>Добро пожаловать, {currentUser?.name}</span>
          <button onClick={onLogout} className="logout-btn">
            Выйти
          </button>
        </div>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          {/* Контекстные фильтры */}
          <div className="context-filters">
            <label>
              Пользователь:
              <select 
                value={contextUserId || ''} 
                onChange={(e) => setContextUserId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Все</option>
                {allUsers?.map((user: any) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </label>
            <label>
              Дата:
              <input 
                type="date" 
                value={contextDate} 
                onChange={(e) => setContextDate(e.target.value)}
              />
            </label>
          </div>

          {/* Уведомления о низких остатках */}
          {lowStockCount > 0 && (
            <div className="low-stock-alert">
              ⚠️ Низкие остатки: {lowStockCount} позиций
            </div>
          )}

          {/* Список заказов */}
          <OptimizedOrderList
            orders={orders}
            selectedId={selectedId}
            statuses={statuses || []}
            onSelect={handleSelectOrder}
          />

          {/* Кнопки действий */}
          {currentUser?.role === 'admin' && (
            <div className="admin-actions">
              <button
                className="action-btn"
                onClick={() => setCurrentPage('materials')}
              >
                📦 Материалы
              </button>
              <button
                className="action-btn"
                onClick={() => setCurrentPage('calculator-rules')}
              >
                🧮 Калькулятор
              </button>
            </div>
          )}

          <button
            className="add-order-btn"
            onClick={handleCreateOrder}
            disabled={ordersLoading}
          >
            {ordersLoading ? 'Загрузка...' : '+ Новый заказ'}
          </button>
        </aside>

        {/* Основной контент */}
        <main className="main-content">
          {renderPage()}
        </main>
      </div>

      {/* Модальные окна */}
    </div>
  )
}

export default OptimizedApp

