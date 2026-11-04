import React from 'react';
import { Order } from '../../types';
import { OrderStamp } from '../order/OrderStamp';

interface OrderHeaderProps {
  order: Order;
  onShowFilesModal: () => void;
  onShowPrepaymentModal: () => void;
}

export const OrderHeader: React.FC<OrderHeaderProps> = ({
  order,
  onShowFilesModal,
  onShowPrepaymentModal,
}) => {
  const showCancelled = Number(order.is_cancelled || 0) === 1;
  return (
    <div className="detail-header-content">
      <div className="detail-header-title">
        <h2>{order.number}</h2>
        {showCancelled && (
          <OrderStamp
            status={{ id: Number(order.status) || 0, name: 'Отменён', code: 'cancelled' }}
            onlineCancelled
          />
        )}
        <div className="detail-header-actions">
          <button 
            onClick={onShowFilesModal}
            className="action-btn"
            title="Файлы макетов"
          >
             Файлы
          </button>
          <button 
            onClick={onShowPrepaymentModal}
            className="action-btn action-btn--green"
            title="Предоплата"
          >
             Предоплата
          </button>
        </div>
      </div>
    </div>
  );
};
