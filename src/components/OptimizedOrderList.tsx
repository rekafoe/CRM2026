import React, { memo, useMemo, useCallback } from 'react'
import type { Order } from '../types'

interface OptimizedOrderListProps {
  orders: Order[]
  selectedId: number | null
  statuses: Array<{ id: number; name: string; color: string; sort_order: number }>
  onSelect: (id: number) => void
}

// Мемоизированный компонент элемента заказа
const OrderItem = memo(({ 
  order, 
  isSelected, 
  status, 
  progress, 
  onSelect 
}: {
  order: Order
  isSelected: boolean
  status: { name: string; color: string }
  progress: number
  onSelect: (id: number) => void
}) => {
  const handleClick = useCallback(() => {
    onSelect(order.id)
  }, [order.id, onSelect])

  return (
    <li
      className={`order-item order-list__item ${isSelected ? "active" : ""}`}
      onClick={handleClick}
    >
      <div className="order-item__header">
        <span>{order.number}</span>
        <span className="order-item__id">ID: {order.id}</span>
      </div>
      <div className="order-item__status" style={{ ['--status-color' as any]: status.color }}>
        <span className="status-pill">{status.name}</span>
        <div className="status-bar">
          <div className="status-bar__fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </li>
  )
})

OrderItem.displayName = 'OrderItem'

// Основной компонент списка заказов
const OptimizedOrderList = memo(({ 
  orders, 
  selectedId, 
  statuses, 
  onSelect 
}: OptimizedOrderListProps) => {
  // Мемоизируем вычисления статусов и прогресса
  const ordersWithStatus = useMemo(() => {
    const maxSort = Math.max(1, ...statuses.map(s => s.sort_order))
    
    return orders.map(order => {
      const status = statuses.find(s => s.id === order.status) || { 
        name: `Статус ${order.status}`, 
        color: '#1976d2',
        sort_order: 0
      }
      const progress = Math.max(0, Math.min(100, Math.round(((order.status - 1) / Math.max(1, (maxSort - 1))) * 100)))
      
      return {
        ...order,
        status,
        progress
      }
    })
  }, [orders, statuses])

  return (
    <ul className="order-list">
      {ordersWithStatus.map((order) => (
        <OrderItem
          key={order.id}
          order={order}
          isSelected={order.id === selectedId}
          status={order.status}
          progress={order.progress}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
})

OptimizedOrderList.displayName = 'OptimizedOrderList'

export default OptimizedOrderList

