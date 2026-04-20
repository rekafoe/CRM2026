/**
 * Рефакторенная версия ServiceVariantsTable
 * Использует модульную структуру с хуками и утилитами
 */

import React, { useMemo, useCallback, useEffect } from 'react';
import { Button, Alert } from '../../../common';
import { PriceRangeCells, PriceRangeHeaders } from './PriceRangeCells';
import { PriceRange } from '../../../../hooks/usePriceRanges';
import { TierRangeModal } from './TierRangeModal';
import { useServiceVariants } from './hooks/useServiceVariants';
import { useVariantEditing } from './hooks/useVariantEditing';
import { useTierModal } from './hooks/useTierModal';
import { useVariantOperations } from './hooks/useVariantOperations';
import { useLocalRangeChanges } from './hooks/useLocalRangeChanges';
import {
  groupVariantsByType,
  calculateCommonRanges,
  createVariantsIndexMap,
  variantParentMapKey,
} from './ServiceVariantsTable.utils';
import {
  ServiceVariantsTableProps,
  VariantWithTiers,
} from './ServiceVariantsTable.types';
import { ServiceVariantsMaterialsSection } from './ServiceVariantsMaterialsSection';
import { VariantRowLevel0 } from './VariantRowLevel0';
import { VariantRowLevel1 } from './VariantRowLevel1';
import { VariantRowLevel2 } from './VariantRowLevel2';
import { PendingChanges } from './hooks/useLocalRangeChanges';
import '../../../../features/productTemplate/components/SimplifiedTemplateSection.css';
import './ServiceVariantsTable.css';

