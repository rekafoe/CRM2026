/**
 * Рефакторенная версия ServiceVolumeTiersPanel
 * Использует модульную структуру с хуками и компонентами
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Alert } from '../../../common';
import {
  PricingService,
  ServiceVolumeTier,
  ServiceVolumeTierPayload,
} from '../../../../types/pricing';
import { useTierForm } from './hooks/useTierForm';
import { TiersTable } from './TiersTable';
import { CreateTierForm } from './CreateTierForm';

interface ServiceVolumeTiersPanelProps {
  service: PricingService;
  tiers: ServiceVolumeTier[];
  loading?: boolean;
  onCreateTier: (payload: ServiceVolumeTierPayload) => Promise<void> | void;
  onUpdateTier: (tierId: number, payload: ServiceVolumeTierPayload) => Promise<void> | void;
  onDeleteTier: (tierId: number) => Promise<void> | void;
}

const ServiceVolumeTiersPanel: React.FC<ServiceVolumeTiersPanelProps> = ({
  service,
  tiers,
  loading = false,
  onCreateTier,
  onUpdateTier,
  onDeleteTier,
}) => {
  const [createBusy, setCreateBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const tierForm = useTierForm();

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => (a.minQuantity ?? 0) - (b.minQuantity ?? 0)),
    [tiers],
  );

  const handleCreate = useCallback(async () => {
    const validation = tierForm.validateCreateForm();
    if (!validation.valid) {
      setLocalError(validation.error || 'Ошибка валидации');
      return;
    }

    setLocalError(null);

    try {
      setCreateBusy(true);
      const payload = tierForm.getCreatePayload();
      await onCreateTier(payload);
      tierForm.resetCreateForm();
    } catch (err) {
      console.error('Failed to create tier', err);
      setLocalError('Не удалось создать диапазон. Попробуйте ещё раз.');
    } finally {
      setCreateBusy(false);
    }
  }, [tierForm, onCreateTier]);

  const handleEditSave = useCallback(async () => {
    if (tierForm.editingTierId === null) return;

    const validation = tierForm.validateEditForm();
    if (!validation.valid) {
      setLocalError(validation.error || 'Ошибка валидации');
      return;
    }

    setLocalError(null);

    try {
      setEditBusy(true);
      const payload = tierForm.getEditPayload();
      await onUpdateTier(tierForm.editingTierId, payload);
      tierForm.resetEditForm();
    } catch (err) {
      console.error('Failed to update tier', err);
      setLocalError('Не удалось сохранить изменения. Попробуйте ещё раз.');
    } finally {
      setEditBusy(false);
    }
  }, [tierForm, onUpdateTier]);

  const handleDelete = useCallback(
    async (tierId: number) => {
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
    },
    [onDeleteTier],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-800">Диапазоны цен</h4>
        {loading && <span className="text-sm text-gray-500">Загрузка...</span>}
      </div>

      {localError && <Alert type="error">{localError}</Alert>}

      <TiersTable
        tiers={sortedTiers}
        loading={loading}
        editingTierId={tierForm.editingTierId}
        editForm={tierForm.editForm}
        editBusy={editBusy}
        deleteBusyId={deleteBusyId}
        onEditStart={tierForm.startEditing}
        onEditSave={handleEditSave}
        onEditCancel={tierForm.resetEditForm}
        onDelete={handleDelete}
        onEditFormChange={tierForm.updateEditForm}
      />

      <CreateTierForm
        form={tierForm.createForm}
        busy={createBusy}
        onFormChange={tierForm.updateCreateForm}
        onSubmit={handleCreate}
      />
    </div>
  );
};

export default ServiceVolumeTiersPanel;
