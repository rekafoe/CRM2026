import React, { useCallback } from 'react';
import { updateOrderItem } from '../../api';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY, getDefaultReadyDate } from './orderItemUtils';

interface OrderItemDatesProps {
  orderId: number;
  itemId: number;
  itemParams: any;
  createdDate: string;
  readyDate: string;
  editingCreatedDate: boolean;
  editingReadyDate: boolean;
  onCreatedDateChange: (date: string) => void;
  onReadyDateChange: (date: string) => void;
  onEditingCreatedDateChange: (editing: boolean) => void;
  onEditingReadyDateChange: (editing: boolean) => void;
  onUpdate: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const OrderItemDates: React.FC<OrderItemDatesProps> = React.memo(({
  orderId,
  itemId,
  itemParams,
  createdDate,
  readyDate,
  editingCreatedDate,
  editingReadyDate,
  onCreatedDateChange,
  onReadyDateChange,
  onEditingCreatedDateChange,
  onEditingReadyDateChange,
  onUpdate,
  onSuccess,
  onError,
}) => {
  const handleCreatedDateChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCreatedDate = e.target.value;
    onCreatedDateChange(newCreatedDate);
    // Автоматически обновляем дату готовности (+1 час)
    const newReadyDate = getDefaultReadyDate(newCreatedDate);
    onReadyDateChange(newReadyDate);
    onEditingCreatedDateChange(false);
    // Сохраняем сразу
    try {
      await updateOrderItem(orderId, itemId, {
        params: {
          ...itemParams,
          createdDate: newCreatedDate,
          readyDate: newReadyDate
        }
      } as any);
      onUpdate();
      onSuccess('Дата сохранена');
    } catch (error) {
      onError('Ошибка при сохранении даты');
    }
  }, [orderId, itemId, itemParams, onCreatedDateChange, onReadyDateChange, onEditingCreatedDateChange, onUpdate, onSuccess, onError]);

  const handleReadyDateChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newReadyDate = e.target.value;
    onReadyDateChange(newReadyDate);
    onEditingReadyDateChange(false);
    // Сохраняем сразу
    try {
      await updateOrderItem(orderId, itemId, {
        params: {
          ...itemParams,
          readyDate: newReadyDate
        }
      } as any);
      onUpdate();
      onSuccess('Дата готовности сохранена');
    } catch (error) {
      onError('Ошибка при сохранении даты готовности');
    }
  }, [orderId, itemId, itemParams, onReadyDateChange, onEditingReadyDateChange, onUpdate, onSuccess, onError]);

  return (
    <>
      <span className="separator">|</span>
      <span className="detail-item" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#666', marginRight: 2 }}>Создан:</label>
        {editingCreatedDate ? (
          <input
            type="date"
            value={createdDate}
            onChange={handleCreatedDateChange}
            onBlur={() => onEditingCreatedDateChange(false)}
            autoFocus
            style={{ 
              fontSize: 11, 
              padding: '2px 4px', 
              border: '1px solid #ddd', 
              borderRadius: 3,
              maxWidth: 110
            }}
          />
        ) : (
          <span 
            style={{ fontSize: 11, color: '#333', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => onEditingCreatedDateChange(true)}
            title="Кликните для редактирования"
          >
            {formatDateDDMMYYYY(createdDate)}
          </span>
        )}
      </span>
      
      <span className="separator">|</span>
      <span className="detail-item" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#666', marginRight: 2 }}>Готов:</label>
        {editingReadyDate ? (
          <input
            type="datetime-local"
            value={readyDate}
            onChange={handleReadyDateChange}
            onBlur={() => onEditingReadyDateChange(false)}
            autoFocus
            style={{ 
              fontSize: 11, 
              padding: '2px 4px', 
              border: '1px solid #ddd', 
              borderRadius: 3,
              maxWidth: 160
            }}
          />
        ) : (
          <span 
            style={{ fontSize: 11, color: '#333', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => onEditingReadyDateChange(true)}
            title="Кликните для редактирования"
          >
            {formatDateTimeDDMMYYYY(readyDate)}
          </span>
        )}
      </span>
    </>
  );
});

OrderItemDates.displayName = 'OrderItemDates';

