import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Order } from '../../types/shared';

interface VirtualizedOrderListProps {
  orders: Order[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  height?: number;
  itemHeight?: number;
}

interface VirtualizedItemProps {
  order: Order;
  isSelected: boolean;
  onSelect: (id: number) => void;
  style: React.CSSProperties;
}

// Мемоизированный компонент для элемента списка
const VirtualizedOrderItem = React.memo<VirtualizedItemProps>(({ 
  order, 
  isSelected, 
  onSelect, 
  style 
}) => {
  const handleClick = useCallback(() => {
    onSelect(order.id);
  }, [order.id, onSelect]);

  const getStatusColor = useCallback((status: string) => {
    const statusColors: Record<string, string> = {
      'pending': '#ffc107',
      'in_progress': '#17a2b8',
      'completed': '#28a745',
      'cancelled': '#dc3545',
      'on_hold': '#6c757d'
    };
    return statusColors[status] || '#6c757d';
  }, []);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }, []);

  return (
    <div
      style={style}
      className={`virtualized-order-item ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      <div className="order-item-content">
        <div className="order-main-info">
          <div className="order-customer">
            <strong>{order.customer_name}</strong>
            <span className="order-phone">{order.customer_phone}</span>
          </div>
          <div className="order-status">
            <span 
              className="status-badge"
              style={{ backgroundColor: getStatusColor(order.status) }}
            >
              {order.status}
            </span>
          </div>
        </div>
        
        <div className="order-details">
          <div className="order-meta">
            <span className="order-date">
              📅 {formatDate(order.created_at)}
            </span>
            <span className="order-items">
              📦 {order.items?.length || 0} позиций
            </span>
            {order.total_amount && (
              <span className="order-total">
                💰 {order.total_amount.toFixed(2)} BYN
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

VirtualizedOrderItem.displayName = 'VirtualizedOrderItem';

export const VirtualizedOrderList: React.FC<VirtualizedOrderListProps> = ({
  orders,
  selectedId,
  onSelect,
  height = 400,
  itemHeight = 80
}) => {
  const [containerHeight, setContainerHeight] = useState(height);
  const [scrollTop, setScrollTop] = useState(0);

  // Вычисляем видимые элементы
  const visibleItems = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      orders.length
    );

    return orders.slice(startIndex, endIndex).map((order, index) => ({
      order,
      index: startIndex + index,
      isSelected: order.id === selectedId
    }));
  }, [orders, selectedId, scrollTop, containerHeight, itemHeight]);

  // Обработчик скролла
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Обработчик изменения размера
  useEffect(() => {
    const handleResize = () => {
      setContainerHeight(height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Общая высота списка
  const totalHeight = orders.length * itemHeight;

  return (
    <div className="virtualized-order-list">
      <div
        className="virtualized-container"
        style={{
          height: containerHeight,
          overflowY: 'auto',
          position: 'relative'
        }}
        onScroll={handleScroll}
      >
        {/* Виртуальный контейнер */}
        <div
          style={{
            height: totalHeight,
            position: 'relative'
          }}
        >
          {/* Видимые элементы */}
          {visibleItems.map(({ order, index, isSelected }) => (
            <VirtualizedOrderItem
              key={order.id}
              order={order}
              isSelected={isSelected}
              onSelect={onSelect}
              style={{
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight
              }}
            />
          ))}
        </div>
      </div>
      
      {/* Индикатор производительности */}
      <div className="virtualization-info">
        <small>
          Показано {visibleItems.length} из {orders.length} заказов
          {orders.length > 100 && ' (виртуализация активна)'}
        </small>
      </div>
    </div>
  );
};
