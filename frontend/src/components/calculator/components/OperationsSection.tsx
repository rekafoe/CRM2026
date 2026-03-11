import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { getServiceVariants } from '../../../services/pricing/api';
import type { ServiceVariant } from '../../../types/pricing';

interface Operation {
  id?: number;
  operation_id?: number;
  operation_name?: string;
  name?: string;
  is_required?: boolean | number;
  is_optional?: boolean | number;
  is_default?: boolean | number;
  parameters?: string | any; // JSON строка или объект
  linked_parameter_name?: string;
  operation_type?: string; // Тип операции (например, 'laminate')
  min_quantity?: number;
  max_quantity?: number;
}

interface OperationsSectionProps {
  backendProductSchema: any;
  specs: Record<string, any>;
  updateSpecs: (updates: Record<string, any>, instant?: boolean) => void;
}

interface SelectedOperation {
  operationId: number;
  subtype?: string; // Подтип (например, "глянец 32 мк")
  variantId?: number; // ID варианта (типа) для услуг с вариантами (например, ламинация)
  quantity?: number;
}

export const OperationsSection: React.FC<OperationsSectionProps> = ({
  backendProductSchema,
  specs,
  updateSpecs,
}) => {
  // Получаем операции из схемы — показываем ВСЕ (включая обязательные),
  // чтобы пользователь видел операции, включённые по умолчанию для подтипа (например, «биговка с фальцовкой»)
  const operations = useMemo(() => {
    if (!backendProductSchema?.operations || !Array.isArray(backendProductSchema.operations)) {
      return [];
    }
    return backendProductSchema.operations;
  }, [backendProductSchema?.operations]);

  // 🆕 Состояние для вариантов услуг (типы и подтипы)
  const [serviceVariants, setServiceVariants] = useState<Map<number, ServiceVariant[]>>(new Map());
  const [loadingVariants, setLoadingVariants] = useState<Set<number>>(new Set());

  // Получаем выбранные операции из specs
  const selectedOperations = useMemo(() => {
    const ops = specs.selectedOperations || [];
    return Array.isArray(ops) ? ops : [];
  }, [specs.selectedOperations]);

  // 🆕 Загружаем варианты для операций, которые их поддерживают (например, ламинация)
  useEffect(() => {
    const loadVariantsForOperations = async () => {
      console.log('🔍 [OperationsSection] Начинаем загрузку вариантов', {
        operationsCount: operations.length,
        operations: operations.map((op: Operation) => ({
          id: op.operation_id || op.id,
          name: op.operation_name || op.name,
          type: op.operation_type,
          parameters: op.parameters
        }))
      });

      const operationsToLoad = operations.filter((op: Operation) => {
        const operationId = op.operation_id || op.id;
        if (!operationId) return false;
        
        // 🆕 Проверяем несколько условий для определения операций с вариантами:
        // 1. Тип операции 'laminate'
        // 2. Название операции содержит "Ламинация" или "lamination" (case-insensitive)
        // 3. В parameters указано, что есть варианты
        const opType = op.operation_type || (op.parameters && typeof op.parameters === 'object' ? op.parameters.operation_type : null);
        const operationName = (op.operation_name || op.name || '').toLowerCase();
        const isLamination = operationName.includes('ламинация') || operationName.includes('lamination');
        const hasVariantsFlag = op.parameters && typeof op.parameters === 'object' && op.parameters.hasVariants;
        
        const shouldLoad = opType === 'laminate' || isLamination || hasVariantsFlag;
        
        console.log('🔍 [OperationsSection] Проверка операции для загрузки вариантов', {
          operationId,
          operationName: op.operation_name || op.name,
          opType,
          isLamination,
          hasVariantsFlag,
          shouldLoad,
          hasParameters: !!op.parameters,
          parametersType: typeof op.parameters
        });
        
        return shouldLoad;
      });

      console.log('🔍 [OperationsSection] Операции для загрузки вариантов', {
        count: operationsToLoad.length,
        operations: operationsToLoad.map((op: Operation) => ({
          id: op.operation_id || op.id,
          name: op.operation_name || op.name
        }))
      });

      for (const op of operationsToLoad) {
        const operationId = op.operation_id || op.id;
        if (!operationId || serviceVariants.has(operationId) || loadingVariants.has(operationId)) {
          console.log('🔍 [OperationsSection] Пропускаем операцию (уже загружена или загружается)', { operationId });
          continue;
        }

        console.log('🔍 [OperationsSection] Загружаем варианты для операции', { operationId, name: op.operation_name || op.name });
        setLoadingVariants(prev => new Set(prev).add(operationId));
        try {
          const variants = await getServiceVariants(operationId);
          console.log('🔍 [OperationsSection] Варианты загружены', {
            operationId,
            variantsCount: variants.length,
            variants: variants.map(v => ({ id: v.id, name: v.variantName, active: v.isActive }))
          });
          setServiceVariants(prev => {
            const next = new Map(prev);
            next.set(operationId, variants.filter(v => v.isActive));
            return next;
          });
        } catch (error) {
          console.error(`❌ [OperationsSection] Ошибка загрузки вариантов для операции ${operationId}:`, error);
        } finally {
          setLoadingVariants(prev => {
            const next = new Set(prev);
            next.delete(operationId);
            return next;
          });
        }
      }
    };

    if (operations.length > 0) {
      void loadVariantsForOperations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations.length]); // Загружаем только при изменении количества операций

  // Мемоизируем карту операций с подтипами для производительности
  const operationsWithSubtypes = useMemo(() => {
    return operations.map((operation: Operation) => {
      let subtypes: Array<{ value: string; label: string }> = [];
      
      if (operation.parameters) {
        try {
          const params = typeof operation.parameters === 'string' 
            ? JSON.parse(operation.parameters) 
            : operation.parameters;
          
          // Ищем поле с подтипами (например, для ламинации: matte, glossy)
          if (params.subtypes && Array.isArray(params.subtypes)) {
            subtypes = params.subtypes.map((st: string | { value: string; label: string }) => {
              if (typeof st === 'string') {
                return { value: st, label: st };
              }
              return st;
            });
          } else if (params.options && Array.isArray(params.options)) {
            subtypes = params.options.map((opt: string | { value: string; label: string }) => {
              if (typeof opt === 'string') {
                return { value: opt, label: opt };
              }
              return opt;
            });
          } else if (params.enum && Array.isArray(params.enum)) {
            subtypes = params.enum.map((opt: string | { value: string; label: string }) => {
              if (typeof opt === 'string') {
                return { value: opt, label: opt };
              }
              return opt;
            });
          }
        } catch (e) {
          console.warn('Ошибка парсинга параметров операции:', e);
        }
      }
      
      return { operation, subtypes };
    });
  }, [operations]);

  const operationLimits = useMemo(() => {
    const limits = new Map<number, { min: number; max?: number }>();
    const ops = backendProductSchema?.operations;
    if (!Array.isArray(ops)) return limits;
    ops.forEach((op: Operation) => {
      const opId = Number(op.operation_id || op.id);
      if (!Number.isFinite(opId)) return;
      const minQty = Number((op as any).min_quantity ?? 1);
      const maxQtyRaw = (op as any).max_quantity;
      const maxQty = maxQtyRaw !== undefined && maxQtyRaw !== null ? Number(maxQtyRaw) : undefined;
      limits.set(opId, { min: Number.isFinite(minQty) ? minQty : 1, max: Number.isFinite(maxQty) ? maxQty : undefined });
    });
    return limits;
  }, [backendProductSchema?.operations]);

  const clampOperationQuantity = useCallback((operationId: number, quantity: number) => {
    const limits = operationLimits.get(operationId);
    const minQty = limits?.min ?? 1;
    const maxQty = limits?.max;
    let next = Math.max(minQty, quantity);
    if (maxQty !== undefined) {
      next = Math.min(maxQty, next);
    }
    return next;
  }, [operationLimits]);

  // Мемоизируем карту выбранных операций для быстрого доступа
  const selectedOperationsMap = useMemo(() => {
    const map = new Map<number, SelectedOperation>();
    selectedOperations.forEach((op: SelectedOperation) => {
      map.set(op.operationId, op);
    });
    return map;
  }, [selectedOperations]);

  // Проверяем, выбрана ли операция (мемоизированная версия)
  const isOperationSelected = useCallback((operationId: number): boolean => {
    return selectedOperationsMap.has(operationId);
  }, [selectedOperationsMap]);

  // Получаем данные выбранной операции (мемоизированная версия)
  const getSelectedOperationData = useCallback((operationId: number): SelectedOperation | null => {
    return selectedOperationsMap.get(operationId) || null;
  }, [selectedOperationsMap]);

  // Переключаем выбор операции (мемоизированная версия)
  const toggleOperation = useCallback((operation: Operation) => {
    const operationId = operation.operation_id || operation.id;
    if (!operationId) return;

    const isSelected = selectedOperationsMap.has(operationId);
    const currentOps = [...selectedOperations];

    if (isSelected) {
      // Удаляем операцию
      const filtered = currentOps.filter((op: SelectedOperation) => op.operationId !== operationId);
      updateSpecs({ selectedOperations: filtered }, true);
    } else {
      // Добавляем операцию с дефолтными значениями
      const variants = serviceVariants.get(operationId) || [];
      const hasVariants = variants.length > 0;
      const minQuantity = Number(operationLimits.get(operationId)?.min ?? operation.min_quantity ?? 1);
      
      let newOp: SelectedOperation = {
        operationId,
        quantity: clampOperationQuantity(operationId, 1),
      };
      
      if (hasVariants) {
        const typeVariants = variants.filter(
          (v) => v.parameters?.type && !v.parameters?.parentVariantId
        );
        if (typeVariants.length > 0) {
          const firstType = typeVariants[0];
          const subtypeVariants = variants.filter(
            (v) => v.parameters?.parentVariantId === firstType.id
          );
          const firstSubtype = subtypeVariants[0];
          const subtypeLabel =
            firstSubtype?.parameters?.subType ||
            firstSubtype?.parameters?.density ||
            firstSubtype?.parameters?.type;
          newOp.variantId = firstSubtype?.id ?? firstType.id;
          if (subtypeLabel) {
            newOp.subtype = String(subtypeLabel);
          }
        } else {
          // Если нет иерархии, выбираем первый вариант и первый подтип
          const firstVariant = variants[0];
          const firstSubtype = firstVariant?.parameters?.subtypes?.[0];
          newOp.variantId = firstVariant.id;
          if (firstSubtype) {
            newOp.subtype = typeof firstSubtype === 'string' ? firstSubtype : firstSubtype.value;
          }
        }
      } else {
        // Старая логика: подтипы из parameters
        const opWithSubtypes = operationsWithSubtypes.find((item: { operation: Operation; subtypes: Array<{ value: string; label: string }> }) => 
          (item.operation.operation_id || item.operation.id) === operationId
        );
        const subtypes = opWithSubtypes?.subtypes || [];
        if (subtypes.length > 0) {
          newOp.subtype = subtypes[0].value;
        }
      }
      
      const nextUpdates: Record<string, any> = {
        selectedOperations: [...currentOps, newOp],
      };
      if (Number.isFinite(minQuantity) && minQuantity > 1 && specs.quantity < minQuantity) {
        nextUpdates.quantity = minQuantity;
      }
      updateSpecs(nextUpdates, true);
    }
  }, [selectedOperations, selectedOperationsMap, operationsWithSubtypes, serviceVariants, updateSpecs, specs.quantity, clampOperationQuantity, operationLimits]);

  // Обновляем подтип операции (мемоизированная версия)
  const updateOperationSubtype = useCallback((operationId: number, subtype: string) => {
    const updated = selectedOperations.map((op: SelectedOperation) => {
      if (op.operationId === operationId) {
        return { ...op, subtype };
      }
      return op;
    });
    updateSpecs({ selectedOperations: updated }, true);
  }, [selectedOperations, updateSpecs]);

  // Обновляем количество операции (мемоизированная версия)
    const updateOperationQuantity = useCallback((operationId: number, quantity?: number) => {
    const updated = selectedOperations.map((op: SelectedOperation) => {
      if (op.operationId === operationId) {
        if (!Number.isFinite(quantity)) {
          return { ...op, quantity: undefined };
        }
        return { ...op, quantity: clampOperationQuantity(operationId, Number(quantity)) };
      }
      return op;
    });
    updateSpecs({ selectedOperations: updated }, true);
  }, [selectedOperations, updateSpecs, clampOperationQuantity]);

  // 🆕 Логирование для отладки
  useEffect(() => {
    console.log('🔍 [OperationsSection] Рендер компонента', {
      operationsCount: operations.length,
      operationsWithSubtypesCount: operationsWithSubtypes.length,
      serviceVariantsCount: serviceVariants.size,
      selectedOperationsCount: selectedOperations.length,
      backendSchema: {
        hasOperations: !!backendProductSchema?.operations,
        operationsCount: backendProductSchema?.operations?.length || 0
      }
    });
  }, [operations.length, operationsWithSubtypes.length, serviceVariants.size, selectedOperations.length, backendProductSchema?.operations]);

  if (operations.length === 0) {
    console.log('🔍 [OperationsSection] Нет операций для отображения');
    return null;
  }

  return (
    <div className="form-section compact operations-section">
      <h3>🔧 Операции</h3>
      <div className="advanced-grid compact operations-grid">
        {operationsWithSubtypes.map(({ operation, subtypes }: { operation: Operation; subtypes: Array<{ value: string; label: string }> }) => {
          const operationId = operation.operation_id || operation.id;
          if (!operationId) return null;

          const operationName = operation.operation_name || operation.name || 'Операция';
          const isSelected = isOperationSelected(operationId);
          const selectedData = getSelectedOperationData(operationId);
          const limits = operationLimits.get(operationId);

          return (
            <div key={operationId} className="param-group operation-group">
              <div className={`operation-header ${isSelected ? 'operation-header--expanded' : ''}`}>
                <label className="operation-label">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOperation(operation)}
                    className="operation-checkbox"
                  />
                  <span className="operation-name">{operationName}</span>
                </label>
                {limits && (
                  <span className="operation-limits">
                    {'\u00A0'}от {limits.min}{limits.max !== undefined ? ` до ${limits.max}` : ''}
                  </span>
                )}
              </div>

              {isSelected && (() => {
                // 🆕 Проверяем, есть ли варианты для этой операции (например, ламинация)
                const allVariants = serviceVariants.get(operationId) || [];
                const hasVariants = allVariants.length > 0;
                
                // Если есть варианты, группируем их по типам/подтипам
                if (hasVariants) {
                  const typeVariants = allVariants.filter(
                    (v) => v.parameters?.type && !v.parameters?.parentVariantId
                  );
                  const hasTypeHierarchy = typeVariants.length > 0;
                  const uniqueTypes = hasTypeHierarchy
                    ? Array.from(new Map(typeVariants.map(v => [v.parameters?.type, v])).values())
                    : Array.from(new Map(allVariants.map(v => [v.variantName, v])).values());
                  
                  // 🆕 Находим выбранный тип по variantId или используем первый
                  const selectedVariantId = selectedData?.variantId;
                  let selectedVariant = allVariants.find(v => v.id === selectedVariantId);
                  
                  // Если вариант не найден, но есть выбранный subtype, пытаемся найти вариант по subtype
                  if (!selectedVariant && selectedData?.subtype) {
                    selectedVariant = allVariants.find(v => {
                      const subtypeLabel =
                        v.parameters?.subType ||
                        v.parameters?.density ||
                        v.parameters?.type;
                      return subtypeLabel === selectedData.subtype;
                    });
                  }
                  
                  const selectedTypeVariant = hasTypeHierarchy
                    ? (selectedVariant?.parameters?.parentVariantId
                      ? allVariants.find(v => v.id === selectedVariant?.parameters?.parentVariantId)
                      : typeVariants.find(v => v.id === selectedVariant?.id)) || typeVariants[0]
                    : selectedVariant || uniqueTypes[0];

                  // 🆕 Определяем выбранный тип: из выбранного варианта или первый доступный
                  const selectedTypeName = hasTypeHierarchy
                    ? selectedTypeVariant?.parameters?.type || selectedTypeVariant?.variantName || ''
                    : selectedTypeVariant?.variantName || '';
                  
                  // 🆕 Собираем все подтипы ТОЛЬКО из вариантов выбранного типа
                  const variantsOfSelectedType = hasTypeHierarchy
                    ? allVariants.filter(v => v.parameters?.parentVariantId === selectedTypeVariant?.id)
                    : allVariants.filter(v => v.variantName === selectedTypeName);
                  
                  // 🆕 Детальное логирование для отладки
                  const firstVariant = variantsOfSelectedType[0];
                  console.log('🔍 [OperationsSection] Варианты выбранного типа', {
                    selectedTypeName,
                    variantsOfSelectedTypeCount: variantsOfSelectedType.length,
                    firstVariant: firstVariant ? {
                      id: firstVariant.id,
                      name: firstVariant.variantName,
                      hasParameters: !!firstVariant.parameters,
                      parametersType: typeof firstVariant.parameters,
                      parametersKeys: firstVariant.parameters ? Object.keys(firstVariant.parameters) : [],
                      fullParameters: firstVariant.parameters, // 🆕 Полные parameters для анализа
                      hasSubtypes: !!(firstVariant.parameters?.subtypes),
                      subtypesCount: firstVariant.parameters?.subtypes?.length || 0,
                      subtypes: firstVariant.parameters?.subtypes
                    } : null,
                    sampleVariants: variantsOfSelectedType.slice(0, 5).map(v => ({
                      id: v.id,
                      name: v.variantName,
                      parametersKeys: v.parameters ? Object.keys(v.parameters) : []
                    }))
                  });
                  
                  // 🆕 Подтипы формируются из parameters.subType / density
                  const allSubtypes = variantsOfSelectedType
                    .filter(v => {
                      return v.parameters?.subType || v.parameters?.density || v.parameters?.type;
                    })
                    .map(v => {
                      const subtypeLabel =
                        v.parameters?.subType ||
                        v.parameters?.density ||
                        v.parameters?.type ||
                        `Вариант ${v.id}`;
                      const subtypeValue = subtypeLabel; // Используем label как value
                      
                      return {
                        value: subtypeValue,
                        label: subtypeLabel,
                        variantId: v.id // Сохраняем variantId для каждого подтипа
                      };
                    });
                  
                  // 🆕 Дедуплицируем подтипы по value
                  const uniqueSubtypes = Array.from(
                    new Map(allSubtypes.map(st => [st.value, st])).values()
                  );
                  
                  console.log('🔍 [OperationsSection] Отображение подтипов для ламинации', {
                    operationId,
                    selectedTypeName,
                    variantsOfSelectedTypeCount: variantsOfSelectedType.length,
                    allSubtypesCount: allSubtypes.length,
                    uniqueSubtypesCount: uniqueSubtypes.length,
                    uniqueSubtypes,
                    variantsOfSelectedType: variantsOfSelectedType.map(v => ({
                      id: v.id,
                      name: v.variantName,
                      subtypes: v.parameters?.subtypes
                    }))
                  });
                  
                  return (
                    <div className="operation-fields">
                      {/* 🆕 1-й уровень: Селектор типа ламинации */}
                      <div className="param-group">
                        <label className="operation-field-label">
                          1. Тип ламинации:
                        </label>
                        <select
                          value={selectedTypeName || uniqueTypes[0]?.variantName || ''}
                          onChange={(e) => {
                            const newTypeName = e.target.value;
                            const nextTypeVariant = hasTypeHierarchy
                              ? typeVariants.find(v => v.parameters?.type === newTypeName) || typeVariants[0]
                              : uniqueTypes.find(v => v.variantName === newTypeName) || uniqueTypes[0];
                            const variantsOfNewType = hasTypeHierarchy
                              ? allVariants.filter(v => v.parameters?.parentVariantId === nextTypeVariant?.id)
                              : allVariants.filter(v => v.variantName === newTypeName);
                            const firstVariantOfType = variantsOfNewType[0];
                            let firstSubtypeValue: string | undefined;
                            if (firstVariantOfType) {
                              firstSubtypeValue =
                                firstVariantOfType.parameters?.subType ||
                                firstVariantOfType.parameters?.density ||
                                firstVariantOfType.parameters?.type;
                            }
                            
                            updateSpecs({
                              selectedOperations: selectedOperations.map((op: SelectedOperation) => {
                                if (op.operationId === operationId) {
                                  return {
                                    ...op,
                                    variantId: firstVariantOfType?.id ?? nextTypeVariant?.id,
                                    subtype: firstSubtypeValue || undefined,
                                  };
                                }
                                return op;
                              }),
                            }, true);
                          }}
                          className="form-control operation-select"
                        >
                          {uniqueTypes.map((variant) => {
                            const label = hasTypeHierarchy
                              ? variant.parameters?.type || variant.variantName
                              : variant.variantName;
                            return (
                              <option key={variant.id} value={label}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      
                      {/* 🆕 2-й уровень: Селектор плотности */}
                      {uniqueSubtypes.length > 0 ? (
                        <div className="param-group">
                          <label className="operation-field-label">
                            2. Плотность:
                          </label>
                          <select
                            value={selectedData?.subtype || uniqueSubtypes[0]?.value || ''}
                            onChange={(e) => {
                              const newSubtypeValue = e.target.value;
                              // Находим подтип и его variantId
                              const selectedSubtype = uniqueSubtypes.find(st => st.value === newSubtypeValue);
                              updateSpecs({
                                selectedOperations: selectedOperations.map((op: SelectedOperation) => {
                                  if (op.operationId === operationId) {
                                    return {
                                      ...op,
                                      variantId: selectedSubtype?.variantId || op.variantId, // Обновляем variantId при выборе подтипа
                                      subtype: newSubtypeValue,
                                    };
                                  }
                                  return op;
                                }),
                              }, true);
                            }}
                            className="form-control operation-select"
                          >
                            {uniqueSubtypes.map((st) => (
                              <option key={st.value} value={st.value}>
                                {st.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="operation-empty-note">
                          Подтипы не найдены для выбранного типа
                        </div>
                      )}

                      {/* Поле количества */}
                      <div className="param-group">
                        <label className="operation-field-label">Количество:</label>
                    <div className="quantity-controls">
                      <button
                        type="button"
                        className="quantity-btn quantity-btn-minus"
                        onClick={() => {
                          const minQty = limits?.min ?? 1;
                          const currentQty = Number.isFinite(selectedData?.quantity)
                            ? Number(selectedData?.quantity)
                            : minQty;
                          updateOperationQuantity(operationId, currentQty - 1);
                        }}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={selectedData?.quantity ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateOperationQuantity(operationId, raw === '' ? undefined : Number(raw));
                        }}
                        min={limits?.min ?? 1}
                        max={limits?.max}
                        className="quantity-input"
                      />
                      <button
                        type="button"
                        className="quantity-btn quantity-btn-plus"
                        onClick={() => {
                          const minQty = limits?.min ?? 1;
                          const currentQty = Number.isFinite(selectedData?.quantity)
                            ? Number(selectedData?.quantity)
                            : minQty;
                          updateOperationQuantity(operationId, currentQty + 1);
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                    </div>
                  );
                }
                
                // Если нет вариантов, используем старую логику с подтипами из parameters
                return (
                  <div className="operation-fields">
                    {/* Селектор подтипов (если есть) */}
                    {subtypes.length > 0 && (
                      <div className="param-group">
                        <label className="operation-field-label">Тип операции:</label>
                        <select
                          value={selectedData?.subtype || subtypes[0].value}
                          onChange={(e) => updateOperationSubtype(operationId, e.target.value)}
                          className="form-control operation-select"
                        >
                          {subtypes.map((st: { value: string; label: string }) => (
                            <option key={st.value} value={st.value}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Поле количества */}
                    <div className="param-group">
                      <label className="operation-field-label">Количество:</label>
                      <div className="quantity-controls">
                        <button
                          type="button"
                          className="quantity-btn quantity-btn-minus"
                          onClick={() => {
                          const minQty = limits?.min ?? 1;
                          const currentQty = Number.isFinite(selectedData?.quantity)
                            ? Number(selectedData?.quantity)
                            : minQty;
                          updateOperationQuantity(operationId, currentQty - 1);
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                        value={selectedData?.quantity ?? ''}
                          onChange={(e) => {
                          const raw = e.target.value;
                          updateOperationQuantity(operationId, raw === '' ? undefined : Number(raw));
                          }}
                          min={limits?.min ?? 1}
                          max={limits?.max}
                          className="quantity-input"
                        />
                        <button
                          type="button"
                          className="quantity-btn quantity-btn-plus"
                          onClick={() => {
                          const minQty = limits?.min ?? 1;
                          const currentQty = Number.isFinite(selectedData?.quantity)
                            ? Number(selectedData?.quantity)
                            : minQty;
                          updateOperationQuantity(operationId, currentQty + 1);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
};
