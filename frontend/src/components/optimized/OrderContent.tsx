import React from 'react';
import { Order, Item } from '../../types';
import { MemoizedOrderItem } from './MemoizedOrderItem';

interface OrderContentProps {
  order: Order;
  onLoadOrders: () => void;
  onEditOrderItem?: (orderId: number, item: Item) => void;
  /** В режиме пула заказов: только просмотр, без редактирования/удаления/принтера */
  readOnly?: boolean;
  /** Операторы за сегодня (для выбора исполнителя) */
  operatorsToday?: Array<{ id: number; name: string }>;
  /** Обновить исполнителя позиции */
  onExecutorChange?: (orderId: number, itemId: number, executor_user_id: number | null) => void;
}

export const OrderContent: React.FC<OrderContentProps> = ({
  order,
  onLoadOrders,
  onEditOrderItem,
  readOnly,
  operatorsToday = [],
  onExecutorChange,
}) => {
  const items = order.items ?? [];
  return (
    <div className="detail-body">
      {items.length === 0 && (
        <div className="item">Пока нет позиций</div>
      )}

      {items.map((item) => (
        <MemoizedOrderItem
          key={item.id}
          item={item}
          orderId={order.id}
          order={{
            ...order,
            priceType: (order as any).priceType ?? items[0]?.params?.priceType ?? (items[0]?.params as any)?.price_type,
          }}
          onUpdate={onLoadOrders}
          onEditParameters={onEditOrderItem}
          readOnly={readOnly}
          operatorsToday={operatorsToday}
          onExecutorChange={onExecutorChange}
        />
      ))}
    </div>
  );
};