export const ServiceVariantsTable: React.FC<ServiceVariantsTableProps> = ({
  serviceId,
  serviceName,
  serviceMinQuantity,
  serviceMaxQuantity,
  materials = [],
}) => {
  // Хуки для управления состоянием
  const { variants: serverVariants, loading, error, setError, reload, invalidateCache, setVariants } = useServiceVariants(serviceId);
  const editing = useVariantEditing();
  const tierModal = useTierModal();
  const operations = useVariantOperations(serviceId, serverVariants, setVariants, setError, reload, invalidateCache);
  const [isSaving, setIsSaving] = React.useState(false);
  const [hoveredRangeIndex, setHoveredRangeIndex] = React.useState<number | null>(null);

  // Один вызов применяет все несохранённые изменения (варианты → диапазоны → цены)
  const saveChangesToServer = useCallback(async (pending: PendingChanges) => {
    setIsSaving(true);
    try {
      const { variantChanges, rangeChanges, priceChanges } = pending;

      for (const change of variantChanges) {
        switch (change.type) {
          case 'create':
            if (change.variantName) {
              await operations.createVariant(change.variantName, change.parameters || {});
            }
            break;
          case 'update':
            if (change.variantId) {
              if (change.variantName != null && change.oldVariantName != null) {
                await operations.updateVariantName(change.variantId, change.variantName);
              }
              if (change.parameters) {
                await operations.updateVariantParams(change.variantId, change.parameters);
              }
            }
            break;
          case 'delete':
            if (change.variantId) {
              await operations.deleteVariant(change.variantId, true);
            }
            break;
        }
      }

      const removeChanges = rangeChanges.filter(c => c.type === 'remove' && c.rangeIndex !== undefined);
      for (const change of removeChanges) {
        await operations.removeRange(change.rangeIndex!);
      }
      const addChanges = rangeChanges.filter(c => c.type === 'add' && c.boundary);
      await Promise.all(addChanges.map(c => operations.addRangeBoundary(c.boundary!)));
      const editChanges = rangeChanges.filter(c => c.type === 'edit' && c.rangeIndex !== undefined && c.newBoundary !== undefined);
      for (const change of editChanges) {
        await operations.editRangeBoundary(change.rangeIndex!, change.newBoundary!);
      }

      if (priceChanges.length > 0) {
        await Promise.all(
          priceChanges.map(c => operations.savePriceImmediate(c.variantId, c.minQty, c.newPrice))
        );
      }

      await reload();
    } catch (err) {
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [operations, reload]);

  const localChanges = useLocalRangeChanges(serverVariants, saveChangesToServer);

  // Синхронизируем локальное состояние при изменении серверных данных
  // Используем useRef для хранения предыдущего значения и функции синхронизации
  const prevServerVariantsRef = React.useRef<string>('');
  const syncWithExternalRef = React.useRef(localChanges.syncWithExternal);
  const localChangesRef = React.useRef(localChanges);
  
  // Обновляем refs при каждом рендере
  syncWithExternalRef.current = localChanges.syncWithExternal;
  localChangesRef.current = localChanges;
  
  React.useEffect(() => {
    const currentVariantsStr = JSON.stringify(serverVariants);
    if (prevServerVariantsRef.current !== currentVariantsStr) {
      prevServerVariantsRef.current = currentVariantsStr;
      const current = localChangesRef.current;
      const empty =
        current.pendingChanges.rangeChanges.length === 0 &&
        current.pendingChanges.priceChanges.length === 0 &&
        current.pendingChanges.variantChanges.length === 0;
      if (!current.hasUnsavedChanges && empty) {
        syncWithExternalRef.current(serverVariants);
      }
    }
  }, [serverVariants]);

  // Используем локальные варианты
  const variants = localChanges.localVariants;

  // Вычисляем общие диапазоны локально, чтобы избежать цикла зависимостей
  const commonRanges = useMemo(() => calculateCommonRanges(variants), [variants]);
  const commonRangesAsPriceRanges: PriceRange[] = useMemo(() => {
    return commonRanges.map(r => ({
      minQty: r.min_qty,
      maxQty: r.max_qty,
      price: 0,
    }));
  }, [commonRanges]);

  // Группируем варианты
  const groupedVariants = useMemo(() => groupVariantsByType(variants), [variants]);
  const variantsIndexMap = useMemo(() => createVariantsIndexMap(variants), [variants]);
  const typeNames = useMemo(() => Object.keys(groupedVariants), [groupedVariants]);
  const getNextTypeName = useCallback(() => {
    const baseName = 'Новый тип';
    if (!typeNames.includes(baseName)) {
      return baseName;
    }
    let index = 2;
    let candidate = `${baseName} ${index}`;
    while (typeNames.includes(candidate)) {
      index += 1;
      candidate = `${baseName} ${index}`;
    }
    return candidate;
  }, [typeNames]);

  // Обработчики
  const handleCreateVariant = useCallback(async () => {
    try {
      const newVariant = localChanges.createVariant(getNextTypeName(), {});
      editing.startEditingName(newVariant.id, newVariant.variantName);
    } catch (err) {
      console.error('Error creating variant locally:', err);
      setError('Не удалось создать вариант');
    }
  }, [localChanges, editing, setError, getNextTypeName]);

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

      <div className="service-variants-toolbar">
        <div className="service-variants-toolbar__left">
          <div>
            <h3 className="service-variants-title">Варианты услуги: {serviceName}</h3>
            {(serviceMinQuantity !== undefined || serviceMaxQuantity !== undefined) && (
              <div className="service-variants-subtitle">
                Тираж: от {serviceMinQuantity ?? 1}
                {serviceMaxQuantity !== undefined ? ` до ${serviceMaxQuantity}` : ' (без максимума)'}
              </div>
            )}
          </div>
          {localChanges.hasUnsavedChanges && (
            <div className="service-variants-actions">
              <span className="service-variants-changes">
                Есть несохраненные изменения ({localChanges.pendingChanges.variantChanges.length} вариантов, {localChanges.pendingChanges.rangeChanges.length} диапазонов, {localChanges.pendingChanges.priceChanges.length} цен)
              </span>
              <Button
                variant="success"
                size="sm"
                disabled={isSaving}
                onClick={async () => {
                  try {
                    await localChanges.saveChanges();
                    setError(null);
                  } catch (err) {
                    setError('Не удалось сохранить изменения');
                  }
                }}
              >
                {isSaving ? '⏳ Сохранение...' : '💾 Сохранить'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (confirm('Отменить все несохраненные изменения?')) {
                    localChanges.cancelChanges();
                  }
                }}
              >
                ↶ Отменить
              </Button>
            </div>
          )}
        </div>
        <div className="service-variants-toolbar__right">
          <button
            type="button"
            className="el-button el-button--info el-button--mini is-plain"
            onClick={(e) => {
              tierModal.openAddModal(e.currentTarget);
            }}
          >
            <i className="el-icon-plus"></i>
            <span>Диапазон</span>
          </button>
        </div>
      </div>

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
        <div className="table-container">
          <div className="el-table el-table--fit el-table--border el-table--enable-row-hover el-table--enable-row-transition el-table--small service-variants-grid">
            <div className="el-table__header-wrapper">
              <table cellSpacing="0" cellPadding="0" border={0} className="el-table__header" style={{ width: '100%' }}>
                <colgroup>
                  <col className="variant-name-col" />
                  {commonRangesAsPriceRanges.map((range) => (
                    <col key={`range-${range.minQty}`} className="range-col" />
                  ))}
                  <col className="actions-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
                      <div className="cell">
                        <div className="variant-name-header">
                          <div className="variant-name-header__title" title={serviceName}>{serviceName}</div>
                        </div>
                      </div>
                    </th>
                    <PriceRangeHeaders
                      commonRanges={commonRangesAsPriceRanges}
                      onEditRange={(rangeIndex, minQty) => {
                        tierModal.openEditModal(rangeIndex, minQty);
                      }}
                      onRemoveRange={(rangeIndex) => {
                        if (confirm('Удалить этот диапазон для всех вариантов?')) {
                          localChanges.removeRange(rangeIndex);
                        }
                      }}
                      hoveredRangeIndex={hoveredRangeIndex}
                      onRangeHover={setHoveredRangeIndex}
                    />
                    <th style={{ width: '120px', minWidth: '120px', maxWidth: '120px', padding: 0 }}>
                      <div className="cell">
                        <div className="active-panel variant-actions-header">
                          <span className="variant-actions-label">Действия</span>
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="el-table__body-wrapper is-scrolling-none">
              <table cellSpacing="0" cellPadding="0" border={0} className="el-table__body" style={{ width: '100%' }}>
                <colgroup>
                  <col className="variant-name-col" />
                  {commonRangesAsPriceRanges.map((range) => (
                    <col key={`body-range-${range.minQty}`} className="range-col" />
                  ))}
                  <col className="actions-col" />
                </colgroup>
                <tbody>
                  {typeNames.map((typeName) => {
                    const typeGroup = groupedVariants[typeName];
                    const firstVariant = typeGroup.level0[0];
                    if (!firstVariant) return null;

                    const allTypeVariants: VariantWithTiers[] = [
                      ...typeGroup.level0,
                      ...Array.from(typeGroup.level1.values()).flat(),
                      ...Array.from(typeGroup.level2.values()).flat(),
                    ];

                    const handleSaveNameLevel0 = () => {
                      if (editing.editingVariantNameValue.trim()) {
                        localChanges.updateVariantName(firstVariant.id, editing.editingVariantNameValue.trim());
                        editing.cancelEditingName();
                      }
                    };

                    return (
                      <React.Fragment key={typeName}>
                        <VariantRowLevel0
                          variant={firstVariant}
                          typeName={typeName}
                          allTypeVariants={allTypeVariants}
                          commonRangesAsPriceRanges={commonRangesAsPriceRanges}
                          isEditingName={editing.editingVariantName === firstVariant.id}
                          editingNameValue={editing.editingVariantNameValue}
                          onNameChange={editing.setEditingVariantNameValue}
                          onNameEditStart={() => editing.startEditingName(firstVariant.id, typeName)}
                          onNameEditCancel={editing.cancelEditingName}
                          onNameSave={handleSaveNameLevel0}
                          onCreateChild={() => {
                            try {
                              const newVariant = localChanges.createVariant(typeName, { type: 'Новый тип' });
                              editing.startEditingParams(newVariant.id, { type: 'Новый тип' });
                            } catch (err) {
                              setError('Не удалось создать вариант');
                            }
                          }}
                          onCreateSibling={() => {
                            try {
                              const newVariant = localChanges.createVariant(getNextTypeName(), {});
                              editing.startEditingName(newVariant.id, newVariant.variantName);
                            } catch (err) {
                              setError('Не удалось создать вариант');
                            }
                          }}
                          onDelete={() => {
                            if (!confirm(`Удалить тип "${typeName}" и все его варианты?`)) return;
                            allTypeVariants.forEach((v) => localChanges.deleteVariant(v.id));
                          }}
                        />

                        {Array.from(typeGroup.level1.entries()).map(([, level1Variants]) =>
                          level1Variants.map((variant) => {
                            const level2Variants = typeGroup.level2.get(variantParentMapKey(variant.id)) || [];
                            return (
                              <React.Fragment key={variant.id}>
                                <VariantRowLevel1
                                  variant={variant}
                                  typeName={typeName}
                                  level2Variants={level2Variants}
                                  commonRangesAsPriceRanges={commonRangesAsPriceRanges}
                                  isEditingParams={editing.editingVariantParams === variant.id}
                                  editingParamsValue={editing.editingVariantParamsValue}
                                  onParamsChange={(key, value) =>
                                    editing.setEditingVariantParamsValue({ ...editing.editingVariantParamsValue, [key]: value })
                                  }
                                  onParamsEditStart={() =>
                                    editing.startEditingParams(variant.id, { type: variant.parameters?.type || '' })
                                  }
                                  onParamsEditCancel={editing.cancelEditingParams}
                                  onParamsSave={() => {
                                    localChanges.updateVariantParams(variant.id, {
                                      type: editing.editingVariantParamsValue.type || '',
                                    });
                                    editing.cancelEditingParams();
                                  }}
                                  onPriceChange={() => {}}
                                  onCreateChild={() => {
                                    try {
                                      const newVariant = localChanges.createVariant(typeName, {
                                        parentVariantId: variant.id,
                                        subType: '',
                                      });
                                      editing.startEditingParams(newVariant.id, { parentVariantId: variant.id, subType: '' });
                                    } catch (err) {
                                      setError('Не удалось создать вариант');
                                    }
                                  }}
                                  onCreateSibling={() => {
                                    try {
                                      const newVariant = localChanges.createVariant(typeName, { type: 'Новый тип' });
                                      editing.startEditingParams(newVariant.id, { type: 'Новый тип' });
                                    } catch (err) {
                                      setError('Не удалось создать вариант');
                                    }
                                  }}
                                  onDelete={() => {
                                    if (!confirm('Удалить этот вариант и все его дочерние варианты?')) return;
                                    localChanges.deleteVariant(variant.id);
                                    level2Variants.forEach((v) => localChanges.deleteVariant(v.id));
                                  }}
                                  serviceId={serviceId}
                                />

                                {level2Variants.map((level2Variant) => (
                                  <VariantRowLevel2
                                    key={level2Variant.id}
                                    variant={level2Variant}
                                    typeName={typeName}
                                    commonRangesAsPriceRanges={commonRangesAsPriceRanges}
                                    isEditingParams={editing.editingVariantParams === level2Variant.id}
                                    editingParamsValue={editing.editingVariantParamsValue}
                                    onParamsChange={(key, value) =>
                                      editing.setEditingVariantParamsValue({ ...editing.editingVariantParamsValue, [key]: value })
                                    }
                                    onParamsEditStart={() =>
                                      editing.startEditingParams(level2Variant.id, {
                                        subType: level2Variant.parameters?.subType || '',
                                      })
                                    }
                                    onParamsEditCancel={editing.cancelEditingParams}
                                    onParamsSave={() => {
                                      localChanges.updateVariantParams(level2Variant.id, {
                                        subType: editing.editingVariantParamsValue.subType || '',
                                      });
                                      editing.cancelEditingParams();
                                    }}
                                    onPriceChange={(minQty, newPrice) =>
                                      localChanges.changePrice(level2Variant.id, minQty, newPrice)
                                    }
                                    onCreateSibling={() => {
                                      try {
                                        const newVariant = localChanges.createVariant(typeName, {
                                          parentVariantId: level2Variant.parameters?.parentVariantId,
                                          subType: '',
                                        });
                                        editing.startEditingParams(newVariant.id, {
                                          parentVariantId: level2Variant.parameters?.parentVariantId,
                                          subType: '',
                                        });
                                      } catch (err) {
                                        setError('Не удалось создать вариант');
                                      }
                                    }}
                                    onDelete={() => {
                                      if (!confirm('Удалить этот вариант?')) return;
                                      localChanges.deleteVariant(level2Variant.id);
                                    }}
                                    hoveredRangeIndex={hoveredRangeIndex}
                                    onRangeHover={setHoveredRangeIndex}
                                  />
                                ))}
                              </React.Fragment>
                            );
                          })
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
