import React, { memo, useCallback, useMemo } from 'react';
import { Order } from '../../types';
import { parseNumberFlexible } from '../../utils/numberInput';
import { useOrderStatusClasses } from './hooks/useOrderStatusClasses';
import './styles/OrderList.css';

interface StatusInfo {
  id: number;
  name: string;
  color?: string;
  sort_order: number;
}

interface OrderListProps {
  orders: Order[];
  selectedId: number | null;
  statuses: StatusInfo[];
  onSelect: (id: number) => void;
}

// Компонент для статуса элемента заказа
const OrderItemStatus = memo<{
  statusInfo: StatusInfo | undefined;
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
  order: Order;
  isActive: boolean;
  statusInfo: StatusInfo | undefined;
  statusValue: number;
  progress: number;
  onSelect: (id: number) => void;
}>(({ order, isActive, statusInfo, statusValue, progress, onSelect }) => {
  const handleClick = useCallback(() => {
    onSelect(order.id);
  }, [order.id, onSelect]);

  // Возвращает имя клиента или null если не указан
  const customerLabel = useMemo(() => {
    if (order.customer) {
      const company =
        order.customer.company_name ||
        order.customer.legal_name ||
        order.customer.authorized_person;
      if (company) {
        return company;
      }
      const parts = [
        order.customer.last_name,
        order.customer.first_name,
        order.customer.middle_name,
      ].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(' ');
      }
    }
    return order.customerName || null;
  }, [order.customer, order.customerName]);

  const totalAmount = useMemo(() => {
    const stored = parseNumberFlexible(
      (order as any).totalAmount ?? (order as any).total_amount ?? 0
    );
    if (stored > 0) {
      return stored;
    }
    const items = Array.isArray(order.items) ? order.items : [];
    return items.reduce((sum, item) => {
      const price = parseNumberFlexible(item.price ?? 0);
      const qty = parseNumberFlexible(item.quantity ?? 1);
      return sum + price * qty;
    }, 0);
  }, [order]);

  return (
    <li
      className={`order-item order-list__item ${isActive ? 'active' : ''}`}
      onClick={handleClick}
    >
      <div className="order-item__header">
        <span className="order-item__number">{order.number}</span>
        <span className="order-item__amount">{totalAmount.toFixed(2)} BYN</span>
      </div>
      {customerLabel && (
        <div className="order-item__customer">
          {customerLabel}
        </div>
      )}
      <OrderItemStatus
        statusInfo={statusInfo}
        status={statusValue}
        progress={progress}
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

  // Дедупликация через Map (O(n) вместо O(n²))
  const uniqueOrders = useMemo(() => {
    const seen = new Map<number, Order>();
    for (const order of orders) {
      if (!seen.has(order.id)) {
        seen.set(order.id, order);
      }
    }
    return Array.from(seen.values());
  }, [orders]);

  // Предрасчёт статусов в Map для O(1) lookup
  const { statusById, maxSort } = useMemo(() => {
    const statusMap = new Map<number, StatusInfo>();
    let highest = 1;
    for (const status of statuses) {
      statusMap.set(status.id, status);
      if (status.sort_order > highest) {
        highest = status.sort_order;
      }
    }
    return { statusById: statusMap, maxSort: Math.max(1, highest) };
  }, [statuses]);

  // Мемоизированные метаданные заказов
  const orderMeta = useMemo(() => {
    return uniqueOrders.map((order) => {
      const statusValue = typeof order.status === 'number' ? order.status : 0;
      const statusInfo = statusById.get(statusValue);
      const progress = Math.max(
        0,
        Math.min(
          100,
          Math.round(((statusValue - 1) / Math.max(1, maxSort - 1)) * 100)
        )
      );

      return {
        order,
        statusInfo,
        statusValue,
        progress
      };
    });
  }, [uniqueOrders, statusById, maxSort]);

  return (
    <ul className="order-list">
      {orderMeta.map(({ order, statusInfo, statusValue, progress }) => (
        <OrderItem
          key={order.id}
          order={order}
          isActive={order.id === selectedId}
          statusInfo={statusInfo}
          statusValue={statusValue}
          progress={progress}
          onSelect={handleSelect}
        />
      ))}
    </ul>
  );
});

OrderList.displayName = 'OrderList';
