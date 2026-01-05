import React, { memo, useCallback, useMemo } from 'react';
import { Order } from '../../types';
import { useOrderStatusClasses } from './hooks/useOrderStatusClasses';
import './styles/OrderList.css';

interface OrderListProps {
  orders: Order[];
  selectedId: number | null;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  onSelect: (id: number) => void;
}

// Компонент для заголовка элемента заказа
const OrderItemHeader = memo<{
  orderNumber: string;
  orderId: number;
}>(({ orderNumber, orderId }) => (
  <div className="order-item__header">
    <span className="order-item__number">{orderNumber}</span>
    <span className="order-item__id">ID: {orderId}</span>
  </div>
));

OrderItemHeader.displayName = 'OrderItemHeader';

// Компонент для статуса элемента заказа
const OrderItemStatus = memo<{
  statusInfo: { name: string; color?: string } | undefined;
  status: number;
  progress: number;
}>(({ statusInfo, status, progress }) => {
  const { pillClass, barClass } = useOrderStatusClasses(statusInfo, status);
  
  return (
    <div className="order-item__status">
      <span className={`status-pill ${pillClass}`}>
        {statusInfo?.name || `Статус ${status}`}
      </span>
      <div className="status-bar">
        <div 
          className={`status-bar__fill ${barClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
});

OrderItemStatus.displayName = 'OrderItemStatus';

// Компонент для отдельного элемента заказа
const OrderItem = memo<{
  order: Order & { statusInfo?: any; progress: number };
  selectedId: number | null;
  onSelect: (id: number) => void;
}>(({ order, selectedId, onSelect }) => {
  const handleClick = useCallback(() => {
    onSelect(order.id);
  }, [order.id, onSelect]);

  const isActive = order.id === selectedId;

  return (
    <li
      className={`order-item order-list__item ${isActive ? 'active' : ''}`}
      onClick={handleClick}
    >
      <OrderItemHeader 
        orderNumber={order.number} 
        orderId={order.id} 
      />
      <OrderItemStatus
        statusInfo={order.statusInfo}
        status={order.status}
        progress={order.progress}
      />
    </li>
  );
});

OrderItem.displayName = 'OrderItem';

// Основной компонент списка заказов
export const OrderList = memo<OrderListProps>(({ 
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
        <OrderItem
          key={order.id}
          order={order}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      ))}
    </ul>
  );
});

OrderList.displayName = 'OrderList';
