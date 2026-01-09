import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button, Alert, FormField } from '../../../common';
import {
  ServiceVariant,
  ServiceVariantPayload,
  ServiceVolumeTier,
  ServiceVolumeTierPayload,
} from '../../../../types/pricing';
import {
  getServiceVariants,
  createServiceVariant,
  updateServiceVariant,
  deleteServiceVariant,
  getServiceVariantTiers,
  createServiceVariantTier,
  updateServiceVariantTier,
  deleteServiceVariantTier,
} from '../../../../services/pricing';
import '../../../../features/productTemplate/components/SimplifiedTemplateSection.css';
import './ServiceVariantsTable.css';

interface ServiceVariantsTableProps {
  serviceId: number;
  serviceName: string;
}

type Tier = { min_qty: number; max_qty?: number; unit_price: number };

// Утилитарные функции для работы с диапазонами (из SimplifiedTemplateSection)
const defaultTiers = (): Tier[] => [
  { min_qty: 1, max_qty: undefined, unit_price: 0 },
];

const normalizeTiers = (tiers: Tier[]): Tier[] => {
  if (tiers.length === 0) return defaultTiers();

  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);

  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i] = { ...sorted[i], max_qty: sorted[i + 1].min_qty - 1 };
  }

  if (sorted.length > 0) {
    sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], max_qty: undefined };
  }

  return sorted;
};

const addRangeBoundary = (tiers: Tier[], newBoundary: number): Tier[] => {
  if (tiers.length === 0) {
    return [
      { min_qty: 1, max_qty: newBoundary - 1, unit_price: 0 },
      { min_qty: newBoundary, max_qty: undefined, unit_price: 0 },
    ];
  }

  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  const existingBoundary = sortedTiers.find((t) => t.min_qty === newBoundary);
  if (existingBoundary) {
    return sortedTiers;
  }

  const targetIndex = sortedTiers.findIndex((t) => {
    const max = t.max_qty !== undefined ? t.max_qty + 1 : Infinity;
    return newBoundary >= t.min_qty && newBoundary < max;
  });

  if (targetIndex === -1) {
    const lastTier = sortedTiers[sortedTiers.length - 1];
    if (lastTier.max_qty === undefined) {
      const newTiers = [...sortedTiers];
      newTiers[newTiers.length - 1] = { ...lastTier, max_qty: newBoundary - 1 };
      newTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 });
      return normalizeTiers(newTiers);
    }
    sortedTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 });
    return normalizeTiers(sortedTiers);
  }

  const targetTier = sortedTiers[targetIndex];

  if (newBoundary === targetTier.min_qty) {
    return sortedTiers;
  }

  const newTiers = [...sortedTiers];
  newTiers[targetIndex] = { ...targetTier, max_qty: newBoundary - 1 };
  newTiers.splice(targetIndex + 1, 0, {
    min_qty: newBoundary,
    max_qty: targetTier.max_qty,
    unit_price: 0,
  });

  return normalizeTiers(newTiers);
};

const editRangeBoundary = (tiers: Tier[], tierIndex: number, newBoundary: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers;

  const existingBoundary = sortedTiers.find((t, i) => i !== tierIndex && t.min_qty === newBoundary);
  if (existingBoundary) {
    return sortedTiers;
  }

  const editedTier = sortedTiers[tierIndex];
  const newTiers = [...sortedTiers];

  newTiers[tierIndex] = { ...editedTier, min_qty: newBoundary };

  if (tierIndex > 0) {
    newTiers[tierIndex - 1] = { ...newTiers[tierIndex - 1], max_qty: newBoundary - 1 };
  }

  return normalizeTiers(newTiers);
};

