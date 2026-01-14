import React from 'react';
import { Button } from '../../../common';
import { TierFormState } from './hooks/useTierForm';

interface CreateTierFormProps {
  form: TierFormState;
  busy: boolean;
  onFormChange: (updates: Partial<TierFormState>) => void;
  onSubmit: () => void;
}

/**
 * Компонент формы создания нового tier
 */
export const CreateTierForm: React.FC<CreateTierFormProps> = ({
  form,
  busy,
  onFormChange,
  onSubmit,
}) => {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-lg p-4">
      <h5 className="text-sm font-semibold text-gray-700 mb-3">Новый диапазон</h5>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Мин. количество</label>
          <input
            type="number"
            min={1}
            className="w-full border border-gray-300 rounded px-3 py-2"
            value={form.minQuantity || ''}
            onChange={(e) => onFormChange({ minQuantity: e.target.value })}
            disabled={busy}
            placeholder="Например: 1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Цена (BYN)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full border border-gray-300 rounded px-3 py-2"
            value={form.rate || ''}
            onChange={(e) => onFormChange({ rate: e.target.value })}
            disabled={busy}
            placeholder="Например: 10.50"
          />
        </div>
        <div className="flex items-center">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => onFormChange({ isActive: e.target.checked })}
              disabled={busy}
            />
            Активен
          </label>
        </div>
        <div className="flex items-center justify-end">
          <Button variant="primary" size="sm" onClick={onSubmit} disabled={busy}>
            {busy ? 'Добавляем…' : 'Добавить диапазон'}
          </Button>
        </div>
      </div>
    </div>
  );
};
