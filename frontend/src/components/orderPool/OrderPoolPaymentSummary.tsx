import React from 'react';
import { Order } from '../../types';
import { MoneyAmount } from '../ui';
import { Button } from '../common/Button';
import { getPoolPaymentInfo } from '../../utils/poolPaymentStatus';

interface OrderPoolPaymentSummaryProps {
  order: Order;
  prepay: number;
  debt: number;
  onCopyPaymentUrl: () => void;
}

export const OrderPoolPaymentSummary: React.FC<OrderPoolPaymentSummaryProps> = ({
  order,
  prepay,
  debt,
  onCopyPaymentUrl,
}) => {
  const payment = getPoolPaymentInfo(order);

  return (
    <div className="order-detail-payment">
      <div className="order-detail-payment__chips">
        <div className="order-detail-payment__chip">
          <span className="order-detail-payment__label">Оплата</span>
          <span className={`order-detail-payment__badge order-detail-payment__badge--${payment.tone}`}>
            {payment.badge}
          </span>
        </div>
        <div className="order-detail-payment__chip">
          <span className="order-detail-payment__label">Предоплата</span>
          <span className="order-detail-payment__value">
            <MoneyAmount value={prepay} />
            <small>{payment.prepayLabel}</small>
          </span>
        </div>
        <div className="order-detail-payment__chip">
          <span className="order-detail-payment__label">Долг</span>
          <span className={`order-detail-payment__debt ${debt > 0 ? 'is-due' : 'is-paid'}`}>
            <MoneyAmount value={debt} />
          </span>
        </div>
      </div>
      {order.paymentUrl && (
        <div className="order-detail-payment__url">
          <a href={order.paymentUrl} target="_blank" rel="noreferrer">
            BePaid
          </a>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="order-detail-payment__copy"
            onClick={onCopyPaymentUrl}
          >
            Копировать
          </Button>
        </div>
      )}
    </div>
  );
};
