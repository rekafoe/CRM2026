import React, { useCallback, useState, useMemo } from 'react';
import { Order } from '../../types';
import { updateOrderItem } from '../../api';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY, getDefaultReadyDate } from './orderItemUtils';

interface OrderDatesProps {
  order: Order;
  onUpdate: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const OrderDates: React.FC<OrderDatesProps> = React.memo(({
  order,
  onUpdate,
  onSuccess,
  onError,
}) => {
  const [editingCreatedDate, setEditingCreatedDate] = useState(false);
  const [editingReadyDate, setEditingReadyDate] = useState(false);

  // Получаем дату создания заказа
  const orderCreatedDate = useMemo(() => {
    if (order.created_at) {
      const date = new Date(order.created_at);
      return date.toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  }, [order.created_at]);

  // Получаем максимальную дату готовности из всех позиций
  const orderReadyDate = useMemo(() => {
    const readyDates = order.items
      .map(item => (item.params as any)?.readyDate)
      .filter(Boolean)
      .map(dateStr => new Date(dateStr).getTime())
      .filter(time => !isNaN(time));

    if (readyDates.length > 0) {
      const maxDate = new Date(Math.max(...readyDates));
      const year = maxDate.getFullYear();
      const month = String(maxDate.getMonth() + 1).padStart(2, '0');
      const day = String(maxDate.getDate()).padStart(2, '0');
      const hours = String(maxDate.getHours()).padStart(2, '0');
      const minutes = String(maxDate.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Если нет дат готовности в позициях, используем дату создания + 1 час
    return getDefaultReadyDate(orderCreatedDate);
  }, [order.items, orderCreatedDate]);

  const [createdDate, setCreatedDate] = useState<string>(orderCreatedDate);
  const [readyDate, setReadyDate] = useState<string>(orderReadyDate);

  // Синхронизируем с order при изменении
  React.useEffect(() => {
    setCreatedDate(orderCreatedDate);
    setReadyDate(orderReadyDate);
  }, [orderCreatedDate, orderReadyDate]);

  const handleCreatedDateChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCreatedDate = e.target.value;
    setCreatedDate(newCreatedDate);
    // Автоматически обновляем дату готовности (+1 час)
    const newReadyDate = getDefaultReadyDate(newCreatedDate);
    setReadyDate(newReadyDate);
    setEditingCreatedDate(false);

    // Обновляем дату создания заказа во всех позициях
    try {
      // Обновляем дату создания во всех позициях заказа
      const updatePromises = order.items.map(item => {
        const updatedParams = {
          ...item.params,
          createdDate: newCreatedDate,
          readyDate: newReadyDate
        };
        return updateOrderItem(order.id, item.id, {
          params: updatedParams
        } as any);
      });

      await Promise.all(updatePromises);
      onUpdate();
      onSuccess('Дата создания заказа сохранена');
    } catch (error) {
      onError('Ошибка при сохранении даты создания');
    }
  }, [order.id, onUpdate, onSuccess, onError]);

  const handleReadyDateChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newReadyDate = e.target.value;
    setReadyDate(newReadyDate);
    setEditingReadyDate(false);

    // Обновляем дату готовности во всех позициях заказа
    try {
      const updatePromises = order.items.map(item => {
        const updatedParams = {
          ...item.params,
          readyDate: newReadyDate
        };
        return updateOrderItem(order.id, item.id, {
          params: updatedParams
        } as any);
      });

      await Promise.all(updatePromises);
      onUpdate();
      onSuccess('Дата готовности заказа сохранена');
    } catch (error) {
      onError('Ошибка при сохранении даты готовности');
    }
  }, [order.items, onUpdate, onSuccess, onError]);

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label style={{ fontSize: 12, color: '#666', marginRight: 4 }}>Создан:</label>
        {editingCreatedDate ? (
          <input
            type="date"
            value={createdDate}
            onChange={handleCreatedDateChange}
            onBlur={() => setEditingCreatedDate(false)}
            autoFocus
            style={{ 
              fontSize: 12, 
              padding: '4px 8px', 
              border: '1px solid #ddd', 
              borderRadius: 4,
              maxWidth: 120
            }}
          />
        ) : (
          <span 
            style={{ fontSize: 12, color: '#333', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setEditingCreatedDate(true)}
            title="Кликните для редактирования"
          >
            {formatDateDDMMYYYY(createdDate)}
          </span>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label style={{ fontSize: 12, color: '#666', marginRight: 4 }}>Готов:</label>
        {editingReadyDate ? (
          <input
            type="datetime-local"
            value={readyDate}
            onChange={handleReadyDateChange}
            onBlur={() => setEditingReadyDate(false)}
            autoFocus
            style={{ 
              fontSize: 12, 
              padding: '4px 8px', 
              border: '1px solid #ddd', 
              borderRadius: 4,
              maxWidth: 180
            }}
          />
        ) : (
          <span 
            style={{ fontSize: 12, color: '#333', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setEditingReadyDate(true)}
            title="Кликните для редактирования"
          >
            {formatDateTimeDDMMYYYY(readyDate)}
          </span>
        )}
      </div>
    </div>
  );
});

OrderDates.displayName = 'OrderDates';

