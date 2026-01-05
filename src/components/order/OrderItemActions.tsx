import React, { useCallback } from 'react';
import { Item } from '../../types';

interface OrderItemActionsProps {
  editing: boolean;
  printerId: number | '';
  printers: Array<{ id: number; name: string }>;
  savingPrinter: boolean;
  onEditParameters?: (orderId: number, item: Item) => void;
  orderId: number;
  item: Item;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrinterFocus: () => void;
  onPrinterChange: (printerId: number | '') => void;
}

export const OrderItemActions: React.FC<OrderItemActionsProps> = React.memo(({
  editing,
  printerId,
  printers,
  savingPrinter,
  onEditParameters,
  orderId,
  item,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  onPrinterFocus,
  onPrinterChange,
}) => {
  const handlePrinterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onPrinterChange(e.target.value ? Number(e.target.value) : '');
  }, [onPrinterChange]);

  if (editing) {
    return (
      <>
        <button
          onClick={onSave}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#4caf50', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Сохранить
        </button>
        <button 
          className="btn-danger" 
          onClick={onCancel}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#f44336', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Отмена
        </button>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Фиксированный выбор принтера рядом с кнопками */}
      <span className="detail-item">
        <span style={{ fontSize: 12, color: '#666', marginRight: 6 }}>Принтер:</span>
        <select
          value={printerId}
          onFocus={onPrinterFocus}
          onMouseDown={onPrinterFocus}
          onChange={handlePrinterChange}
          disabled={savingPrinter}
          style={{ maxWidth: 220 }}
        >
          {printerId === '' && <option value="">Не выбран</option>}
          {printerId !== '' && !printers.some((p) => p.id === printerId) && (
            <option value={printerId}>{`Принтер #${printerId}`}</option>
          )}
          {printers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {savingPrinter && <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>Сохраняем…</span>}
      </span>

      {onEditParameters && (
        <button 
          onClick={() => onEditParameters(orderId, item)}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#2196f3', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Редактировать
        </button>
      )}
      <button 
        onClick={onEdit}
        style={{ 
          padding: '6px 12px', 
          backgroundColor: '#0ea5e9', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Изменить цену
      </button>
      <button
        className="btn-danger"
        onClick={onDelete}
        style={{ 
          padding: '6px 12px', 
          backgroundColor: '#f44336', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Удалить
      </button>
    </div>
  );
});

OrderItemActions.displayName = 'OrderItemActions';

