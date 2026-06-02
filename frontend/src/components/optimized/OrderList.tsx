import React, { memo, useCallback, useMemo } from 'react';
import { Order } from '../../types';
import { parseNumberFlexible } from '../../utils/numberInput';
import { getOrderAmounts } from '../../utils/orderTotal';
import { MoneyAmount } from '../ui';
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
  showIssuedByMe?: boolean;
  issuedByMe?: boolean | number;
}>(({ order, isActive, statusInfo, statusValue, progress, onSelect, showDebt, debt, showIssuedByMe, issuedByMe }) => {
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
    const fromApi = (order as { totalAmount?: number }).totalAmount;
    if (typeof fromApi === 'number' && Number.isFinite(fromApi)) {
      return fromApi;
    }
    return getOrderAmounts(order).total;
  }, [order]);

  return (
    <li
      className={`order-item order-list__item ${isActive ? 'active' : ''}`}
      onClick={handleClick}
    >
      <div className="order-item__header">
        <span className="order-item__number">{order.number}</span>
        <span className="order-item__amount"><MoneyAmount value={totalAmount} /></span>
      </div>
      {customerLabel && (
        <div className="order-item__customer">
          {customerLabel}
        </div>
      )}
      {showDebt && debt != null && debt > 0 && (
        <div className="order-item__debt" style={{ fontSize: 11, color: '#c62828', marginTop: 2 }}>
          Долг: <MoneyAmount value={debt} />
        </div>
      )}
      {showIssuedByMe && (issuedByMe === true || issuedByMe === 1) && (
        <div className="order-item__issued-by-me" style={{ fontSize: 11, color: '#2e7d32', marginTop: 2 }}>
          Выдали вы
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
    const list = Array.isArray(statuses) ? statuses : [];
    for (const status of list) {
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
      const debt =
        typeof order.debt === 'number' && Number.isFinite(order.debt)
          ? order.debt
          : 0;
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
  const showIssuedByMe = ordersListTab === 'issued';

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
          showIssuedByMe={showIssuedByMe}
          issuedByMe={(order as any).issued_by_me}
        />
      ))}
    </ul>
  );
});

OrderList.displayName = 'OrderList';
