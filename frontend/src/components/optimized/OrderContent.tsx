import React, { useEffect, useState } from 'react';
import { Order, Item } from '../../types';
import { MemoizedOrderItem } from './MemoizedOrderItem';
import { useFreshOrderItem } from '../order/useFreshOrderItem';

interface OrderContentProps {
  order: Order;
  onLoadOrders: () => void;
  onEditOrderItem?: (orderId: number, item: Item) => void;
  /** В режиме пула заказов: только просмотр, без редактирования/удаления/принтера */
  readOnly?: boolean;
  /** Операторы за сегодня (для выбора исполнителя) */
  operatorsToday?: Array<{ id: number; name: string }>;
  assignableOnShift?: Array<{ id: number; name: string; department_id?: number | null }>;
  assignableAll?: Array<{ id: number; name: string; department_id?: number | null }>;
  /** Обновить исполнителя позиции */
  onExecutorChange?: (orderId: number, itemId: number, executor_user_id: number | null) => void;
}

export const OrderContent: React.FC<OrderContentProps> = ({
  order,
  onLoadOrders,
  onEditOrderItem,
  readOnly,
  operatorsToday = [],
  assignableOnShift,
  assignableAll,
  onExecutorChange,
}) => {
  const items = order.items ?? [];
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const freshItemId = useFreshOrderItem(order.id, items.map((item) => item.id));

  useEffect(() => {
    setExpandedItemId(null);
  }, [order.id]);

  return (
    <div className="detail-body">
      <div className="order-positions">
        <div className="order-positions__head">
          <span>Позиция</span>
          <span>Суть</span>
          <span>Кол-во</span>
          <span>Сумма</span>
          <span>Исполнитель</span>
        </div>
        {items.length === 0 ? (
          <div className="order-positions__empty">Пока нет позиций</div>
        ) : (
          items.map((item, index) => (
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
              assignableOnShift={assignableOnShift}
              assignableAll={assignableAll}
              onExecutorChange={onExecutorChange}
              layout="table"
              rowIndex={index + 1}
              expanded={expandedItemId === item.id}
              onToggleExpanded={() =>
                setExpandedItemId((current) => (current === item.id ? null : item.id))
              }
              fresh={freshItemId === item.id}
            />
          ))
        )}
      </div>
    </div>
  );
};
