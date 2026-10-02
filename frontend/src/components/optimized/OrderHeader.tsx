import React from 'react';
import { Order } from '../../types';

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
  const showCancelled = Number(order.status) === 0 && Number((order as any).is_cancelled || 0) === 1;
  return (
    <div className="detail-header-content">
      <div className="detail-header-title">
        <h2>{order.number}</h2>
        {showCancelled && (
          <span style={{
            marginLeft: '8px',
            padding: '2px 6px',
            borderRadius: '6px',
            background: '#ef5350',
            color: 'white',
            fontSize: '12px',
            fontWeight: 600
          }}>Отменён (online)</span>
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
