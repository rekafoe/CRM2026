/**
 * Рефакторенная версия ServiceVariantsTable
 * Использует модульную структуру с хуками и утилитами
 */

import React, { useCallback } from 'react';
import { Alert } from '../../../common';
import { TierRangeModal } from './TierRangeModal';
import { useVariantsTable } from './hooks/useVariantsTable';
import { useVariantEditing } from './hooks/useVariantEditing';
import { useTierModal } from './hooks/useTierModal';
import { ServiceVariantsTableProps } from './ServiceVariantsTable.types';
import { ServiceVariantsMaterialsSection } from './ServiceVariantsMaterialsSection';
import { ServiceVariantsToolbar } from './ServiceVariantsToolbar';
import { ServiceVariantsGrid } from './ServiceVariantsGrid';
import '../../../../features/productTemplate/components/SimplifiedTemplateSection.css';
import './ServiceVariantsTable.css';

export const ServiceVariantsTable: React.FC<ServiceVariantsTableProps> = ({
  serviceId,
  serviceName,
  serviceMinQuantity,
  serviceMaxQuantity,
  materials = [],
}) => {
  const {
    loading,
    error,
    setError,
    reload,
    invalidateCache,
    operations,
    localChanges,
    variants,
    commonRangesAsPriceRanges,
    groupedVariants,
    typeNames,
    getNextTypeName,
    isSaving,
    autoSaveHint,
    handleToolbarSaveNow,
    handleToolbarCancel,
  } = useVariantsTable(serviceId);

  const editing = useVariantEditing();
  const tierModal = useTierModal();
  const [hoveredRangeIndex, setHoveredRangeIndex] = React.useState<number | null>(null);

  const handleEditRange = useCallback(
    (rangeIndex: number, minQty: number) => {
      tierModal.openEditModal(rangeIndex, minQty);
    },
    [tierModal]
  );

  const handleSaveRange = useCallback(async () => {
    const boundary = Number(tierModal.tierModal.boundary);
    if (!boundary || boundary < 1) {
      setError('Граница диапазона должна быть больше 0');
      return;
    }

    try {
      if (tierModal.tierModal.type === 'add') {
        await operations.addRangeBoundary(boundary);
      } else if (tierModal.tierModal.type === 'edit' && tierModal.tierModal.tierIndex !== undefined) {
        await operations.editRangeBoundary(tierModal.tierModal.tierIndex, boundary);
      }
      tierModal.closeModal();
      setError(null);
      invalidateCache();
      await reload();
    } catch (err) {
      console.error('Error in handleSaveRange:', err);
      setError('Не удалось сохранить диапазон');
    }
  }, [tierModal, operations, setError, reload, invalidateCache]);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Загрузка вариантов...</div>;
  }

  return (
    <div className="service-variants-table-wrapper">
      <div className="service-variants-table">
      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      <ServiceVariantsToolbar
        serviceName={serviceName}
        serviceMinQuantity={serviceMinQuantity}
        serviceMaxQuantity={serviceMaxQuantity}
        autoSaveHint={autoSaveHint}
        hasUnsavedChanges={localChanges.hasUnsavedChanges}
        isSaving={isSaving}
        onSaveNow={handleToolbarSaveNow}
        onCancelDraft={handleToolbarCancel}
        onAddRangeClick={(e) => tierModal.openAddModal(e.currentTarget)}
      />

      {variants.length > 0 && materials.length > 0 && (
        <ServiceVariantsMaterialsSection
          typeNames={typeNames}
          groupedVariants={groupedVariants}
          materials={materials}
          onUpdateMaterial={operations.updateVariantMaterial}
        />
      )}

      {variants.length === 0 ? (
        <div className="service-variants-empty">
          <p>Нет вариантов. Нажмите "Добавить тип" для создания первого варианта.</p>
        </div>
      ) : (
        <ServiceVariantsGrid
          serviceName={serviceName}
          commonRangesAsPriceRanges={commonRangesAsPriceRanges}
          groupedVariants={groupedVariants}
          typeNames={typeNames}
          getNextTypeName={getNextTypeName}
          setError={setError}
          localChanges={localChanges}
          editing={editing}
          onEditRange={handleEditRange}
          hoveredRangeIndex={hoveredRangeIndex}
          onRangeHover={setHoveredRangeIndex}
        />
      )}

        <TierRangeModal
          modal={tierModal.tierModal}
          onClose={tierModal.closeModal}
          onSave={handleSaveRange}
          onBoundaryChange={(value) => tierModal.setTierModal({ ...tierModal.tierModal, boundary: value })}
        />
      </div>
    </div>
  );
};
