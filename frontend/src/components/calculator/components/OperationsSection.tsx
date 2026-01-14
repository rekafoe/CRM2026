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
  // Получаем операции из схемы
  const operations = useMemo(() => {
    if (!backendProductSchema?.operations || !Array.isArray(backendProductSchema.operations)) {
      console.log('🔍 [OperationsSection] Нет операций в схеме', {
        hasSchema: !!backendProductSchema,
        operations: backendProductSchema?.operations,
        isArray: Array.isArray(backendProductSchema?.operations)
      });
      return [];
    }
    
    // Фильтруем операции: показываем все, которые НЕ обязательные
    // (is_required !== true и !== 1)
    const filtered = backendProductSchema.operations.filter((op: Operation) => {
      const isRequired = op.is_required === true || op.is_required === 1;
      return !isRequired; // Показываем только необязательные операции
    });
    
    console.log('🔍 [OperationsSection] Операции после фильтрации', {
      total: backendProductSchema.operations.length,
      filtered: filtered.length,
      operations: filtered.map((op: Operation) => ({
        id: op.operation_id || op.id,
        name: op.operation_name || op.name,
        type: op.operation_type,
        isRequired: op.is_required
      }))
    });
    
    return filtered;
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
      
      let newOp: SelectedOperation = {
        operationId,
        quantity: 1,
      };
      
      if (hasVariants) {
        // Если есть варианты, выбираем первый вариант и первый подтип
        const firstVariant = variants[0];
        const firstSubtype = firstVariant?.parameters?.subtypes?.[0];
        newOp.variantId = firstVariant.id;
        if (firstSubtype) {
          newOp.subtype = typeof firstSubtype === 'string' ? firstSubtype : firstSubtype.value;
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
      
      updateSpecs({ selectedOperations: [...currentOps, newOp] }, true);
    }
  }, [selectedOperations, selectedOperationsMap, operationsWithSubtypes, serviceVariants, updateSpecs]);

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
  const updateOperationQuantity = useCallback((operationId: number, quantity: number) => {
    const updated = selectedOperations.map((op: SelectedOperation) => {
      if (op.operationId === operationId) {
        return { ...op, quantity: Math.max(1, quantity) };
      }
      return op;
    });
    updateSpecs({ selectedOperations: updated }, true);
  }, [selectedOperations, updateSpecs]);

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
    <div className="form-section compact">
      <h3>🔧 Операции</h3>
      <div className="advanced-grid compact">
        {operationsWithSubtypes.map(({ operation, subtypes }: { operation: Operation; subtypes: Array<{ value: string; label: string }> }) => {
          const operationId = operation.operation_id || operation.id;
          if (!operationId) return null;

          const operationName = operation.operation_name || operation.name || 'Операция';
          const isSelected = isOperationSelected(operationId);
          const selectedData = getSelectedOperationData(operationId);

          return (
            <div key={operationId} className="param-group operation-group" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: isSelected ? '12px' : 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOperation(operation)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500 }}>{operationName}</span>
                </label>
              </div>

              {isSelected && (() => {
                // 🆕 Проверяем, есть ли варианты для этой операции (например, ламинация)
                const variants = serviceVariants.get(operationId) || [];
                const hasVariants = variants.length > 0;
                
                // Если есть варианты, используем их как типы
                if (hasVariants) {
                  const selectedVariantId = selectedData?.variantId;
                  const selectedVariant = variants.find(v => v.id === selectedVariantId) || variants[0];
                  const variantSubtypes = selectedVariant?.parameters?.subtypes || [];
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '26px' }}>
                      {/* 🆕 Селектор типов (вариантов) */}
                      <div className="param-group">
                        <label style={{ fontSize: '14px', color: '#666' }}>Тип ламинации:</label>
                        <select
                          value={selectedVariant?.id || variants[0]?.id || ''}
                          onChange={(e) => {
                            const newVariantId = Number(e.target.value);
                            const newVariant = variants.find(v => v.id === newVariantId);
                            const firstSubtype = newVariant?.parameters?.subtypes?.[0];
                            updateSpecs({
                              selectedOperations: selectedOperations.map((op: SelectedOperation) => {
                                if (op.operationId === operationId) {
                                  return {
                                    ...op,
                                    variantId: newVariantId,
                                    subtype: firstSubtype?.value || firstSubtype || undefined,
                                  };
                                }
                                return op;
                              }),
                            }, true);
                          }}
                          className="form-control"
                          style={{ fontSize: '14px' }}
                        >
                          {variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.variantName}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* 🆕 Селектор подтипов (из выбранного типа) */}
                      {variantSubtypes.length > 0 && (
                        <div className="param-group">
                          <label style={{ fontSize: '14px', color: '#666' }}>Подтип:</label>
                          <select
                            value={selectedData?.subtype || variantSubtypes[0]?.value || variantSubtypes[0] || ''}
                            onChange={(e) => updateOperationSubtype(operationId, e.target.value)}
                            className="form-control"
                            style={{ fontSize: '14px' }}
                          >
                            {variantSubtypes.map((st: string | { value: string; label: string }) => {
                              const value = typeof st === 'string' ? st : st.value;
                              const label = typeof st === 'string' ? st : st.label;
                              return (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {/* Поле количества */}
                      <div className="param-group">
                        <label style={{ fontSize: '14px', color: '#666' }}>Количество:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="quantity-btn quantity-btn-minus"
                        onClick={() => {
                          const currentQty = selectedData?.quantity || 1;
                          updateOperationQuantity(operationId, currentQty - 1);
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          border: '1px solid #dcdfe6',
                          background: '#f5f7fa',
                          color: '#606266',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '18px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e4e7ed';
                          e.currentTarget.style.borderColor = '#c0c4cc';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f5f7fa';
                          e.currentTarget.style.borderColor = '#dcdfe6';
                        }}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={selectedData?.quantity || 1}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 1;
                          updateOperationQuantity(operationId, value);
                        }}
                        min={1}
                        className="quantity-input"
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <button
                        type="button"
                        className="quantity-btn quantity-btn-plus"
                        onClick={() => {
                          const currentQty = selectedData?.quantity || 1;
                          updateOperationQuantity(operationId, currentQty + 1);
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          border: '1px solid #dcdfe6',
                          background: '#f5f7fa',
                          color: '#606266',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '18px',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e4e7ed';
                          e.currentTarget.style.borderColor = '#c0c4cc';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f5f7fa';
                          e.currentTarget.style.borderColor = '#dcdfe6';
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '26px' }}>
                    {/* Селектор подтипов (если есть) */}
                    {subtypes.length > 0 && (
                      <div className="param-group">
                        <label style={{ fontSize: '14px', color: '#666' }}>Тип операции:</label>
                        <select
                          value={selectedData?.subtype || subtypes[0].value}
                          onChange={(e) => updateOperationSubtype(operationId, e.target.value)}
                          className="form-control"
                          style={{ fontSize: '14px' }}
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
                      <label style={{ fontSize: '14px', color: '#666' }}>Количество:</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="quantity-btn quantity-btn-minus"
                          onClick={() => {
                            const currentQty = selectedData?.quantity || 1;
                            updateOperationQuantity(operationId, currentQty - 1);
                          }}
                          style={{
                            width: '32px',
                            height: '32px',
                            border: '1px solid #dcdfe6',
                            background: '#f5f7fa',
                            color: '#606266',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#e4e7ed';
                            e.currentTarget.style.borderColor = '#c0c4cc';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f5f7fa';
                            e.currentTarget.style.borderColor = '#dcdfe6';
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={selectedData?.quantity || 1}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 1;
                            updateOperationQuantity(operationId, value);
                          }}
                          min={1}
                          className="quantity-input"
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '14px',
                          }}
                        />
                        <button
                          type="button"
                          className="quantity-btn quantity-btn-plus"
                          onClick={() => {
                            const currentQty = selectedData?.quantity || 1;
                            updateOperationQuantity(operationId, currentQty + 1);
                          }}
                          style={{
                            width: '32px',
                            height: '32px',
                            border: '1px solid #dcdfe6',
                            background: '#f5f7fa',
                            color: '#606266',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#e4e7ed';
                            e.currentTarget.style.borderColor = '#c0c4cc';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f5f7fa';
                            e.currentTarget.style.borderColor = '#dcdfe6';
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
