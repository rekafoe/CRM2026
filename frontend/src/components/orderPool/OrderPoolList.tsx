import React from 'react';
import { Order } from '../../types';
import { MoneyAmount } from '../ui';
import { getPoolPaymentInfo } from '../../utils/poolPaymentStatus';
import {
  formatPoolDateTime,
  formatPoolDateTimeFull,
  getEffectiveResponsibleUserId,
  getOrderReadyLabel,
  getPoolFulfillmentChip,
  getSourceLabel,
} from './orderPoolUtils';

const OrderCard = React.memo<{
  order: Order;
  isSelected: boolean;
  onSelect: (order: Order) => void;
  onTakeOrder?: (order: Order) => void;
  currentUserId: number;
  getOrderPrepayment: (order: Order) => number;
  getOrderDebt: (order: Order) => number;
  getOrderTotal: (order: Order) => number;
  onCopyPhone?: (phone: string) => void;
}>(({
  order,
  isSelected,
  onSelect,
  onTakeOrder,
  currentUserId,
  getOrderPrepayment,
  getOrderDebt,
  getOrderTotal,
  onCopyPhone,
}) => {
  const payment = getPoolPaymentInfo(order);
  const debt = getOrderDebt(order);
  const prepay = getOrderPrepayment(order);
  const responsibleId = getEffectiveResponsibleUserId(order);
  const isAssigned = responsibleId != null;
  const isMine = responsibleId === currentUserId;
  const isCancelled = order.is_cancelled === 1;
  const canTake =
    !isCancelled
    && (Number(order.status) === 0 || Number(order.status) === 1)
    && responsibleId !== currentUserId;
  const readiness = getOrderReadyLabel(order);
  const createdAt = order.created_at ?? (order as { createdAt?: string }).createdAt;
  const fulfillmentChip = getPoolFulfillmentChip(order);

  return (
    <article
      role="button"
      tabIndex={0}
      className={[
        'order-pool-card',
        isSelected ? 'is-selected' : '',
        isAssigned ? 'is-assigned' : 'is-open',
        isCancelled ? 'is-cancelled' : '',
        isMine ? 'is-mine' : '',
        payment.tone === 'pending' ? 'has-awaiting-pay' : '',
        debt > 0 ? 'has-debt' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(order)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(order);
        }
      }}
    >
      <div className="order-pool-card__accent" aria-hidden="true" />
      <div className="order-pool-card__main">
        <div className="order-pool-card__top">
          <div className="order-pool-card__id">
            <span className="order-pool-card__number">{order.number}</span>
            {order.source ? (
              <span className="order-pool-card__source">{getSourceLabel(order.source)}</span>
            ) : null}
            {fulfillmentChip ? (
              <span className="order-pool-card__fulfillment" title={fulfillmentChip.title}>
                {fulfillmentChip.label}
              </span>
            ) : null}
            {isCancelled ? <span className="order-pool-card__tag is-error">Отменён</span> : null}
            {!isAssigned && !isCancelled ? (
              <span className="order-pool-card__tag is-open">В пуле</span>
            ) : null}
            {isMine ? <span className="order-pool-card__tag is-mine">Мой</span> : null}
          </div>
          <div className="order-pool-card__dates">
            <time className="order-pool-card__date" dateTime={createdAt} title="Дата оформления">
              {formatPoolDateTime(createdAt)}
            </time>
            <span className="order-pool-card__ready" title={`Готовность: ${formatPoolDateTimeFull(readiness.readyAt?.toISOString())}`}>
              до {readiness.readyAtLabel}
            </span>
          </div>
        </div>

        <div className="order-pool-card__client">
          <span className="order-pool-card__name" title={order.customerName || undefined}>
            {order.customerName || 'Клиент не указан'}
          </span>
          {order.customerPhone ? (
            <button
              type="button"
              className="order-pool-card__phone"
              title="Скопировать телефон"
              onClick={(e) => {
                e.stopPropagation();
                onCopyPhone?.(order.customerPhone!);
              }}
            >
              {order.customerPhone}
            </button>
          ) : (
            <span className="order-pool-card__phone is-muted">—</span>
          )}
        </div>

        <div className="order-pool-card__footer">
          <div className={`order-pool-card__pay order-pool-card__pay--${payment.tone}`}>
            <span>{payment.badge}</span>
            {(payment.showPrepayAmount || prepay > 0) && (
              <small>
                <MoneyAmount value={prepay} />
              </small>
            )}
          </div>
          <div className="order-pool-card__money">
            <span className={`order-pool-card__debt ${debt > 0 ? 'is-due' : ''}`}>
              долг <MoneyAmount value={debt} />
            </span>
            <span className="order-pool-card__total">
              <MoneyAmount value={getOrderTotal(order)} />
            </span>
          </div>
        </div>
      </div>

      {canTake && onTakeOrder ? (
        <button
          type="button"
          className="order-pool-card__take"
          title="Назначить себя ответственным"
          onClick={(e) => {
            e.stopPropagation();
            onTakeOrder(order);
          }}
        >
          Взять
        </button>
      ) : null}
    </article>
  );
});

OrderCard.displayName = 'OrderPoolCard';

interface OrderPoolListProps {
  orders: Order[];
  selectedOrderId: number | null | undefined;
  currentUserId: number;
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
  onSelect,
  onTakeOrder,
  onCopyPhone,
  searchLoading,
  emptyMessage = 'Нет заказов по текущим фильтрам',
  getOrderPrepayment,
  getOrderDebt,
  getOrderTotal,
}) => {
  if (orders.length === 0) {
    return (
      <div className="order-list-empty">
        <p className="order-list-empty__title">{emptyMessage}</p>
        <p className="order-list-empty__hint">Смените фильтры или сбросьте поиск</p>
      </div>
    );
  }

  return (
    <div className={`order-list order-list--cards ${searchLoading ? 'order-list--searching' : ''}`}>
      {searchLoading && (
        <div className="order-pool-search-hint" role="status">
          <span className="order-pool-search-hint__pulse" />
          Обновляем результаты
        </div>
      )}
      <div className="order-pool-card-list" role="list">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isSelected={selectedOrderId === order.id}
            currentUserId={currentUserId}
            onSelect={onSelect}
            onTakeOrder={onTakeOrder}
            onCopyPhone={onCopyPhone}
            getOrderPrepayment={getOrderPrepayment}
            getOrderDebt={getOrderDebt}
            getOrderTotal={getOrderTotal}
          />
        ))}
      </div>
    </div>
  );
};
