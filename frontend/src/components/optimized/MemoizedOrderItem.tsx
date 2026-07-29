import React, { memo, useCallback } from 'react';
import { OrderItem as OrderItemComponent } from '../OrderItem';

interface MemoizedOrderItemProps {
  item: any;
  orderId: number;
  order?: {
    number?: string;
    customerName?: string;
    customerPhone?: string;
    status?: number;
    created_at?: string;
    totalAmount?: number;
    items?: any[];
    priceType?: string;
  } | null;
  onUpdate: () => void;
  onEditParameters?: (orderId: number, item: any) => void;
  readOnly?: boolean;
  operatorsToday?: Array<{ id: number; name: string }>;
  assignableOnShift?: Array<{ id: number; name: string; department_id?: number | null }>;
  assignableAll?: Array<{ id: number; name: string; department_id?: number | null }>;
  onExecutorChange?: (orderId: number, itemId: number, executor_user_id: number | null) => void;
}

export const MemoizedOrderItem = memo<MemoizedOrderItemProps>(({
  item,
  orderId,
  order,
  onUpdate,
  onEditParameters,
  readOnly,
  operatorsToday = [],
  assignableOnShift,
  assignableAll,
  onExecutorChange,
}) => {
  const handleUpdate = useCallback(() => {
    onUpdate();
  }, [onUpdate]);

  return (
    <OrderItemComponent 
      key={item.id} 
      item={item} 
      orderId={orderId}
      order={order}
      onUpdate={handleUpdate} 
      onEditParameters={onEditParameters}
      readOnly={readOnly}
      operatorsToday={operatorsToday}
      assignableOnShift={assignableOnShift}
      assignableAll={assignableAll}
      onExecutorChange={onExecutorChange}
    />
  );
});

MemoizedOrderItem.displayName = 'MemoizedOrderItem';

