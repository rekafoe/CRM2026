import React, { useState } from 'react';
import { Button } from '../../../components/common';

interface PriceRange {
  id: string;
  min: string;
  max: string;
  unit: string;
  weightPerUnit?: string;
}

interface LayoutWorkSectionProps {
  ranges: PriceRange[];
  saving: boolean;
  onChange: (ranges: PriceRange[]) => void;
  onSave: () => Promise<void> | void;
}

const LayoutWorkSection: React.FC<LayoutWorkSectionProps> = ({ ranges, saving, onChange, onSave }) => {
  const [selectedOperation, setSelectedOperation] = useState<string>('');

  const addRange = () => {
    const newRange: PriceRange = {
      id: Date.now().toString(),
      min: '1',
      max: '∞',
      unit: 'BYN'
    };
    onChange([...ranges, newRange]);
  };

  const updateRange = (id: string, field: keyof PriceRange, value: string) => {
    onChange(ranges.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRange = (id: string) => {
    onChange(ranges.filter(r => r.id !== id));
  };

  const moveRange = (id: string, direction: 'up' | 'down') => {
    const index = ranges.findIndex(r => r.id === id);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= ranges.length) return;

    const newRanges = [...ranges];
    [newRanges[index], newRanges[newIndex]] = [newRanges[newIndex], newRanges[index]];
    onChange(newRanges);
  };

  return (
    <div className="form-section">
      <div className="parameter-item">
        <div className="parameter-info">
          <label style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>Выбрать</label>
        </div>
        <select 
          className="form-select" 
          value={selectedOperation}
          onChange={(e) => setSelectedOperation(e.target.value)}
          style={{ maxWidth: '300px' }}
        >
          <option value="">— Выберите операцию —</option>
          <option value="print">Печать</option>
          <option value="cut">Резка</option>
          <option value="laminate">Ламинация</option>
        </select>
      </div>

      {ranges.map((range, index) => (
        <div key={range.id} className="parameter-item" style={{ marginTop: '12px' }}>
          <div className="parameter-info" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              placeholder="1-∞"
              value={`${range.min}-${range.max}`}
              onChange={(e) => {
                const parts = e.target.value.split('-');
                updateRange(range.id, 'min', parts[0] || '1');
                updateRange(range.id, 'max', parts[1] || '∞');
              }}
              style={{ width: '80px' }}
            />
            <select
              className="form-select"
              value={range.unit}
              onChange={(e) => updateRange(range.id, 'unit', e.target.value)}
              style={{ width: '100px' }}
            >
              <option value="BYN">Валюта</option>
              <option value="Br">Валюта</option>
              <option value="шт">шт</option>
              <option value="лист">лист</option>
            </select>
            <input
              type="text"
              className="form-input"
              placeholder="Вес за ед"
              value={range.weightPerUnit || ''}
              onChange={(e) => updateRange(range.id, 'weightPerUnit', e.target.value)}
              style={{ width: '100px' }}
            />
            <button
              type="button"
              className="btn-icon"
              onClick={() => {/* Документ */}}
              title="Файл"
            >
              📄
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => moveRange(range.id, 'down')}
              disabled={index === ranges.length - 1}
              title="Вниз"
            >
              ⬇️
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => moveRange(range.id, 'up')}
              disabled={index === 0}
              title="Вверх"
            >
              ⬆️
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => {/* Оранжевый кружок */}}
              title="Настройки"
            >
              🟠
            </button>
            <button
              type="button"
              className="btn-icon btn-icon--danger"
              onClick={() => removeRange(range.id)}
              title="Удалить"
            >
              🗑️
            </button>
          </div>
        </div>
      ))}

      <div className="parameter-item" style={{ marginTop: '12px' }}>
        <div className="parameter-info" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={addRange}
          >
            + Диапазон
          </Button>
          {ranges.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LayoutWorkSection;

