import React, { memo, useCallback, useMemo } from 'react';
import { Order } from '../../types';
import { parseNumberFlexible } from '../../utils/numberInput';
import { useOrderStatusClasses } from './hooks/useOrderStatusClasses';
import type { OrdersListTab } from './hooks/useOptimizedAppData';
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
  ordersListTab?: OrdersListTab;
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
  showDebt?: boolean;
  debt?: number;
}>(({ order, isActive, statusInfo, statusValue, progress, onSelect, showDebt, debt }) => {
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
      {showDebt && debt != null && debt > 0 && (
        <div className="order-item__debt" style={{ fontSize: 11, color: '#c62828', marginTop: 2 }}>
          Долг: {debt.toFixed(2)} BYN
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
  onSelect,
  ordersListTab = 'orders'
}) => {
  const handleSelect = useCallback((id: number) => {
    onSelect(id);
  }, [onSelect]);

  const uniqueOrders = useMemo(() => {
    const seen = new Map<number, Order>();
    for (const order of orders) {
      if (!seen.has(order.id)) seen.set(order.id, order);
    }
    return Array.from(seen.values());
  }, [orders]);

  const { statusById, maxSort } = useMemo(() => {
    const statusMap = new Map<number, StatusInfo>();
    let highest = 1;
    for (const status of statuses) {
      statusMap.set(status.id, status);
      if (status.sort_order > highest) highest = status.sort_order;
    }
    return { statusById: statusMap, maxSort: Math.max(1, highest) };
  }, [statuses]);

  const orderMeta = useMemo(() => {
    return uniqueOrders.map((order) => {
      const statusValue = typeof order.status === 'number' ? order.status : 0;
      const statusInfo = statusById.get(statusValue);
      const progress = Math.max(
        0,
        Math.min(100, Math.round(((statusValue - 1) / Math.max(1, maxSort - 1)) * 100))
      );
      const items = Array.isArray(order.items) ? order.items : [];
      const subtotal = items.reduce(
        (s, i) => s + parseNumberFlexible(i.price ?? 0) * parseNumberFlexible(i.quantity ?? 1),
        0
      );
      const discount = parseNumberFlexible((order as any).discount_percent ?? 0);
      const total = Math.round((1 - discount / 100) * subtotal * 100) / 100;
      const prepay = parseNumberFlexible((order as any).prepaymentAmount ?? 0);
      const debt = Math.max(0, Math.round((total - prepay) * 100) / 100);
      return {
        order,
        statusInfo,
        statusValue,
        progress,
        debt
      };
    });
  }, [uniqueOrders, statusById, maxSort]);

  const showDebt = ordersListTab === 'orders';

  return (
    <ul className="order-list">
      {orderMeta.map(({ order, statusInfo, statusValue, progress, debt }) => (
        <OrderItem
          key={order.id}
          order={order}
          isActive={order.id === selectedId}
          statusInfo={statusInfo}
          statusValue={statusValue}
          progress={progress}
          onSelect={handleSelect}
          showDebt={showDebt}
          debt={debt}
        />
      ))}
    </ul>
  );
});

OrderList.displayName = 'OrderList';
