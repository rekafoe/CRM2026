import React, { useMemo, useState } from 'react';
import { Button, Alert, StatusBadge } from '../../../common';
import {
  PricingService,
  ServiceVolumeTier,
  ServiceVolumeTierPayload,
} from '../../../../types/pricing';

interface ServiceVolumeTiersPanelProps {
  service: PricingService;
  tiers: ServiceVolumeTier[];
  loading?: boolean;
  onCreateTier: (payload: ServiceVolumeTierPayload) => Promise<void> | void;
  onUpdateTier: (tierId: number, payload: ServiceVolumeTierPayload) => Promise<void> | void;
  onDeleteTier: (tierId: number) => Promise<void> | void;
}

interface TierFormState {
  minQuantity: string;
  rate: string;
  isActive: boolean;
}

const emptyForm: TierFormState = {
  minQuantity: '',
  rate: '',
  isActive: true,
};

const parsePositiveNumber = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return parsed;
};

const ServiceVolumeTiersPanel: React.FC<ServiceVolumeTiersPanelProps> = ({
  service,
  tiers,
  loading = false,
  onCreateTier,
  onUpdateTier,
  onDeleteTier,
}) => {
  const [createForm, setCreateForm] = useState<TierFormState>(emptyForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [editForm, setEditForm] = useState<TierFormState>(emptyForm);
  const [editingTierId, setEditingTierId] = useState<number | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => (a.minQuantity ?? 0) - (b.minQuantity ?? 0)),
    [tiers],
  );

  const resetEditing = () => {
    setEditingTierId(null);
    setEditForm(emptyForm);
  };

  const handleCreate = async () => {
    const minQuantity = parsePositiveNumber(createForm.minQuantity);
    const rate = parsePositiveNumber(createForm.rate);

    if (!createForm.minQuantity || Number.isNaN(minQuantity) || minQuantity <= 0) {
      setLocalError('Укажите минимальное количество (> 0)');
      return;
    }

    if (!createForm.rate || Number.isNaN(rate) || rate <= 0) {
      setLocalError('Укажите цену за единицу (> 0)');
      return;
    }

    setLocalError(null);

    try {
      setCreateBusy(true);
      await onCreateTier({
        minQuantity,
        rate,
        isActive: createForm.isActive,
      });
      setCreateForm(emptyForm);
    } catch (err) {
      console.error('Failed to create tier', err);
      setLocalError('Не удалось создать диапазон. Попробуйте ещё раз.');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleEditStart = (tier: ServiceVolumeTier) => {
    setEditingTierId(tier.id);
    setEditForm({
      minQuantity: tier.minQuantity === null ? '' : String(tier.minQuantity),
      rate: tier.rate === null ? '' : String(tier.rate),
      isActive: tier.isActive,
    });
    setLocalError(null);
  };

  const handleEditSave = async () => {
    if (editingTierId === null) return;

    const minQuantity = parsePositiveNumber(editForm.minQuantity);
    const rate = parsePositiveNumber(editForm.rate);

    if (!editForm.minQuantity || Number.isNaN(minQuantity) || minQuantity <= 0) {
      setLocalError('Минимальное количество должно быть больше 0');
      return;
    }

    if (!editForm.rate || Number.isNaN(rate) || rate <= 0) {
      setLocalError('Цена должна быть больше 0');
      return;
    }

    setLocalError(null);

    try {
      setEditBusy(true);
      await onUpdateTier(editingTierId, {
        minQuantity,
        rate,
        isActive: editForm.isActive,
      });
      resetEditing();
    } catch (err) {
      console.error('Failed to update tier', err);
      setLocalError('Не удалось сохранить изменения. Попробуйте ещё раз.');
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async (tierId: number) => {
    if (!confirm('Удалить диапазон цен?')) return;
    try {
      setDeleteBusyId(tierId);
      await onDeleteTier(tierId);
    } catch (err) {
      console.error('Failed to delete tier', err);
      setLocalError('Не удалось удалить диапазон. Попробуйте ещё раз.');
    } finally {
      setDeleteBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-800">Диапазоны цен</h4>
        {loading && <span className="text-sm text-gray-500">Загрузка...</span>}
      </div>

      {localError && <Alert type="error">{localError}</Alert>}

      <div className="overflow-hidden border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-white">
            <tr>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Мин. количество</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Цена за единицу</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTiers.map((tier) => {
              const isEditing = editingTierId === tier.id;
              return (
                <tr key={tier.id}>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        type="number"
                        min={1}
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        value={editForm.minQuantity}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, minQuantity: e.target.value }))}
                        disabled={editBusy}
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
                        value={editForm.rate}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, rate: e.target.value }))}
                        disabled={editBusy}
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900">{tier.rate.toFixed(2)} BYN</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={editForm.isActive}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                          disabled={editBusy}
                        />
                        Активен
                      </label>
                    ) : (
                      <StatusBadge status={tier.isActive ? 'Активен' : 'Неактивен'} color={tier.isActive ? 'success' : 'error'} size="sm" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {isEditing ? (
                      <div className="flex gap-2 justify-end">
                        <Button variant="primary" size="sm" onClick={handleEditSave} disabled={editBusy}>
                          💾 Сохранить
                        </Button>
                        <Button variant="secondary" size="sm" onClick={resetEditing} disabled={editBusy}>
                          ❌ Отмена
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <Button variant="info" size="sm" onClick={() => handleEditStart(tier)} disabled={deleteBusyId === tier.id}>
                          ✏️
                        </Button>
                        <Button
                          variant="error"
                          size="sm"
                          onClick={() => handleDelete(tier.id)}
                          disabled={deleteBusyId === tier.id}
                        >
                          {deleteBusyId === tier.id ? '…' : '🗑️'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {sortedTiers.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                  Нет диапазонов. Добавьте первый.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-dashed border-gray-300 rounded-lg p-4">
        <h5 className="text-sm font-semibold text-gray-700 mb-3">Новый диапазон</h5>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Мин. количество</label>
            <input
              type="number"
              min={1}
              className="w-full border border-gray-300 rounded px-3 py-2"
              value={createForm.minQuantity}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, minQuantity: e.target.value }))}
              disabled={createBusy}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Цена (BYN)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full border border-gray-300 rounded px-3 py-2"
              value={createForm.rate}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, rate: e.target.value }))}
              disabled={createBusy}
            />
          </div>
          <div className="flex items-center">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                disabled={createBusy}
              />
              Активен
            </label>
          </div>
          <div className="flex items-center justify-end">
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={createBusy}>
              {createBusy ? 'Добавляем…' : 'Добавить диапазон'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceVolumeTiersPanel;


