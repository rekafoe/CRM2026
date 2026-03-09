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
} from './ServiceVariantsTable.utils';
import {
  ServiceVariantsTableProps,
  VariantWithTiers,
} from './ServiceVariantsTable.types';
import { RangeChange, PriceChange, VariantChange } from './hooks/useLocalRangeChanges';
import '../../../../features/productTemplate/components/SimplifiedTemplateSection.css';
import './ServiceVariantsTable.css';

export const ServiceVariantsTable: React.FC<ServiceVariantsTableProps> = ({
  serviceId,
  serviceName,
  serviceMinQuantity,
  serviceMaxQuantity,
}) => {
  // Хуки для управления состоянием
  const { variants: serverVariants, loading, error, setError, reload, invalidateCache, setVariants } = useServiceVariants(serviceId);
  const editing = useVariantEditing();
  const tierModal = useTierModal();
  const operations = useVariantOperations(serviceId, serverVariants, setVariants, setError, reload, invalidateCache);
  const [isSaving, setIsSaving] = React.useState(false);
  const [hoveredRangeIndex, setHoveredRangeIndex] = React.useState<number | null>(null);

  // Локальное состояние для несохраненных изменений
  const saveChangesToServer = useCallback(async (rangeChanges: RangeChange[], priceChanges: PriceChange[], variantChanges: VariantChange[]) => {
    console.log('=== SAVE CHANGES TO SERVER === Starting', {
      variantChanges: variantChanges.length,
      rangeChanges: rangeChanges.length,
      priceChanges: priceChanges.length,
    });
    setIsSaving(true);
    try {
      // Применяем изменения вариантов (последовательно, т.к. могут быть зависимости)
      if (variantChanges.length > 0) {
        console.log('=== SAVE CHANGES TO SERVER === Applying variant changes...');
        for (const change of variantChanges) {
          switch (change.type) {
            case 'create':
              if (change.variantName) {
                await operations.createVariant(change.variantName, change.parameters || {});
              }
              break;
            case 'update':
              if (change.variantId) {
                // Обновляем имя варианта (если изменилось)
                if (change.variantName && change.oldVariantName) {
                  // Обновляем все варианты с таким именем
                  await operations.updateVariantName(change.variantId, change.variantName);
                }
                // Обновляем параметры варианта
                if (change.parameters) {
                  await operations.updateVariantParams(change.variantId, change.parameters);
                }
              }
              break;
            case 'delete':
              if (change.variantId) {
                await operations.deleteVariant(change.variantId);
              }
              break;
          }
        }
        console.log('=== SAVE CHANGES TO SERVER === Variant changes applied');
      }

      // Применяем изменения диапазонов (оптимизировано: группируем по типу)
      if (rangeChanges.length > 0) {
        console.log('=== SAVE CHANGES TO SERVER === Applying range changes...');
        
        // Группируем изменения по типу для оптимизации
        const addChanges = rangeChanges.filter(c => c.type === 'add' && c.boundary);
        const editChanges = rangeChanges.filter(c => c.type === 'edit' && c.rangeIndex !== undefined && c.newBoundary !== undefined);
        const removeChanges = rangeChanges.filter(c => c.type === 'remove' && c.rangeIndex !== undefined);
        
        // Выполняем удаления первыми (они могут влиять на индексы)
        if (removeChanges.length > 0) {
          console.log(`=== SAVE CHANGES TO SERVER === Removing ${removeChanges.length} ranges...`);
          // Удаления выполняем последовательно, т.к. они меняют индексы
          for (const change of removeChanges) {
            await operations.removeRange(change.rangeIndex!);
          }
        }
        
        // Добавления можно выполнять параллельно
        if (addChanges.length > 0) {
          console.log(`=== SAVE CHANGES TO SERVER === Adding ${addChanges.length} range boundaries...`);
          await Promise.all(
            addChanges.map(change => operations.addRangeBoundary(change.boundary!))
          );
        }
        
        // Редактирования выполняем последовательно (могут влиять на индексы)
        if (editChanges.length > 0) {
          console.log(`=== SAVE CHANGES TO SERVER === Editing ${editChanges.length} ranges...`);
          for (const change of editChanges) {
            await operations.editRangeBoundary(change.rangeIndex!, change.newBoundary!);
          }
        }
        
        console.log('=== SAVE CHANGES TO SERVER === Range changes applied');
      }

      // Применяем изменения цен (параллельно для ускорения)
      if (priceChanges.length > 0) {
        console.log('=== SAVE CHANGES TO SERVER === Applying price changes...');
        await Promise.all(
          priceChanges.map(change => 
            operations.savePriceImmediate(change.variantId, change.minQty, change.newPrice)
          )
        );
        console.log('=== SAVE CHANGES TO SERVER === Price changes applied');
      }

      // Перезагружаем данные с сервера
      console.log('=== SAVE CHANGES TO SERVER === Reloading data...');
      await reload();
      console.log('=== SAVE CHANGES TO SERVER === Successfully completed');
    } catch (err) {
      console.error('=== SAVE CHANGES TO SERVER === Error:', err);
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
    // Сравниваем по JSON для определения реального изменения данных
    const currentVariantsStr = JSON.stringify(serverVariants);
    if (prevServerVariantsRef.current !== currentVariantsStr) {
      prevServerVariantsRef.current = currentVariantsStr;
      // Синхронизируем только если нет несохраненных изменений
      const currentLocalChanges = localChangesRef.current;
      if (!currentLocalChanges.hasUnsavedChanges && 
          currentLocalChanges.rangeChanges.length === 0 && 
          currentLocalChanges.priceChanges.length === 0 && 
          currentLocalChanges.variantChanges.length === 0) {
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
          {(localChanges.hasUnsavedChanges || localChanges.rangeChanges.length > 0 || localChanges.priceChanges.length > 0 || localChanges.variantChanges.length > 0) && (
            <div className="service-variants-actions">
              <span className="service-variants-changes">
                Есть несохраненные изменения ({localChanges.variantChanges.length} вариантов, {localChanges.rangeChanges.length} диапазонов, {localChanges.priceChanges.length} цен)
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

                    const level1Variants = Array.from(typeGroup.level1.values()).flat();
                    const level2Variants = Array.from(typeGroup.level2.values()).flat();

                    const allTypeVariants: VariantWithTiers[] = [
                      ...typeGroup.level0,
                      ...level1Variants,
                      ...level2Variants,
                    ];

                    return (
                      <React.Fragment key={typeName}>
                        {/* Родительская строка - тип (уровень 0) */}
                        <tr className="el-table__row expanded">
                          <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
                            <div className="cell">
                              <div className="variant-name-row">
                                <div className="el-input el-input--small" style={{ flex: 1, marginRight: '8px', minWidth: 0 }}>
                                  {editing.editingVariantName === firstVariant.id ? (
                                    <input
                                      type="text"
                                      className="el-input__inner"
                                      value={editing.editingVariantNameValue}
                                      onChange={(e) => editing.setEditingVariantNameValue(e.target.value)}
                                      onBlur={() => {
                                        if (editing.editingVariantNameValue.trim()) {
                                          // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                          localChanges.updateVariantName(firstVariant.id, editing.editingVariantNameValue.trim());
                                          editing.cancelEditingName();
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (editing.editingVariantNameValue.trim()) {
                                            // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                            localChanges.updateVariantName(firstVariant.id, editing.editingVariantNameValue.trim());
                                            editing.cancelEditingName();
                                          }
                                        } else if (e.key === 'Escape') {
                                          editing.cancelEditingName();
                                        }
                                      }}
                                      autoFocus
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      className="el-input__inner"
                                      value={typeName}
                                      onClick={() => editing.startEditingName(firstVariant.id, typeName)}
                                      readOnly
                                      style={{ cursor: 'pointer' }}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <PriceRangeCells
                            tiers={[]} // Пустой массив для заголовка типа
                            commonRanges={commonRangesAsPriceRanges}
                            onPriceChange={() => {}} // Пустая функция для заголовка
                            editable={false}
                          />
                          <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px', padding: 0 }}>
                            <div className="cell">
                              <div className="active-panel" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="el-button el-button--success el-button--small is-plain"
                                  onClick={async () => {
                                    try {
                                      // 🆕 Для вариантов уровня 1 сохраняем только type, без плотности (density)
                                      const newVariant = localChanges.createVariant(typeName, { type: 'Новый тип' });
                                      editing.startEditingParams(newVariant.id, { type: 'Новый тип' });
                                    } catch (err) {
                                      console.error('Ошибка создания дочерней строки:', err);
                                      // Ошибка уже обработана в хуке и отображена через setError
                                    }
                                  }}
                                  title="Добавить дочернюю строку"
                                >
                                  <span style={{ fontSize: '14px' }}>↘</span>
                                </button>
                                <button
                                  type="button"
                                  className="el-button el-button--success el-button--small"
                                  onClick={async () => {
                                    try {
                                      const newVariant = localChanges.createVariant(getNextTypeName(), {});
                                      editing.startEditingName(newVariant.id, newVariant.variantName);
                                    } catch (err) {
                                      console.error('Ошибка создания варианта на том же уровне:', err);
                                      setError('Не удалось создать вариант');
                                    }
                                  }}
                                  title="Добавить тип на том же уровне"
                                >
                                  <span style={{ fontSize: '14px' }}>↓</span>
                                </button>
                                <button
                                  type="button"
                                  className="el-button el-button--danger el-button--small is-plain variant-delete-btn"
                                  onClick={async () => {
                                    if (!confirm(`Удалить тип "${typeName}" и все его варианты?`)) {
                                      return;
                                    }
                                    for (const variant of allTypeVariants) {
                                      localChanges.deleteVariant(variant.id);
                                    }
                                  }}
                                  title="Удалить тип"
                                >
                                  <span style={{ fontSize: '14px' }}>×</span>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Дочерние строки - варианты уровня 1 */}
                        {Array.from(typeGroup.level1.entries()).map(([parentId, level1Variants]) =>
                          level1Variants.map((variant) => {
                            const level2Variants = typeGroup.level2.get(variant.id) || [];
                            const hasChildren = level2Variants.length > 0;

                            return (
                              <React.Fragment key={variant.id}>
                                <tr className="el-table__row el-table__row--level-1">
                                  <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
                                    <div className="cell">
                                      <span className="el-table__indent" style={{ paddingLeft: '16px' }}></span>
                                      {hasChildren && (
                                        <div className="el-table__expand-icon el-table__expand-icon--expanded">
                                          <i className="el-icon-arrow-right"></i>
                                        </div>
                                      )}
                                      {!hasChildren && <span className="el-table__placeholder"></span>}
                                      <div style={{ width: hasChildren ? 'calc(100% - 44px)' : 'calc(100% - 20px)', marginLeft: hasChildren ? '5px' : '8px', display: 'inline-block' }}>
                                        <div className="el-input el-input--small">
                                          {editing.editingVariantParams === variant.id ? (
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                              <input
                                                type="text"
                                                className="el-input__inner"
                                                placeholder="Тип (например: глянец, мат)"
                                                value={editing.editingVariantParamsValue.type || ''}
                                                onChange={(e) =>
                                                  editing.setEditingVariantParamsValue({ ...editing.editingVariantParamsValue, type: e.target.value })
                                                }
                                                style={{ flex: 1 }}
                                              />
                                              <button
                                                type="button"
                                                className="el-button el-button--primary el-button--mini"
                                                onClick={() => {
                                                  // 🆕 Для вариантов уровня 1 сохраняем только type, без плотности (density)
                                                  const paramsToSave = {
                                                    type: editing.editingVariantParamsValue.type || '',
                                                    // Убираем density и другие поля, оставляем только type
                                                  };
                                                  
                                                  // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                                  localChanges.updateVariantParams(variant.id, paramsToSave);
                                                  editing.cancelEditingParams();
                                                }}
                                              >
                                                ✓
                                              </button>
                                              <button
                                                type="button"
                                                className="el-button el-button--text el-button--mini"
                                                onClick={editing.cancelEditingParams}
                                              >
                                                ×
                                              </button>
                                            </div>
                                          ) : (
                                            <input
                                              type="text"
                                              className="el-input__inner"
                                              value={variant.parameters.type || 'Вариант'}
                                              onClick={() => {
                                                // 🆕 Для вариантов уровня 1 передаем только type, без плотности
                                                const paramsForEditing = {
                                                  type: variant.parameters?.type || ''
                                                };
                                                editing.startEditingParams(variant.id, paramsForEditing);
                                              }}
                                              readOnly
                                              style={{ cursor: 'pointer' }}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    </td>
                                    {/* 🆕 Для вариантов уровня 1 (подтипы типа "Матовая", "Глянцевая") не показываем поля цены */}
                                    {commonRangesAsPriceRanges.map((range) => (
                                      <td key={range.minQty} style={{ padding: '8px', textAlign: 'center' }}>
                                        <span style={{ color: '#999', fontSize: '12px' }}>—</span>
                                      </td>
                                    ))}
                                    <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px', padding: 0 }}>
                                    <div className="cell">
                                      <div className="active-panel" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        <button
                                          type="button"
                                          className="el-button el-button--success el-button--small"
                                          onClick={() => {
                                            try {
                                              // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                              // 🆕 Для вариантов уровня 1 сохраняем только type, без плотности (density)
                                              const newVariant = localChanges.createVariant(typeName, { type: 'Новый тип' });
                                              editing.startEditingParams(newVariant.id, { type: 'Новый тип' });
                                            } catch (err) {
                                              console.error('Ошибка создания строки на том же уровне (уровень 1):', err);
                                              setError('Не удалось создать вариант');
                                            }
                                          }}
                                          title="Добавить строку на том же уровне"
                                        >
                                          <span style={{ fontSize: '14px' }}>↓</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="el-button el-button--success el-button--small is-plain"
                                          onClick={() => {
                                            try {
                                              // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                              // 🆕 Для подтипов сохраняем только subType, без плотности (density) и других полей
                                              const newVariant = localChanges.createVariant(typeName, {
                                                parentVariantId: variant.id,
                                                subType: '',
                                              });
                                              editing.startEditingParams(newVariant.id, { parentVariantId: variant.id, subType: '' });
                                            } catch (err) {
                                              console.error('Ошибка создания дочерней строки (уровень 2):', err);
                                              setError('Не удалось создать вариант');
                                            }
                                          }}
                                          title="Добавить дочернюю строку (уровень 2)"
                                        >
                                          <span style={{ fontSize: '14px' }}>↘</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="el-button el-button--danger el-button--small"
                                          onClick={() => {
                                            if (!confirm('Удалить этот вариант и все его дочерние варианты?')) {
                                              return;
                                            }
                                            const childVariants = level2Variants.map(v => v.id);
                                            localChanges.deleteVariant(variant.id);
                                            childVariants.forEach(id => localChanges.deleteVariant(id));
                                          }}
                                          title="Удалить строку"
                                        >
                                          <span style={{ fontSize: '14px' }}>×</span>
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* Внучатые строки - варианты уровня 2 */}
                                {level2Variants.map((level2Variant) => (
                                  <tr key={level2Variant.id} className="el-table__row el-table__row--level-2">
                                    <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
                                      <div className="cell">
                                        <span className="el-table__indent" style={{ paddingLeft: '32px' }}></span>
                                        <span className="el-table__placeholder"></span>
                                        <div style={{ width: 'calc(100% - 60px)', marginLeft: '8px', display: 'inline-block' }}>
                                          <div className="el-input el-input--small">
                                            {editing.editingVariantParams === level2Variant.id ? (
                                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <input
                                                  type="text"
                                                  className="el-input__inner"
                                                  placeholder="Подтип"
                                                  value={editing.editingVariantParamsValue.subType || ''}
                                                  onChange={(e) =>
                                                    editing.setEditingVariantParamsValue({ ...editing.editingVariantParamsValue, subType: e.target.value })
                                                  }
                                                  style={{ flex: 1 }}
                                                />
                                                <button
                                                  type="button"
                                                  className="el-button el-button--primary el-button--mini"
                                                  onClick={() => {
                                                    // 🆕 Для подтипов сохраняем только subType, без плотности (density)
                                                    const paramsToSave = {
                                                      subType: editing.editingVariantParamsValue.subType || '',
                                                      // Убираем density и другие поля, оставляем только subType
                                                    };
                                                    
                                                    // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                                    localChanges.updateVariantParams(level2Variant.id, paramsToSave);
                                                    editing.cancelEditingParams();
                                                  }}
                                                >
                                                  ✓
                                                </button>
                                                <button
                                                  type="button"
                                                  className="el-button el-button--text el-button--mini"
                                                  onClick={editing.cancelEditingParams}
                                                >
                                                  ×
                                                </button>
                                              </div>
                                            ) : (
                                              <input
                                                type="text"
                                                className="el-input__inner"
                                                value={level2Variant.parameters.subType || 'Подвариант'}
                                                onClick={() => {
                                                  // 🆕 Для подтипов передаем только subType, без плотности
                                                  const paramsForEditing = {
                                                    subType: level2Variant.parameters?.subType || ''
                                                  };
                                                  editing.startEditingParams(level2Variant.id, paramsForEditing);
                                                }}
                                                readOnly
                                                style={{ cursor: 'pointer' }}
                                              />
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    {/* 🆕 Для вариантов уровня 2 (подтипы типа "30 мк", "100 мк") показываем поля цены */}
                                    <PriceRangeCells
                                      tiers={level2Variant.tiers}
                                      commonRanges={commonRangesAsPriceRanges}
                                      onPriceChange={(minQty, newPrice) =>
                                        localChanges.changePrice(level2Variant.id, minQty, newPrice)
                                      }
                                      editable={true}
                                      hoveredRangeIndex={hoveredRangeIndex}
                                      onRangeHover={setHoveredRangeIndex}
                                    />
                                    <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px', padding: 0 }}>
                                      <div className="cell">
                                        <div className="active-panel" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                          <button
                                            type="button"
                                            className="el-button el-button--success el-button--small"
                                            onClick={() => {
                                              try {
                                                // Все изменения сохраняются локально, отправка на сервер только при нажатии "Сохранить"
                                                // 🆕 Для подтипов сохраняем только subType, без плотности (density) и других полей
                                                const newVariant = localChanges.createVariant(typeName, {
                                                  parentVariantId: level2Variant.parameters?.parentVariantId,
                                                  subType: '',
                                                });
                                                editing.startEditingParams(newVariant.id, { parentVariantId: level2Variant.parameters?.parentVariantId, subType: '' });
                                              } catch (err) {
                                                console.error('Ошибка создания строки на том же уровне (уровень 2):', err);
                                                setError('Не удалось создать вариант');
                                              }
                                            }}
                                            title="Добавить строку на том же уровне"
                                          >
                                            <span style={{ fontSize: '14px' }}>↓</span>
                                          </button>
                                          <button
                                            type="button"
                                            className="el-button el-button--danger el-button--small"
                                            onClick={() => {
                                              if (!confirm('Удалить этот вариант?')) {
                                                return;
                                              }
                                              localChanges.deleteVariant(level2Variant.id);
                                            }}
                                            title="Удалить строку"
                                          >
                                            <span style={{ fontSize: '14px' }}>×</span>
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
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
