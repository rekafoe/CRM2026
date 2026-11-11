import React from 'react';
import { Order } from '../../types';
import { MoneyAmount } from '../ui';
import { getPoolPaymentInfo } from '../../utils/poolPaymentStatus';
import {
  formatWorkDayLabel,
  getEffectiveResponsibleUserId,
  getOrderReadyLabel,
  getSourceStamp,
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

function orderCountLabel(count: number): string {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return 'заказ';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'заказа';
  return 'заказов';
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
  const readiness = getOrderReadyLabel(order);
  const readyText = [
    readiness.readyAtLabel !== '—' ? readiness.readyAtLabel : '',
    readiness.label,
  ].filter(Boolean).join(' · ');
  const isCompleted =
    statusInfo?.code === 'completed' ||
    statusInfo?.name === 'Завершён' ||
    Number(order.status) === 7;

  return (
    <tr
      className={[
        'pool-sheet__row',
        isSelected ? 'is-selected' : '',
        isCancelled ? 'is-cancelled' : '',
        isCompleted ? 'is-completed' : '',
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
          {order.source ? <span>{getSourceStamp(order.source)}</span> : null}
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
      <td>
        <div className="pool-sheet__ready">
          <OrderStamp
            status={statusInfo ?? { id: Number(order.status), name: '' }}
            statuses={statuses}
            onlineCancelled={isCancelled}
          />
          {readyText ? (
            <div className={['pool-sheet__ready-when', readiness.isHourSla ? 'is-hour-sla' : ''].filter(Boolean).join(' ')}>
              {readyText}
            </div>
          ) : null}
          {payment.tone === 'pending' ? (
            <div className="pool-sheet__pay">{payment.badge}</div>
          ) : null}
        </div>
      </td>
      <td className="pool-sheet__who">
        {isCancelled ? (
          '—'
        ) : isAssigned ? (
          <>
            {responsibleName}
            {responsibleId === currentUserId ? <span className="pool-sheet__mine"> мой</span> : null}
          </>
        ) : (
          <span className="pool-sheet__pool">в пуле</span>
        )}
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
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col className="pool-sheet__col-money" />
          <col className="pool-sheet__col-money" />
          <col className="pool-sheet__col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Клиент</th>
            <th>Готовность</th>
            <th>Ответственный</th>
            <th>Сумма</th>
            <th>Долг</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const dayTotal = group.orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
            return (
              <React.Fragment key={group.key || 'none'}>
                <tr className="pool-sheet__day">
                  <td colSpan={7}>
                    <span>{formatWorkDayLabel(group.key)}</span>
                    <span className="pool-sheet__day-count">
                      {' '}{group.orders.length} {orderCountLabel(group.orders.length)} на <MoneyAmount value={dayTotal} />
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
