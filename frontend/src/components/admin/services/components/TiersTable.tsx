import React from 'react';
import { ServiceVolumeTier } from '../../../../types/pricing';
import { TierRow } from './TierRow';
import { TierFormState } from './hooks/useTierForm';
import { TiersTableSkeleton } from './TiersTableSkeleton';

interface TiersTableProps {
  tiers: ServiceVolumeTier[];
  loading: boolean;
  editingTierId: number | null;
  editForm: TierFormState;
  editBusy: boolean;
  deleteBusyId: number | null;
  onEditStart: (tier: ServiceVolumeTier) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (tierId: number) => void;
  onEditFormChange: (updates: Partial<TierFormState>) => void;
}

/**
 * Компонент таблицы tiers
 */
export const TiersTable: React.FC<TiersTableProps> = ({
  tiers,
  loading,
  editingTierId,
  editForm,
  editBusy,
  deleteBusyId,
  onEditStart,
  onEditSave,
  onEditCancel,
  onDelete,
  onEditFormChange,
}) => {
  if (loading) {
    return <TiersTableSkeleton />;
  }

  if (tiers.length === 0) {
    return (
      <div className="overflow-hidden border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-white">
            <tr>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Мин. количество
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Цена за единицу
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                Нет диапазонов. Добавьте первый.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-white">
          <tr>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Мин. количество
            </th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Цена за единицу
            </th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
              Действия
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              isEditing={editingTierId === tier.id}
              editForm={editForm}
              editBusy={editBusy}
              deleteBusy={deleteBusyId === tier.id}
              onEditStart={onEditStart}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
              onDelete={onDelete}
              onEditFormChange={onEditFormChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
