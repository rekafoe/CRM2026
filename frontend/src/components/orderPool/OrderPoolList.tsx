import React from 'react';
import { Item, Order } from '../../types';
import { MoneyAmount } from '../ui';
import { getPoolPaymentInfo } from '../../utils/poolPaymentStatus';
import {
  formatWorkDayLabel,
  getEffectiveResponsibleUserId,
  getSourceLabel,
  groupOrdersByWorkDay,
} from './orderPoolUtils';
import { isPoolOrderStatusId, useOrderStatuses } from '../../hooks/useOrderStatuses';
import { OrderStamp } from '../order/OrderStamp';
import { PoolLoader } from './PoolLoader';

function clockLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function positionLine(item: Item): string {
  const named = String(item.params?.productName || '').trim();
  const described = String(item.params?.description || '').trim();
  const fallback = described && described !== 'Без описания' && described !== 'Описание товара'
    ? described
    : item.type || 'Позиция';
  const name = named || fallback;
  const qty = Number(item.quantity);
  return Number.isFinite(qty) && qty > 0 ? `${name} · ${qty} шт.` : name;
}

function compositionText(order: Order): string {
  const items = order.items ?? [];
  if (items.length === 0) return '—';
  const first = positionLine(items[0]);
  if (items.length === 1) return first;
  return `${first} · ещё ${items.length - 1}`;
}

const OrderRow = React.memo<{
  order: Order;
  isSelected: boolean;
  onSelect: (order: Order) => void;
  onTakeOrder?: (order: Order) => void;
  currentUserId: number;
  users: Array<{ id: number; name: string }>;
  getOrderDebt: (order: Order) => number;
  getOrderTotal: (order: Order) => number;
  onCopyPhone?: (phone: string) => void;
}>(({
  order,
  isSelected,
  onSelect,
  onTakeOrder,
  currentUserId,
  users,
  getOrderDebt,
  getOrderTotal,
  onCopyPhone,
}) => {
  const { statuses } = useOrderStatuses();
  const statusInfo = statuses.find((status) => status.id === Number(order.status));
  const payment = getPoolPaymentInfo(order);
  const debt = getOrderDebt(order);
  const responsibleId = getEffectiveResponsibleUserId(order);
  const isAssigned = responsibleId != null;
  const isCancelled = order.is_cancelled === 1;
  const canTake = !isCancelled && !isAssigned && isPoolOrderStatusId(Number(order.status));
  const createdAt = order.created_at ?? (order as { createdAt?: string }).createdAt;
  const responsibleName = responsibleId == null
    ? '—'
    : users.find((user) => user.id === responsibleId)?.name || 'назначен';
  const composition = compositionText(order);

  return (
    <tr
      className={[
        'pool-sheet__row',
        isSelected ? 'is-selected' : '',
        isCancelled ? 'is-cancelled' : '',
        responsibleId === currentUserId ? 'is-mine' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(order)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(order);
        }
      }}
      tabIndex={0}
      aria-selected={isSelected}
    >
      <td>
        <div className="pool-sheet__number">{order.number}</div>
        <div className="pool-sheet__meta">
          {order.source ? <span>{getSourceLabel(order.source)}</span> : null}
          <time dateTime={createdAt}>{clockLabel(createdAt)}</time>
        </div>
      </td>
      <td>
        <div className="pool-sheet__client">{order.customerName || 'Клиент не указан'}</div>
        {order.customerPhone ? (
          <button
            type="button"
            className="pool-sheet__phone"
            title="Скопировать телефон"
            onClick={(event) => {
              event.stopPropagation();
              onCopyPhone?.(order.customerPhone!);
            }}
          >
            {order.customerPhone}
          </button>
        ) : (
          <div className="pool-sheet__meta">—</div>
        )}
      </td>
      <td className="pool-sheet__composition" title={composition}>{composition}</td>
      <td>
        <OrderStamp
          status={statusInfo ?? { id: Number(order.status), name: '' }}
          statuses={statuses}
          onlineCancelled={isCancelled}
        />
        {payment.tone === 'pending' ? (
          <div className="pool-sheet__pay">{payment.badge}</div>
        ) : null}
      </td>
      <td className="pool-sheet__who">
        {responsibleName}
        {responsibleId === currentUserId ? <span className="pool-sheet__mine"> мой</span> : null}
      </td>
      <td className="pool-sheet__money"><MoneyAmount value={getOrderTotal(order)} /></td>
      <td className={debt > 0 ? 'pool-sheet__money is-due' : 'pool-sheet__money'}>
        <MoneyAmount value={debt} />
      </td>
      <td>
        {canTake && onTakeOrder ? (
          <button
            type="button"
            className="pool-sheet__take"
            title="Назначить себя ответственным"
            onClick={(event) => {
              event.stopPropagation();
              onTakeOrder(order);
            }}
          >
            Взять
          </button>
        ) : null}
      </td>
    </tr>
  );
});

OrderRow.displayName = 'OrderPoolRow';

interface OrderPoolListProps {
  orders: Order[];
  selectedOrderId: number | null | undefined;
  currentUserId: number;
  users?: Array<{ id: number; name: string }>;
  onSelect: (order: Order) => void;
  onTakeOrder?: (order: Order) => void;
  onCopyPhone?: (phone: string) => void;
  searchLoading: boolean;
  emptyMessage?: string;
  getOrderPrepayment: (order: Order) => number;
  getOrderDebt: (order: Order) => number;
  getOrderTotal: (order: Order) => number;
}

export const OrderPoolList: React.FC<OrderPoolListProps> = ({
  orders,
  selectedOrderId,
  currentUserId,
  users = [],
  onSelect,
  onTakeOrder,
  onCopyPhone,
  searchLoading,
  emptyMessage = 'Нет заказов по текущим фильтрам',
  getOrderDebt,
  getOrderTotal,
}) => {
  const groups = React.useMemo(() => groupOrdersByWorkDay(orders), [orders]);

  if (orders.length === 0) {
    return (
      <div className="order-list-empty">
        <p className="order-list-empty__title">{emptyMessage}</p>
        <p className="order-list-empty__hint">Смените фильтры или сбросьте поиск</p>
      </div>
    );
  }

  return (
    <div className={`order-list pool-sheet-wrap ${searchLoading ? 'order-list--searching' : ''}`}>
      {searchLoading && <PoolLoader label="Обновляем список" compact />}
      <table className="pool-sheet">
        <thead>
          <tr>
            <th>Номер</th>
            <th>Клиент</th>
            <th>Состав</th>
            <th>Статус</th>
            <th>Ответственный</th>
            <th>Сумма</th>
            <th>Долг</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const dayTotal = group.orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
            return (
              <React.Fragment key={group.key || 'none'}>
                <tr className="pool-sheet__day">
                  <td colSpan={8}>
                    <span>{formatWorkDayLabel(group.key)}</span>
                    <span className="pool-sheet__day-count">
                      {' · '}{group.orders.length}{' · '}<MoneyAmount value={dayTotal} />
                    </span>
                  </td>
                </tr>
                {group.orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderId === order.id}
                    currentUserId={currentUserId}
                    users={users}
                    onSelect={onSelect}
                    onTakeOrder={onTakeOrder}
                    onCopyPhone={onCopyPhone}
                    getOrderDebt={getOrderDebt}
                    getOrderTotal={getOrderTotal}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
