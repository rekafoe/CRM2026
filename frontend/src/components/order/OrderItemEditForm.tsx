import React, { useCallback } from 'react';
import { numberInputFromString, type NumberInputValue } from '../../utils/numberInput';
import { sanitizeOrderItemDescription } from './orderItemUtils';

interface OrderItemEditFormProps {
  item: any;
  customDescription: string;
  price: NumberInputValue;
  qty: NumberInputValue;
  sides: NumberInputValue;
  sheets: NumberInputValue;
  waste: NumberInputValue;
  printerId: number | '';
  printers: Array<{ id: number; name: string; technology_code?: string | null; color_mode?: 'bw' | 'color' | 'both' }>;
  printTech?: string | null;
  printColorMode?: 'bw' | 'color' | null;
  onDescriptionChange: (value: string) => void;
  onPriceChange: (value: NumberInputValue) => void;
  onQtyChange: (value: NumberInputValue) => void;
  onSidesChange: (value: NumberInputValue) => void;
  onSheetsChange: (value: NumberInputValue) => void;
  onWasteChange: (value: NumberInputValue) => void;
  onPrinterChange: (value: number | '') => void;
}

export const OrderItemEditForm: React.FC<OrderItemEditFormProps> = React.memo(({
  customDescription,
  price,
  qty,
  sides,
  sheets,
  waste,
  printerId,
  printers,
  printTech,
  printColorMode,
  onDescriptionChange,
  onPriceChange,
  onQtyChange,
  onSidesChange,
  onSheetsChange,
  onWasteChange,
  onPrinterChange,
}) => {
  const handleDescriptionReset = useCallback(() => {
    onDescriptionChange('');
  }, [onDescriptionChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 12, color: '#666' }}>Описание товара:</label>
          <button 
            type="button"
            onClick={handleDescriptionReset}
            style={{ 
              fontSize: 11, 
              padding: '2px 6px', 
              backgroundColor: '#f0f0f0', 
              border: '1px solid #ccc', 
              borderRadius: 3,
              cursor: 'pointer'
            }}
            title="Сбросить к автоматическому описанию"
          >
            Авто
          </button>
        </div>
        <input 
          type="text" 
          value={customDescription} 
          onChange={e => onDescriptionChange(e.target.value)} 
          placeholder="Введите описание товара"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input 
          type="number" 
          value={price} 
          onChange={e => onPriceChange(numberInputFromString(e.target.value))} 
          step="0.01" 
          style={{ width: 100 }} 
        /> BYN ×
        <input 
          type="number" 
          value={qty} 
          min={1} 
          onChange={e => onQtyChange(numberInputFromString(e.target.value))} 
          style={{ width: 60 }} 
        />
        <select 
          value={sides === '' ? 1 : sides} 
          onChange={e => onSidesChange(numberInputFromString(e.target.value))}
        >
          <option value={1}>1 стор.</option>
          <option value={2}>2 стор.</option>
        </select>
        <input 
          type="number" 
          value={sheets} 
          min={0} 
          onChange={e => onSheetsChange(numberInputFromString(e.target.value))} 
          style={{ width: 80 }} 
          placeholder="листы" 
        />
        <input 
          type="number" 
          value={waste} 
          min={0} 
          onChange={e => onWasteChange(numberInputFromString(e.target.value))} 
          style={{ width: 80 }} 
          placeholder="брак" 
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#666' }}>Принтер:</span>
        <select
          value={printerId}
          onChange={(e) => onPrinterChange(e.target.value ? Number(e.target.value) : '')}
          className="form-control"
          style={{ width: 260 }}
        >
          <option value="">Не выбран</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {printTech && (
          <span style={{ fontSize: 11, color: '#888' }}>
            (тип печати: {printTech}{printColorMode ? `, режим: ${printColorMode === 'bw' ? 'Ч/Б' : 'Цвет'}` : ''})
          </span>
        )}
      </div>
    </div>
  );
});

OrderItemEditForm.displayName = 'OrderItemEditForm';

