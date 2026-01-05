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
  } | null;
  onUpdate: () => void;
  onEditParameters?: (orderId: number, item: any) => void;
}

export const MemoizedOrderItem = memo<MemoizedOrderItemProps>(({ item, orderId, order, onUpdate, onEditParameters }) => {
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
    />
  );
});

MemoizedOrderItem.displayName = 'MemoizedOrderItem';