const removeRange = (tiers: Tier[], tierIndex: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers;

  if (sortedTiers.length <= 1) {
    return sortedTiers;
  }

  const newTiers = [...sortedTiers];
  const removedTier = newTiers[tierIndex];

  if (tierIndex > 0) {
    const prevTier = newTiers[tierIndex - 1];
    newTiers[tierIndex - 1] = { ...prevTier, max_qty: removedTier.max_qty };
  } else if (tierIndex < newTiers.length - 1) {
    const nextTier = newTiers[tierIndex + 1];
    newTiers[tierIndex + 1] = { ...nextTier, min_qty: 1 };
  }

  newTiers.splice(tierIndex, 1);
  return normalizeTiers(newTiers);
};

interface VariantWithTiers extends ServiceVariant {
  tiers: ServiceVolumeTier[];
  loadingTiers?: boolean;
}

interface TierRangeModalState {
  type: 'add' | 'edit';
  isOpen: boolean;
  boundary: string;
  tierIndex?: number;
  variantIndex?: number;
  anchorElement?: HTMLElement;
}

export const ServiceVariantsTable: React.FC<ServiceVariantsTableProps> = ({
  serviceId,
  serviceName,
}) => {
  const [variants, setVariants] = useState<VariantWithTiers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingVariantName, setEditingVariantName] = useState<number | null>(null);
  const [editingVariantNameValue, setEditingVariantNameValue] = useState('');
  const [editingVariantParams, setEditingVariantParams] = useState<number | null>(null);
  const [editingVariantParamsValue, setEditingVariantParamsValue] = useState<Record<string, any>>({});
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  });
  const tierModalRef = useRef<HTMLDivElement>(null);
  const addRangeButtonRef = useRef<HTMLButtonElement>(null);

  const loadVariants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedVariants = await getServiceVariants(serviceId);
      const variantsWithTiers: VariantWithTiers[] = await Promise.all(
        loadedVariants.map(async (variant) => {
          try {
            const tiers = await getServiceVariantTiers(serviceId, variant.id);
            return { ...variant, tiers, loadingTiers: false };
          } catch (err) {
            console.error(`Ошибка загрузки tiers для варианта ${variant.id}:`, err);
            return { ...variant, tiers: [], loadingTiers: false };
          }
        })
      );
      setVariants(variantsWithTiers);
    } catch (err) {
      console.error('Ошибка загрузки вариантов:', err);
      setError('Не удалось загрузить варианты услуги');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  // Закрытие модалки при клике вне её
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tierModalRef.current && !tierModalRef.current.contains(e.target as Node)) {
        setTierModal({ type: 'add', isOpen: false, boundary: '' });
      }
    };

    if (tierModal.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [tierModal.isOpen]);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      priceChangeTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      priceChangeTimeoutRef.current.clear();
      priceChangeOriginalValuesRef.current.clear();
    };
  }, []);

  const handleCreateVariant = useCallback(async () => {
    try {
      const newVariant = await createServiceVariant(serviceId, {
        variantName: 'Новый тип',
        parameters: {},
        sortOrder: variants.length,
        isActive: true,
      });
      setVariants((prev) => [
        ...prev,
        { ...newVariant, tiers: defaultTiers().map((t) => ({ id: 0, serviceId, variantId: newVariant.id, minQuantity: t.min_qty, rate: t.unit_price, isActive: true })) },
      ]);
      // Сразу начинаем редактирование названия
      setEditingVariantName(newVariant.id);
      setEditingVariantNameValue(newVariant.variantName);
    } catch (err) {
      console.error('Ошибка создания варианта:', err);
      setError('Не удалось создать вариант');
    }
  }, [serviceId, variants.length]);

  const handleUpdateVariantName = useCallback(async (variantId: number, newName: string) => {
    try {
      const variant = variantsMap.get(variantId);
      if (!variant) return;
      const oldName = variant.variantName;
      
      // Обновляем все варианты с тем же названием типа
      const variantsToUpdate = variants.filter((v) => v.variantName === oldName);
      const updatePromises = variantsToUpdate.map((v) =>
        updateServiceVariant(serviceId, v.id, {
          variantName: newName,
          parameters: v.parameters,
        })
      );
      
      const updatedVariants = await Promise.all(updatePromises);
      const updatedMap = new Map(updatedVariants.map((v) => [v.id, v]));
      
      setVariants((prev) => prev.map((v) => {
        const updated = updatedMap.get(v.id);
        return updated ? { ...v, ...updated } : v;
      }));
      setEditingVariantName(null);
    } catch (err) {
      console.error('Ошибка обновления названия варианта:', err);
      setError('Не удалось обновить название варианта');
    }
  }, [serviceId, variants, variantsMap]);

  const handleDeleteVariant = useCallback(async (variantId: number) => {
    if (!confirm('Удалить этот вариант? Все связанные диапазоны цен будут удалены.')) {
      return;
    }
    try {
      await deleteServiceVariant(serviceId, variantId);
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch (err) {
      console.error('Ошибка удаления варианта:', err);
      setError('Не удалось удалить вариант');
    }
  }, [serviceId]);

  const handleUpdateVariantParams = useCallback(async (variantId: number, params: Record<string, any>) => {
    try {
      const variant = variantsMap.get(variantId);
      if (!variant) return;
      const updated = await updateServiceVariant(serviceId, variantId, {
        variantName: variant.variantName,
        parameters: params,
      });
      setVariants((prev) => prev.map((v) => (v.id === variantId ? { ...v, ...updated } : v)));
      setEditingVariantParams(null);
    } catch (err) {
      console.error('Ошибка обновления параметров варианта:', err);
      setError('Не удалось обновить параметры варианта');
    }
  }, [serviceId, variantsMap]);

  const handleAddRange = (variantIndex: number, e?: React.MouseEvent<HTMLButtonElement>) => {
    const anchorElement = e?.currentTarget as HTMLElement;
    setTierModal({
      type: 'add',
      isOpen: true,
      boundary: '',
      variantIndex,
      anchorElement,
    });
  };

  const handleEditRange = (variantIndex: number, rangeIndex: number, e?: React.MouseEvent<HTMLButtonElement>) => {
    const range = commonRanges[rangeIndex];
    if (!range) return;
    const anchorElement = e?.currentTarget as HTMLElement;
    setTierModal({
      type: 'edit',
      isOpen: true,
      boundary: range.min_qty.toString(),
      tierIndex: rangeIndex,
      variantIndex,
      anchorElement,
    });
  };

  const handleSaveRange = useCallback(async () => {
    const boundary = Number(tierModal.boundary);
    if (!boundary || boundary < 1) {
      setError('Граница диапазона должна быть больше 0');
      return;
    }

    try {
      // Обновляем диапазоны для всех вариантов
      setVariants((prev) => prev.map((variant) => {
        const currentTiers: Tier[] = variant.tiers.map((t) => ({
          min_qty: t.minQuantity,
          max_qty: undefined,
          unit_price: t.rate,
        }));

        let newTiers: Tier[];
        if (tierModal.type === 'add') {
          newTiers = addRangeBoundary(currentTiers, boundary);
        } else {
          if (tierModal.tierIndex === undefined) return variant;
          // Находим tier по min_qty из commonRanges
          const rangeToEdit = commonRanges[tierModal.tierIndex];
          if (!rangeToEdit) return variant;
          const tierIndex = currentTiers.findIndex((t) => t.min_qty === rangeToEdit.min_qty);
          if (tierIndex === -1) return variant;
          newTiers = editRangeBoundary(currentTiers, tierIndex, boundary);
        }

        const normalizedTiers = normalizeTiers(newTiers);
        
        // Сохраняем существующие цены для диапазонов, которые остались
        const preservedPrices = new Map<number, number>();
        variant.tiers.forEach((t) => {
          preservedPrices.set(t.minQuantity, t.rate);
        });

        return {
          ...variant,
          tiers: normalizedTiers.map((t) => ({
            id: 0, // Временный ID, будет обновлен при сохранении
            serviceId,
            variantId: variant.id,
            minQuantity: t.min_qty,
            rate: preservedPrices.get(t.min_qty) ?? t.unit_price,
            isActive: true,
          })),
        };
      }));

      setTierModal({ type: 'add', isOpen: false, boundary: '' });
      setError(null);
      // Перезагружаем варианты для обновления commonRanges
      await loadVariants();
    } catch (err) {
      console.error('Ошибка сохранения диапазона:', err);
      setError('Не удалось сохранить диапазон');
    }
  }, [tierModal, commonRanges, serviceId, loadVariants]);

  const handleRemoveRange = useCallback(async (rangeIndex: number) => {
    if (!confirm('Удалить этот диапазон для всех вариантов?')) return;
    
    const rangeToRemove = commonRanges[rangeIndex];
    if (!rangeToRemove) return;

    // Обновляем диапазоны для всех вариантов
    setVariants((prev) => prev.map((variant) => {
      const currentTiers: Tier[] = variant.tiers.map((t) => ({
        min_qty: t.minQuantity,
        max_qty: undefined,
        unit_price: t.rate,
      }));

      // Находим индекс tier для удаления
      const tierIndex = currentTiers.findIndex((t) => t.min_qty === rangeToRemove.min_qty);
      if (tierIndex === -1) return variant;

      const newTiers = removeRange(currentTiers, tierIndex);
      const normalizedTiers = normalizeTiers(newTiers);

      // Сохраняем существующие цены
      const preservedPrices = new Map<number, number>();
      variant.tiers.forEach((t) => {
        if (t.minQuantity !== rangeToRemove.min_qty) {
          preservedPrices.set(t.minQuantity, t.rate);
        }
      });

      return {
        ...variant,
        tiers: normalizedTiers
          .filter((t) => preservedPrices.has(t.min_qty))
          .map((t) => ({
            id: 0,
            serviceId,
            variantId: variant.id,
            minQuantity: t.min_qty,
            rate: preservedPrices.get(t.min_qty) ?? t.unit_price,
            isActive: true,
          })),
      };
    }));
  }, [commonRanges, serviceId]);

  // Мемоизируем обработчик изменения цены с debounce
  const priceChangeTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const priceChangeOriginalValuesRef = useRef<Map<string, number>>(new Map());
  
  const handlePriceChange = useCallback(async (variantId: number, rangeMinQty: number, newPrice: number) => {
    const variant = variantsMap.get(variantId);
    if (!variant) return;

    const tier = variant.tiers.find((t) => t.minQuantity === rangeMinQty);
    const key = `${variantId}-${rangeMinQty}`;
    
    // Сохраняем исходное значение для возможного отката
    if (!priceChangeOriginalValuesRef.current.has(key)) {
      priceChangeOriginalValuesRef.current.set(key, tier?.rate ?? 0);
    }
    
    // Оптимистичное обновление UI
    setVariants((prevVariants) => {
      const updated = prevVariants.map((v) => {
        if (v.id !== variantId) return v;
        if (!tier) {
          // Добавляем новый tier локально
          return {
            ...v,
            tiers: [...v.tiers, { id: 0, serviceId, variantId: v.id, minQuantity: rangeMinQty, rate: newPrice, isActive: true }].sort((a, b) => a.minQuantity - b.minQuantity),
          };
        }
        return {
          ...v,
          tiers: v.tiers.map((t) =>
            t.minQuantity === rangeMinQty ? { ...t, rate: newPrice } : t
          ),
        };
      });
      return updated;
    });

    // Debounce для сохранения на сервере
    const existingTimeout = priceChangeTimeoutRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        if (!tier || tier.id === 0) {
          // Создаем новый tier
          const created = await createServiceVariantTier(serviceId, variantId, {
            minQuantity: rangeMinQty,
            rate: newPrice,
            isActive: true,
          });
          setVariants((prevVariants) => {
            return prevVariants.map((v) => {
              if (v.id !== variantId) return v;
              const existingTier = v.tiers.find((t) => t.minQuantity === rangeMinQty && t.id === 0);
              if (existingTier) {
                return {
                  ...v,
                  tiers: v.tiers.map((t) => t.minQuantity === rangeMinQty && t.id === 0 ? created : t),
                };
              }
              return v;
            });
          });
        } else {
          // Обновляем существующий tier
          await updateServiceVariantTier(serviceId, variantId, tier.id, {
            minQuantity: tier.minQuantity,
            rate: newPrice,
          });
        }
        priceChangeOriginalValuesRef.current.delete(key);
      } catch (err) {
        console.error('Ошибка сохранения цены:', err);
        setError('Не удалось сохранить цену. Попробуйте еще раз.');
        // Откатываем изменения при ошибке
        const originalValue = priceChangeOriginalValuesRef.current.get(key) ?? 0;
        setVariants((prevVariants) => {
          return prevVariants.map((v) => {
            if (v.id !== variantId) return v;
            if (!tier || tier.id === 0) {
              // Если tier был новым, удаляем его
              return {
                ...v,
                tiers: v.tiers.filter((t) => !(t.minQuantity === rangeMinQty && t.id === 0)),
              };
            }
            // Восстанавливаем исходное значение
            return {
              ...v,
              tiers: v.tiers.map((t) =>
                t.minQuantity === rangeMinQty ? { ...t, rate: originalValue } : t
              ),
            };
          });
        });
        priceChangeOriginalValuesRef.current.delete(key);
      }
      priceChangeTimeoutRef.current.delete(key);
    }, 500); // 500ms debounce

    priceChangeTimeoutRef.current.set(key, timeout);
  }, [serviceId, variantsMap]);

  // Мемоизируем вычисление общих диапазонов
  const commonRanges = useMemo(() => {
    const allMinQtys = new Set<number>();
    variants.forEach((v) => {
      v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
    });
    const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
    return sortedMinQtys.map((minQty, idx) => ({
      min_qty: minQty,
      max_qty: idx < sortedMinQtys.length - 1 ? sortedMinQtys[idx + 1] - 1 : undefined,
      unit_price: 0,
    }));
  }, [variants]);

  // Мемоизируем Map для быстрого поиска вариантов по ID
  const variantsMap = useMemo(() => {
    return new Map(variants.map((v) => [v.id, v]));
  }, [variants]);

  // Мемоизируем Map для быстрого поиска индексов вариантов
  const variantsIndexMap = useMemo(() => {
    return new Map(variants.map((v, idx) => [v.id, idx]));
  }, [variants]);

  // Мемоизируем группировку вариантов по типу
  const groupedVariants = useMemo(() => {
    return variants.reduce((acc, variant) => {
      const typeName = variant.variantName;
      if (!acc[typeName]) {
        acc[typeName] = [];
      }
      acc[typeName].push(variant);
      return acc;
    }, {} as Record<string, VariantWithTiers[]>);
  }, [variants]);

  const typeNames = useMemo(() => Object.keys(groupedVariants), [groupedVariants]);

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
        <Button variant="primary" size="sm" onClick={handleCreateVariant}>
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
                          <div>
                            <span>
                              <a className="el-link el-link--default is-underline" style={{ cursor: 'pointer' }}>
                                <i className="el-icon-edit"></i>
                              </a>
                            </span>
                          </div>
                        </div>
                      </div>
                    </th>
                    <th>
                      <div className="cell">
                        <div className="active-panel">
                          <button
                            type="button"
                            className="el-button el-button--success el-button--small"
                            onClick={handleCreateVariant}
                            title="Добавить строку (тип)"
                          >
                            <span style={{ fontSize: '14px' }}>↓</span>
                          </button>
                        </div>
                      </div>
                    </th>
                    {commonRanges.map((range, idx) => {
                      const rangeLabel = range.max_qty == null ? `${range.min_qty} - ∞` : String(range.min_qty);
                      return (
                        <th key={idx} className="is-center">
                          <div className="cell">
                            <span
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setTierModal({
                                  type: 'edit',
                                  tierIndex: idx,
                                  variantIndex: 0,
                                  isOpen: true,
                                  boundary: String(range.min_qty),
                                  anchorElement: undefined,
                                });
                              }}
                            >
                              {rangeLabel}
                            </span>
                            <span>
                              <button
                                type="button"
                                className="el-button el-button--text el-button--mini"
                                style={{ color: 'red', marginLeft: '4px' }}
                                onClick={() => {
                                  handleRemoveRange(idx);
                                }}
                              >
                                ×
                              </button>
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th>
                      <div className="cell">
                        <div className="active-panel active-panel-with-popover">
                          <span>
                            <button
                              ref={addRangeButtonRef}
                              type="button"
                              className="el-button el-button--info el-button--mini is-plain"
                              style={{ width: '100%', marginLeft: '0px' }}
                              onClick={(e) => {
                                const button = e.currentTarget as HTMLElement;
                                setTierModal({
                                  type: 'add',
                                  isOpen: true,
                                  boundary: '',
                                  variantIndex: 0,
                                  anchorElement: button,
                                });
                              }}
                            >
                              <i className="el-icon-plus"></i>
                              <span>Диапазон</span>
                            </button>
                          </span>
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="el-table__body-wrapper is-scrolling-none">
              <table cellSpacing="0" cellPadding="0" border={0} className="el-table__body" style={{ width: '100%' }}>
                <tbody>
                  {typeNames.map((typeName, typeIndex) => {
                      const typeVariants = groupedVariants[typeName];
                      const firstVariant = typeVariants[0];
                      const firstVariantIndex = variantsIndexMap.get(firstVariant.id) ?? -1;
                      
                      return (
                        <React.Fragment key={typeName}>
                          {/* Родительская строка - тип */}
                          <tr className="el-table__row expanded">
                            <td>
                              <div className="cell">
                                <div className="el-input el-input--small">
                                  {editingVariantName === firstVariant.id ? (
                                    <input
                                      type="text"
                                      className="el-input__inner"
                                      value={editingVariantNameValue}
                                      onChange={(e) => setEditingVariantNameValue(e.target.value)}
                                      onBlur={() => {
                                        if (editingVariantNameValue.trim()) {
                                          handleUpdateVariantName(firstVariant.id, editingVariantNameValue.trim());
                                        } else {
                                          setEditingVariantName(null);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          if (editingVariantNameValue.trim()) {
                                            handleUpdateVariantName(firstVariant.id, editingVariantNameValue.trim());
                                          }
                                        } else if (e.key === 'Escape') {
                                          setEditingVariantName(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      className="el-input__inner"
                                      value={typeName}
                                      onClick={() => {
                                        setEditingVariantName(firstVariant.id);
                                        setEditingVariantNameValue(typeName);
                                      }}
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
                                      // Создаем новую строку (тип) на том же уровне
                                      try {
                                        const newVariant = await createServiceVariant(serviceId, {
                                          variantName: 'Новый тип',
                                          parameters: {},
                                          sortOrder: variants.length,
                                          isActive: true,
                                        });
                                        const newVariantWithTiers: VariantWithTiers = {
                                          ...newVariant,
                                          tiers: defaultTiers().map((t) => ({
                                            id: 0,
                                            serviceId,
                                            variantId: newVariant.id,
                                            minQuantity: t.min_qty,
                                            rate: t.unit_price,
                                            isActive: true,
                                          })),
                                        };
                                        setVariants([...variants, newVariantWithTiers]);
                                        setEditingVariantName(newVariant.id);
                                        setEditingVariantNameValue(newVariant.variantName);
                                      } catch (err) {
                                        console.error('Ошибка создания строки:', err);
                                        setError('Не удалось создать строку');
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
                                      // Создаем дочернюю строку (вариант) для этого типа
                                      try {
                                        const newVariant = await createServiceVariant(serviceId, {
                                          variantName: typeName, // Тот же тип
                                          parameters: { type: '', density: '' },
                                          sortOrder: variants.length,
                                          isActive: true,
                                        });
                                        const newVariantWithTiers: VariantWithTiers = {
                                          ...newVariant,
                                          tiers: defaultTiers().map((t) => ({
                                            id: 0,
                                            serviceId,
                                            variantId: newVariant.id,
                                            minQuantity: t.min_qty,
                                            rate: t.unit_price,
                                            isActive: true,
                                          })),
                                        };
                                        setVariants([...variants, newVariantWithTiers]);
                                        setEditingVariantParams(newVariant.id);
                                        setEditingVariantParamsValue({ type: '', density: '' });
                                      } catch (err) {
                                        console.error('Ошибка создания дочерней строки:', err);
                                        setError('Не удалось создать дочернюю строку');
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
                                      // Удаляем все варианты этого типа
                                      if (!confirm(`Удалить тип "${typeName}" и все его варианты?`)) {
                                        return;
                                      }
                                      for (const variant of typeVariants) {
                                        await handleDeleteVariant(variant.id);
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
                          
                          {/* Дочерние строки - варианты этого типа */}
                          {typeVariants.map((variant, subVariantIndex) => {
                            const variantIndex = variantsIndexMap.get(variant.id) ?? -1;
                            return (
                              <tr key={variant.id} className="el-table__row el-table__row--level-0">
                                <td>
                                  <div className="cell">
                                    <span className="el-table__indent" style={{ paddingLeft: '16px' }}></span>
                                    <div className="el-table__expand-icon el-table__expand-icon--expanded">
                                      <i className="el-icon-arrow-right"></i>
                                    </div>
                                    <div style={{ width: 'calc(100% - 44px)', marginLeft: '5px', display: 'inline-block' }}>
                                      <div className="el-input el-input--small">
                                        {editingVariantParams === variant.id ? (
                                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <input
                                              type="text"
                                              className="el-input__inner"
                                              placeholder="Тип (например: глянец, мат)"
                                              value={editingVariantParamsValue.type || ''}
                                              onChange={(e) =>
                                                setEditingVariantParamsValue({ ...editingVariantParamsValue, type: e.target.value })
                                              }
                                              style={{ flex: 1 }}
                                            />
                                            <input
                                              type="text"
                                              className="el-input__inner"
                                              placeholder="Плотность (например: 32 мкм)"
                                              value={editingVariantParamsValue.density || ''}
                                              onChange={(e) =>
                                                setEditingVariantParamsValue({ ...editingVariantParamsValue, density: e.target.value })
                                              }
                                              style={{ flex: 1 }}
                                            />
                                            <button
                                              type="button"
                                              className="el-button el-button--primary el-button--mini"
                                              onClick={() => {
                                                handleUpdateVariantParams(variant.id, editingVariantParamsValue);
                                              }}
                                            >
                                              ✓
                                            </button>
                                            <button
                                              type="button"
                                              className="el-button el-button--text el-button--mini"
                                              onClick={() => {
                                                setEditingVariantParams(null);
                                                setEditingVariantParamsValue({});
                                              }}
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
                                            onClick={() => {
                                              setEditingVariantParams(variant.id);
                                              setEditingVariantParamsValue(variant.parameters || {});
                                            }}
                                            readOnly
                                            style={{ cursor: 'pointer' }}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {commonRanges.map((range, rangeIdx) => {
                                  const tier = variant.tiers.find(
                                    (t) => t.minQuantity === range.min_qty
                                  );
                                  return (
                                    <td key={`${variant.id}-${range.min_qty}`}>
                                      <div className="cell">
                                        <div className="el-input el-input--small">
                                          <input
                                            type="text"
                                            className="el-input__inner"
                                            value={String(tier?.rate || 0)}
                                            onChange={(e) =>
                                              handlePriceChange(variant.id, range.min_qty, Number(e.target.value))
                                            }
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                                <td>
                                  <div className="cell">
                                    <div className="active-panel">
                                      <button
                                        type="button"
                                        className="el-button el-button--success el-button--small"
                                        onClick={async () => {
                                          // Создаем новую строку на том же уровне (вариант того же типа)
                                          try {
                                            const newVariant = await createServiceVariant(serviceId, {
                                              variantName: typeName, // Тот же тип
                                              parameters: { type: '', density: '' },
                                              sortOrder: variants.length,
                                              isActive: true,
                                            });
                                            const newVariantWithTiers: VariantWithTiers = {
                                              ...newVariant,
                                              tiers: defaultTiers().map((t) => ({
                                                id: 0,
                                                serviceId,
                                                variantId: newVariant.id,
                                                minQuantity: t.min_qty,
                                                rate: t.unit_price,
                                                isActive: true,
                                              })),
                                            };
                                            setVariants([...variants, newVariantWithTiers]);
                                            setEditingVariantParams(newVariant.id);
                                            setEditingVariantParamsValue({ type: '', density: '' });
                                          } catch (err) {
                                            console.error('Ошибка создания строки:', err);
                                            setError('Не удалось создать строку');
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
                                          // Создаем новый тип (родительскую строку) - текущая строка становится родительской
                                          try {
                                            // Сначала создаем новый тип с параметрами текущего варианта
                                            const newTypeName = variant.parameters.type && variant.parameters.density
                                              ? `${variant.parameters.type} ${variant.parameters.density}`
                                              : variant.parameters.type || variant.parameters.density || 'Новый тип';
                                            
                                            const newVariant = await createServiceVariant(serviceId, {
                                              variantName: newTypeName,
                                              parameters: {},
                                              sortOrder: variants.length,
                                              isActive: true,
                                            });
                                            const newVariantWithTiers: VariantWithTiers = {
                                              ...newVariant,
                                              tiers: defaultTiers().map((t) => ({
                                                id: 0,
                                                serviceId,
                                                variantId: newVariant.id,
                                                minQuantity: t.min_qty,
                                                rate: t.unit_price,
                                                isActive: true,
                                              })),
                                            };
                                            setVariants([...variants, newVariantWithTiers]);
                                            setEditingVariantName(newVariant.id);
                                            setEditingVariantNameValue(newVariant.variantName);
                                          } catch (err) {
                                            console.error('Ошибка создания нового типа:', err);
                                            setError('Не удалось создать новый тип');
                                          }
                                        }}
                                        title="Создать новый уровень вложенности (строка становится родительской)"
                                      >
                                        <span style={{ fontSize: '14px' }}>↘</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="el-button el-button--danger el-button--small"
                                        onClick={() => {
                                          if (!confirm('Удалить этот вариант?')) {
                                            return;
                                          }
                                          handleDeleteVariant(variant.id);
                                        }}
                                        title="Удалить строку"
                                      >
                                        <span style={{ fontSize: '14px' }}>×</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Модалка для добавления/редактирования диапазона */}
      {tierModal.isOpen && (
        <div
          ref={tierModalRef}
          className="simplified-tier-modal"
          style={
            tierModal.anchorElement
              ? {
                  position: 'absolute',
                  top: `${tierModal.anchorElement.getBoundingClientRect().bottom + 5}px`,
                  left: `${tierModal.anchorElement.getBoundingClientRect().left}px`,
                  zIndex: 2003,
                }
              : {
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 2003,
                }
          }
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="simplified-tier-modal__content" onClick={(e) => e.stopPropagation()}>
            <div className="simplified-tier-modal__header">
              <strong>{tierModal.type === 'add' ? 'Добавить диапазон' : 'Редактировать диапазон'}</strong>
              <button
                type="button"
                className="simplified-tier-modal__close"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setTierModal({ type: 'add', isOpen: false, boundary: '' });
                }}
                title="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="simplified-tier-modal__body">
              <FormField label="Граница диапазона">
                <input
                  className="form-input form-input--compact"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Граница диапазона"
                  value={tierModal.boundary}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setTierModal({ ...tierModal, boundary: e.target.value })
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  autoFocus
                />
              </FormField>
              <div className="simplified-tier-modal__actions" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    setTierModal({ type: 'add', isOpen: false, boundary: '' });
                  }}
                >
                  Отменить
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e?.stopPropagation();
                    handleSaveRange();
                  }}
                >
                  {tierModal.type === 'add' ? 'Добавить' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

