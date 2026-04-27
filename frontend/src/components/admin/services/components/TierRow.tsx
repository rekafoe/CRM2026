import React from 'react';
import { Button, StatusBadge } from '../../../common';
import { MoneyAmount } from '../../../ui';
import { ServiceVolumeTier, ServiceVolumeTierPayload } from '../../../../types/pricing';
import { TierFormState } from './hooks/useTierForm';

interface TierRowProps {
  tier: ServiceVolumeTier;
  isEditing: boolean;
  editForm: TierFormState;
  editBusy: boolean;
  deleteBusy: boolean;
  onEditStart: (tier: ServiceVolumeTier) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (tierId: number) => void;
  onEditFormChange: (updates: Partial<TierFormState>) => void;
}

/**
 * Компонент строки tier с inline редактированием
 */
export const TierRow: React.FC<TierRowProps> = ({
  tier,
  isEditing,
  editForm,
  editBusy,
  deleteBusy,
  onEditStart,
  onEditSave,
  onEditCancel,
  onDelete,
  onEditFormChange,
}) => {
  return (
    <tr>
      <td className="px-4 py-2">
        {isEditing ? (
          <input
            type="number"
            min={1}
            className="w-full border border-gray-300 rounded px-2 py-1"
            value={editForm.minQuantity || ''}
            onChange={(e) => onEditFormChange({ minQuantity: e.target.value })}
            disabled={editBusy}
            placeholder="Мин. количество"
          />
        ) : (
          <span className="text-sm text-gray-700">от {tier.minQuantity}</span>
        )}
      </td>
      <td className="px-4 py-2">
        {isEditing ? (
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full border border-gray-300 rounded px-2 py-1"
            value={editForm.rate || ''}
            onChange={(e) => onEditFormChange({ rate: e.target.value })}
            disabled={editBusy}
            placeholder="Цена"
          />
        ) : (
          <span className="text-sm font-medium text-gray-900"><MoneyAmount value={tier.rate} /></span>
        )}
      </td>
      <td className="px-4 py-2">
        {isEditing ? (
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={editForm.isActive}
              onChange={(e) => onEditFormChange({ isActive: e.target.checked })}
              disabled={editBusy}
            />
            Активен
          </label>
        ) : (
          <StatusBadge
            status={tier.isActive ? 'Активен' : 'Неактивен'}
            color={tier.isActive ? 'success' : 'error'}
            size="sm"
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {isEditing ? (
          <div className="flex gap-2 justify-end">
            <Button variant="primary" size="sm" onClick={onEditSave} disabled={editBusy}>
              💾 Сохранить
            </Button>
            <Button variant="secondary" size="sm" onClick={onEditCancel} disabled={editBusy}>
              ❌ Отмена
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="info" size="sm" onClick={() => onEditStart(tier)} disabled={deleteBusy}>
              ✏️
            </Button>
            <Button variant="error" size="sm" onClick={() => onDelete(tier.id)} disabled={deleteBusy}>
              {deleteBusy ? '…' : '🗑️'}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
};
