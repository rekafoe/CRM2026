import React, { memo, useCallback, useMemo } from 'react';
import { Order } from '../../types';

interface MemoizedOrderListProps {
  orders: Order[];
  selectedId: number | null;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  onSelect: (id: number) => void;
}

export const MemoizedOrderList = memo<MemoizedOrderListProps>(({ 
  orders, 
  selectedId, 
  statuses, 
  onSelect 
}) => {
  const handleSelect = useCallback((id: number) => {
    onSelect(id);
  }, [onSelect]);

  // Мемоизируем отфильтрованные заказы с дедупликацией
  const filteredOrders = useMemo(() => {
    // Убираем дубликаты по ID
    const uniqueOrders = orders.filter((order, index, self) => 
      index === self.findIndex(o => o.id === order.id)
    );
    
    return uniqueOrders.map((order) => {
      const status = statuses.find(s => s.id === order.status);
      const maxSort = Math.max(1, ...statuses.map(s => s.sort_order));
      const progress = Math.max(0, Math.min(100, Math.round(((order.status - 1) / Math.max(1, (maxSort - 1))) * 100)));
      
      return {
        ...order,
        statusInfo: status,
        progress
      };
    });
  }, [orders, statuses]);

  return (
    <ul className="order-list">
      {filteredOrders.map((order) => (
        <li
          key={order.id}
          className={`order-item order-list__item ${order.id === selectedId ? "active" : ""}`}
          onClick={() => handleSelect(order.id)}
        >
          <div className="order-item__header">
            <span>{order.number}</span>
            <span className="order-item__id">ID: {order.id}</span>
          </div>
          <div 
            className="order-item__status" 
            style={{ ['--status-color' as any]: order.statusInfo?.color || '#1976d2' }}
          >
            <span className="status-pill">{order.statusInfo?.name || `Статус ${order.status}`}</span>
            <div className="status-bar">
              <div className="status-bar__fill" style={{ width: `${order.progress}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
});

MemoizedOrderList.displayName = 'MemoizedOrderList';

