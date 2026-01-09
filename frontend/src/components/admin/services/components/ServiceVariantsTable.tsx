import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  const handleCreateVariant = async () => {
    try {
      const newVariant = await createServiceVariant(serviceId, {
        variantName: 'Новый тип',
        parameters: {},
        sortOrder: variants.length,
        isActive: true,
      });
      setVariants([
        ...variants,
        { ...newVariant, tiers: defaultTiers().map((t) => ({ id: 0, serviceId, variantId: newVariant.id, minQuantity: t.min_qty, rate: t.unit_price, isActive: true })) },
      ]);
      // Сразу начинаем редактирование названия
      setEditingVariantName(newVariant.id);
      setEditingVariantNameValue(newVariant.variantName);
    } catch (err) {
      console.error('Ошибка создания варианта:', err);
      setError('Не удалось создать вариант');
    }
  };

  const handleUpdateVariantName = async (variantId: number, newName: string) => {
    try {
      const updated = await updateServiceVariant(serviceId, variantId, {
        variantName: newName,
      });
      setVariants(variants.map((v) => (v.id === variantId ? { ...v, ...updated } : v)));
      setEditingVariantName(null);
    } catch (err) {
      console.error('Ошибка обновления названия варианта:', err);
      setError('Не удалось обновить название варианта');
    }
  };

  const handleDeleteVariant = async (variantId: number) => {
    if (!confirm('Удалить этот вариант? Все связанные диапазоны цен будут удалены.')) {
      return;
    }
    try {
      await deleteServiceVariant(serviceId, variantId);
      setVariants(variants.filter((v) => v.id !== variantId));
    } catch (err) {
      console.error('Ошибка удаления варианта:', err);
      setError('Не удалось удалить вариант');
    }
  };

  const handleUpdateVariantParams = async (variantId: number, params: Record<string, any>) => {
    try {
      const updated = await updateServiceVariant(serviceId, variantId, {
        parameters: params,
      });
      setVariants(variants.map((v) => (v.id === variantId ? { ...v, ...updated } : v)));
      setEditingVariantParams(null);
    } catch (err) {
      console.error('Ошибка обновления параметров варианта:', err);
      setError('Не удалось обновить параметры варианта');
    }
  };

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

  const handleSaveRange = async () => {
    const boundary = Number(tierModal.boundary);
    if (!boundary || boundary < 1) {
      setError('Граница диапазона должна быть больше 0');
      return;
    }

    try {
      // Обновляем диапазоны для всех вариантов
      const updatedVariants = variants.map((variant) => {
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
      });

      setVariants(updatedVariants);
      setTierModal({ type: 'add', isOpen: false, boundary: '' });
      setError(null);
      // Перезагружаем варианты для обновления commonRanges
      await loadVariants();
    } catch (err) {
      console.error('Ошибка сохранения диапазона:', err);
      setError('Не удалось сохранить диапазон');
    }
  };

  const handleRemoveRange = async (rangeIndex: number) => {
    if (!confirm('Удалить этот диапазон для всех вариантов?')) return;
    
    const rangeToRemove = commonRanges[rangeIndex];
    if (!rangeToRemove) return;

    // Обновляем диапазоны для всех вариантов
    const updatedVariants = variants.map((variant) => {
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
    });

    setVariants(updatedVariants);
  };

  const handlePriceChange = async (variantIndex: number, rangeMinQty: number, newPrice: number) => {
    const variant = variants[variantIndex];
    const tier = variant.tiers.find((t) => t.minQuantity === rangeMinQty);
    if (!tier) {
      // Создаем новый tier для этого диапазона
      try {
        const created = await createServiceVariantTier(serviceId, variant.id, {
          minQuantity: rangeMinQty,
          rate: newPrice,
          isActive: true,
        });
        const updatedVariants = [...variants];
        updatedVariants[variantIndex] = {
          ...variant,
          tiers: [...variant.tiers, created].sort((a, b) => a.minQuantity - b.minQuantity),
        };
        setVariants(updatedVariants);
      } catch (err) {
        console.error('Ошибка создания tier:', err);
      }
      return;
    }

    const updatedVariants = [...variants];
    updatedVariants[variantIndex] = {
      ...variant,
      tiers: variant.tiers.map((t) =>
        t.minQuantity === rangeMinQty ? { ...t, rate: newPrice } : t
      ),
    };
    setVariants(updatedVariants);

    // Сохраняем на сервере
    if (tier.id > 0) {
      try {
        await updateServiceVariantTier(serviceId, variant.id, tier.id, { rate: newPrice });
      } catch (err) {
        console.error('Ошибка обновления цены:', err);
      }
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Загрузка вариантов...</div>;
  }

  // Получаем общие диапазоны из всех вариантов (объединяем все min_qty)
  const allMinQtys = new Set<number>();
  variants.forEach((v) => {
    v.tiers.forEach((t) => allMinQtys.add(t.minQuantity));
  });
  const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
  const commonRanges: Tier[] = sortedMinQtys.map((minQty, idx) => ({
    min_qty: minQty,
    max_qty: idx < sortedMinQtys.length - 1 ? sortedMinQtys[idx + 1] - 1 : undefined,
    unit_price: 0,
  }));

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
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="border px-2 py-1 text-left">Тип / Вариант</th>
                <th className="border px-2 py-1 text-left">Параметры</th>
                {commonRanges.map((range, idx) => (
                  <th key={idx} className="border px-2 py-1 text-center relative">
                    <div className="flex items-center justify-center gap-1">
                      <span>
                        {range.min_qty}
                        {range.max_qty !== undefined ? `-${range.max_qty}` : '+'}
                      </span>
                      <button
                        className="text-xs text-gray-400 hover:text-gray-600"
                        onClick={(e) => {
                          // Находим индекс диапазона в commonRanges
                          const rangeIdx = commonRanges.findIndex((r) => r.min_qty === range.min_qty);
                          handleEditRange(0, rangeIdx, e);
                        }}
                        title="Редактировать диапазон"
                      >
                        ✏️
                      </button>
                      <button
                        className="text-xs text-gray-400 hover:text-red-600"
                        onClick={() => handleRemoveRange(idx)}
                        title="Удалить диапазон"
                      >
                        🗑️
                      </button>
                    </div>
                  </th>
                ))}
                <th className="border px-2 py-1 text-center">
                  <button
                    ref={addRangeButtonRef}
                    className="text-xs text-blue-600 hover:text-blue-800"
                    onClick={(e) => handleAddRange(0, e)}
                    title="Добавить диапазон"
                  >
                    + Диапазон
                  </button>
                </th>
                <th className="border px-2 py-1 text-center">Действия</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, variantIndex) => (
                <React.Fragment key={variant.id}>
                  {/* Родительская строка - тип */}
                  <tr className="service-variants-table__parent-row">
                    <td className="border px-2 py-1 service-variants-table__parent-cell">
                      {editingVariantName === variant.id ? (
                        <input
                          className="w-full px-1 py-0.5 border rounded"
                          value={editingVariantNameValue}
                          onChange={(e) => setEditingVariantNameValue(e.target.value)}
                          onBlur={() => {
                            if (editingVariantNameValue.trim()) {
                              handleUpdateVariantName(variant.id, editingVariantNameValue.trim());
                            } else {
                              setEditingVariantName(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingVariantNameValue.trim()) {
                                handleUpdateVariantName(variant.id, editingVariantNameValue.trim());
                              }
                            } else if (e.key === 'Escape') {
                              setEditingVariantName(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => {
                            setEditingVariantName(variant.id);
                            setEditingVariantNameValue(variant.variantName);
                          }}
                        >
                          <span className="font-semibold">{variant.variantName}</span>
                          <span className="text-xs text-gray-400">✏️</span>
                        </div>
                      )}
                    </td>
                    <td className="border px-2 py-1" colSpan={commonRanges.length + 2}>
                      {editingVariantParams === variant.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 px-1 py-0.5 border rounded"
                            placeholder="Тип (например: глянец, мат)"
                            value={editingVariantParamsValue.type || ''}
                            onChange={(e) =>
                              setEditingVariantParamsValue({ ...editingVariantParamsValue, type: e.target.value })
                            }
                          />
                          <input
                            className="flex-1 px-1 py-0.5 border rounded"
                            placeholder="Плотность (например: 32 мкм)"
                            value={editingVariantParamsValue.density || ''}
                            onChange={(e) =>
                              setEditingVariantParamsValue({ ...editingVariantParamsValue, density: e.target.value })
                            }
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              handleUpdateVariantParams(variant.id, editingVariantParamsValue);
                            }}
                          >
                            Сохранить
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingVariantParams(null);
                              setEditingVariantParamsValue({});
                            }}
                          >
                            Отмена
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer text-sm text-gray-600"
                          onClick={() => {
                            setEditingVariantParams(variant.id);
                            setEditingVariantParamsValue(variant.parameters || {});
                          }}
                        >
                          <span>
                            {variant.parameters.type ? `Тип: ${variant.parameters.type}` : ''}
                            {variant.parameters.type && variant.parameters.density ? ', ' : ''}
                            {variant.parameters.density ? `Плотность: ${variant.parameters.density}` : ''}
                            {!variant.parameters.type && !variant.parameters.density ? 'Нажмите для редактирования' : ''}
                          </span>
                          <span className="text-xs">✏️</span>
                        </div>
                      )}
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <Button
                        size="sm"
                        variant="error"
                        onClick={() => handleDeleteVariant(variant.id)}
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                  {/* Дочерняя строка - варианты с ценами */}
                  <tr className="service-variants-table__child-row">
                    <td className="border px-2 py-1 service-variants-table__child-cell">
                      <span className="text-sm text-gray-600">
                        {variant.parameters.type && variant.parameters.density
                          ? `${variant.parameters.type} ${variant.parameters.density}`
                          : 'Вариант'}
                      </span>
                    </td>
                    <td className="border px-2 py-1"></td>
                    {commonRanges.map((range, rangeIdx) => {
                      const tier = variant.tiers.find(
                        (t) => t.minQuantity === range.min_qty
                      );
                      return (
                        <td key={rangeIdx} className="border px-2 py-1">
                          <input
                            type="number"
                            step="0.01"
                            className="w-full px-1 py-0.5 border rounded text-sm"
                            value={tier?.rate || 0}
                            onChange={(e) =>
                              handlePriceChange(variantIndex, range.min_qty, Number(e.target.value))
                            }
                            placeholder="0.00"
                          />
                        </td>
                      );
                    })}
                    <td className="border px-2 py-1"></td>
                    <td className="border px-2 py-1"></td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка для добавления/редактирования диапазона */}
      {tierModal.isOpen && tierModal.anchorElement && (
        <div
          ref={tierModalRef}
          className="absolute bg-white border rounded shadow-lg p-4 z-50"
          style={{
            top: tierModal.anchorElement.getBoundingClientRect().bottom + window.scrollY + 5,
            left: tierModal.anchorElement.getBoundingClientRect().left + window.scrollX,
          }}
        >
          <FormField label="Граница диапазона">
            <input
              type="number"
              min={1}
              className="w-full px-2 py-1 border rounded"
              value={tierModal.boundary}
              onChange={(e) => setTierModal({ ...tierModal, boundary: e.target.value })}
              placeholder="Введите число"
              autoFocus
            />
          </FormField>
          <div className="flex gap-2 mt-2 justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTierModal({ type: 'add', isOpen: false, boundary: '' })}
            >
              Отмена
            </Button>
            <Button size="sm" variant="primary" onClick={handleSaveRange}>
              {tierModal.type === 'add' ? 'Добавить' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

