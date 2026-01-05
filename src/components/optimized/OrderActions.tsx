import React from 'react';
import { Order } from '../../types';

interface OrderActionsProps {
  order: Order;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  onUpdateOrderStatus: (orderId: number, newStatus: number) => Promise<void>;
  onShowProductSelector: () => void;
}

export const OrderActions: React.FC<OrderActionsProps> = ({
  order,
  statuses,
  onUpdateOrderStatus,
  onShowProductSelector,
}) => {
  return (
    <div className="detail-actions">
      <select
        value={String(order.status)}
        onChange={async (e) => {
          const newStatus = Number(e.target.value);
          await onUpdateOrderStatus(order.id, newStatus);
        }}
      >
        {statuses.map((s) => (
          <option key={s.id} value={s.sort_order}>{s.name}</option>
        ))}
      </select>
      <button onClick={onShowProductSelector}>+ Калькулятор</button>
    </div>
  );
};
