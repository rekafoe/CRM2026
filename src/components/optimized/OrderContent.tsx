import React from 'react';
import { Order, Item } from '../../types';
import { MemoizedOrderItem } from './MemoizedOrderItem';

interface OrderContentProps {
  order: Order;
  onLoadOrders: () => void;
  onEditOrderItem?: (orderId: number, item: Item) => void;
}

export const OrderContent: React.FC<OrderContentProps> = ({
  order,
  onLoadOrders,
  onEditOrderItem,
}) => {
  return (
    <div className="detail-body">
      {order.items.length === 0 && (
        <div className="item">Пока нет позиций</div>
      )}

      {order.items.map((item) => (
        <MemoizedOrderItem
          key={item.id}
          item={item}
          orderId={order.id}
          order={order}
          onUpdate={onLoadOrders}
          onEditParameters={onEditOrderItem}
        />
      ))}
    </div>
  );
};
