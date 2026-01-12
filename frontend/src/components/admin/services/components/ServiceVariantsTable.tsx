/**
 * Рефакторенная версия ServiceVariantsTable
 * Использует модульную структуру с хуками и утилитами
 */

import React, { useMemo, useCallback } from 'react';
import { Button, Alert } from '../../../common';
import { PriceRangeCells, PriceRangeHeaders } from './PriceRangeCells';
import { PriceRange } from '../../../../hooks/usePriceRanges';
import { TierRangeModal } from './TierRangeModal';
import { useServiceVariants } from './hooks/useServiceVariants';
import { useVariantEditing } from './hooks/useVariantEditing';
import { useTierModal } from './hooks/useTierModal';
import { useVariantOperations } from './hooks/useVariantOperations';
import {
  groupVariantsByType,
  calculateCommonRanges,
  createVariantsIndexMap,
} from './ServiceVariantsTable.utils';
import {
  ServiceVariantsTableProps,
  VariantWithTiers,
} from './ServiceVariantsTable.types';
import '../../../../features/productTemplate/components/SimplifiedTemplateSection.css';
import './ServiceVariantsTable.css';

export const ServiceVariantsTable: React.FC<ServiceVariantsTableProps> = ({
  serviceId,
  serviceName,
}) => {
  console.log('=== ServiceVariantsTable RENDER ===');
  console.log('serviceId:', serviceId, 'serviceName:', serviceName);

  // Хуки для управления состоянием
  const { variants, setVariants, loading, error, setError, reload, invalidateCache } = useServiceVariants(serviceId);
  console.log('variants from hook:', variants);
  console.log('variants length:', variants.length);
  const editing = useVariantEditing();
  const tierModal = useTierModal();
  const operations = useVariantOperations(serviceId, variants, setVariants, setError, reload, invalidateCache);

  console.log('operations object:', operations);
  console.log('createVariant function:', operations.createVariant);

  // Вычисляем общие диапазоны
  const commonRanges = useMemo(() => calculateCommonRanges(variants), [variants]);
  const commonRangesAsPriceRanges: PriceRange[] = useMemo(() => {
    return commonRanges.map(r => ({
      minQty: r.min_qty,
      maxQty: r.max_qty,
      price: 0,
    }));
  }, [commonRanges]);

  // Группируем варианты
  const groupedVariants = useMemo(() => {
    const result = groupVariantsByType(variants);
    console.log('=== GROUPING VARIANTS ===');
    console.log('Input variants:', variants);
    console.log('Grouped result:', result);
    console.log('Type names:', Object.keys(result));
    return result;
  }, [variants]);
  const variantsIndexMap = useMemo(() => createVariantsIndexMap(variants), [variants]);
  const typeNames = useMemo(() => {
    const names = Object.keys(groupedVariants);
    console.log('Final type names:', names);
    return names;
  }, [groupedVariants]);

  // Обработчики
  const handleCreateVariant = useCallback(async () => {
    try {
      const newVariant = await operations.createVariant('Новый тип', {});
      editing.startEditingName(newVariant.id, newVariant.variantName);
    } catch (err) {
      // Ошибка уже обработана в хуке
    }
  }, [operations, editing]);

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
    } catch (err) {
      // Ошибка уже обработана в хуке
    }
  }, [tierModal, operations, setError]);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Загрузка вариантов...</div>;
  }

  return (
    <div className="service-variants-table">
      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Варианты услуги: {serviceName}</h3>
        <Button variant="primary" size="sm" onClick={async () => {
          console.log('=== MAIN BUTTON CLICK START ===');
          console.log('Main create button clicked - about to call handleCreateVariant');
          console.log('handleCreateVariant exists:', typeof handleCreateVariant);
          await handleCreateVariant();
        }}>
          + Добавить тип 
        </Button>
      </div>

      {variants.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border border-dashed rounded">
          <p>Нет вариантов. Нажмите "Добавить тип" для создания первого варианта.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="el-table el-table--fit el-table--border el-table--enable-row-hover el-table--enable-row-transition el-table--small" style={{ width: '100%' }}>
            <div className="el-table__header-wrapper">
              <table cellSpacing="0" cellPadding="0" border={0} className="el-table__header" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>
                      <div className="cell">
                        <div style={{ display: 'flex' }}>
                          <div style={{ width: '100%' }}>{serviceName}</div>
                        </div>
                      </div>
                    </th>
                    <th>
                      <div className="cell">
                        <div className="active-panel">
                          <button
                            type="button"
                            className="el-button el-button--success el-button--small"
                            onClick={async () => {
                              console.log('=== HEADER BUTTON CLICK START ===');
                              console.log('Header create button clicked - about to call handleCreateVariant');
                              console.log('handleCreateVariant exists:', typeof handleCreateVariant);
                              await handleCreateVariant();
                            }}
                            title="Добавить строку (тип)"
                            style={{ zIndex: 1000, position: 'relative' }}
                          >
                            <span style={{ fontSize: '14px' }}>↓</span>
                          </button>
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
                          operations.removeRange(rangeIndex);
                        }
                      }}
                      onAddRange={() => {
                        tierModal.openAddModal(tierModal.addRangeButtonRef.current || undefined);
                      }}
                    />
                  </tr>
                </thead>
              </table>
            </div>
            <div className="el-table__body-wrapper is-scrolling-none">
              <table cellSpacing="0" cellPadding="0" border={0} className="el-table__body" style={{ width: '100%' }}>
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
                          <td>
                            <div className="cell">
                              <div className="el-input el-input--small">
                                {editing.editingVariantName === firstVariant.id ? (
                                  <input
                                    type="text"
                                    className="el-input__inner"
                                    value={editing.editingVariantNameValue}
                                    onChange={(e) => editing.setEditingVariantNameValue(e.target.value)}
                                    onBlur={() => {
                                      if (editing.editingVariantNameValue.trim()) {
                                        operations.updateVariantName(firstVariant.id, editing.editingVariantNameValue.trim());
                                        editing.cancelEditingName();
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (editing.editingVariantNameValue.trim()) {
                                          operations.updateVariantName(firstVariant.id, editing.editingVariantNameValue.trim());
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
                          </td>
                          {commonRanges.map((_, rangeIdx) => (
                            <td key={`empty-${rangeIdx}`}>
                              <div className="cell"></div>
                            </td>
                          ))}
                          <td>
                            <div className="cell">
                              <div className="active-panel">
                                <button
                                  type="button"
                                  className="el-button el-button--success el-button--small"
                                  onClick={async () => {
                                    try {
                                      const newVariant = await operations.createVariant('Новый тип', {});
                                      editing.startEditingName(newVariant.id, newVariant.variantName);
                                    } catch (err) {
                                      console.error('Ошибка создания варианта на том же уровне:', err);
                                      // Ошибка уже обработана в хуке и отображена через setError
                                    }
                                  }}
                                  title="Добавить строку на том же уровне"
                                >
                                  <span style={{ fontSize: '14px' }}>↓</span>
                                </button>
                                <button
                                  type="button"
                                  className="el-button el-button--success el-button--small is-plain"
                                  onClick={async () => {
                                    try {
                                      const newVariant = await operations.createVariant(typeName, { type: 'Новый тип', density: 'Новая плотность' });
                                      editing.startEditingParams(newVariant.id, { type: 'Новый тип', density: 'Новая плотность' });
                                    } catch (err) {
                                      console.error('❌ Ошибка создания дочерней строки:', err);
                                      // Ошибка уже обработана в хуке и отображена через setError
                                    }
                                  }}
                                  title="Добавить дочернюю строку"
                                >
                                  <span style={{ fontSize: '14px' }}>↘</span>
                                </button>
                                <button
                                  type="button"
                                  className="el-button el-button--danger el-button--small"
                                  onClick={async () => {
                                    if (!confirm(`Удалить тип "${typeName}" и все его варианты?`)) {
                                      return;
                                    }
                                    for (const variant of allTypeVariants) {
                                      await operations.deleteVariant(variant.id);
                                    }
                                  }}
                                  title="Удалить строку"
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
                                  <td>
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
                                              <input
                                                type="text"
                                                className="el-input__inner"
                                                placeholder="Плотность (например: 32 мкм)"
                                                value={editing.editingVariantParamsValue.density || ''}
                                                onChange={(e) =>
                                                  editing.setEditingVariantParamsValue({ ...editing.editingVariantParamsValue, density: e.target.value })
                                                }
                                                style={{ flex: 1 }}
                                              />
                                              <button
                                                type="button"
                                                className="el-button el-button--primary el-button--mini"
                                                onClick={() => {
                                                  operations.updateVariantParams(variant.id, editing.editingVariantParamsValue);
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
                                              value={
                                                variant.parameters.type && variant.parameters.density
                                                  ? `${variant.parameters.type} ${variant.parameters.density}`
                                                  : variant.parameters.type || variant.parameters.density || 'Вариант'
                                              }
                                              onClick={() => editing.startEditingParams(variant.id, variant.parameters || {})}
                                              readOnly
                                              style={{ cursor: 'pointer' }}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <PriceRangeCells
                                    tiers={variant.tiers}
                                    commonRanges={commonRangesAsPriceRanges}
                                    onPriceChange={(minQty, newPrice) =>
                                      operations.changePrice(variant.id, minQty, newPrice)
                                    }
                                    editable={true}
                                  />
                                  <td>
                                    <div className="cell">
                                      <div className="active-panel">
                                        <button
                                          type="button"
                                          className="el-button el-button--success el-button--small"
                                          onClick={() => {
                                            console.log('Level 1 button clicked');
                                            const handler = async () => {
                                              try {
                                                const newVariant = await operations.createVariant(typeName, { type: 'Новый тип', density: 'Новая плотность' });
                                                editing.startEditingParams(newVariant.id, { type: 'Новый тип', density: 'Новая плотность' });
                                              } catch (err) {
                                                console.error('Ошибка создания строки на том же уровне (уровень 1):', err);
                                                // Ошибка уже обработана в хуке и отображена через setError
                                              }
                                            };
                                            handler();
                                          }}
                                          title="Добавить строку на том же уровне"
                                        >
                                          <span style={{ fontSize: '14px' }}>↓</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="el-button el-button--success el-button--small is-plain"
                                          onClick={async () => {
                                            try {
                                              const newVariant = await operations.createVariant(typeName, {
                                                ...variant.parameters,
                                                parentVariantId: variant.id,
                                                subType: '',
                                              });
                                              editing.startEditingParams(newVariant.id, { ...variant.parameters, parentVariantId: variant.id, subType: '' });
                                            } catch (err) {
                                              console.error('Ошибка создания дочерней строки (уровень 2):', err);
                                              // Ошибка уже обработана в хуке и отображена через setError
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
                                            Promise.all([
                                              operations.deleteVariant(variant.id),
                                              ...childVariants.map(id => operations.deleteVariant(id))
                                            ]);
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
                                    <td>
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
                                                    operations.updateVariantParams(level2Variant.id, editing.editingVariantParamsValue);
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
                                                onClick={() => editing.startEditingParams(level2Variant.id, level2Variant.parameters || {})}
                                                readOnly
                                                style={{ cursor: 'pointer' }}
                                              />
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <PriceRangeCells
                                      tiers={level2Variant.tiers}
                                      commonRanges={commonRangesAsPriceRanges}
                                      onPriceChange={(minQty, newPrice) =>
                                        operations.changePrice(level2Variant.id, minQty, newPrice)
                                      }
                                      editable={true}
                                    />
                                    <td>
                                      <div className="cell">
                                        <div className="active-panel">
                                          <button
                                            type="button"
                                            className="el-button el-button--success el-button--small"
                                            onClick={() => {
                                              console.log('Level 2 sibling button clicked');
                                              const handler = async () => {
                                                try {
                                                  const newVariant = await operations.createVariant(typeName, {
                                                    ...level2Variant.parameters,
                                                    subType: '',
                                                  });
                                                  editing.startEditingParams(newVariant.id, { ...level2Variant.parameters, subType: '' });
                                                } catch (err) {
                                                  console.error('Ошибка создания строки на том же уровне (уровень 2):', err);
                                                  // Ошибка уже обработана в хуке и отображена через setError
                                                }
                                              };
                                              handler();
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
                                              operations.deleteVariant(level2Variant.id);
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
  );
};
