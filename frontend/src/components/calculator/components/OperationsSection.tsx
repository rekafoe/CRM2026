import React, { useMemo, useCallback } from 'react';

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
}

interface OperationsSectionProps {
  backendProductSchema: any;
  specs: Record<string, any>;
  updateSpecs: (updates: Record<string, any>, instant?: boolean) => void;
}

interface SelectedOperation {
  operationId: number;
  subtype?: string;
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
      return [];
    }
    
    // Фильтруем операции: показываем все, которые НЕ обязательные
    // (is_required !== true и !== 1)
    const filtered = backendProductSchema.operations.filter((op: Operation) => {
      const isRequired = op.is_required === true || op.is_required === 1;
      return !isRequired; // Показываем только необязательные операции
    });
    
    return filtered;
  }, [backendProductSchema?.operations]);

  // Получаем выбранные операции из specs
  const selectedOperations = useMemo(() => {
    const ops = specs.selectedOperations || [];
    return Array.isArray(ops) ? ops : [];
  }, [specs.selectedOperations]);

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
      const opWithSubtypes = operationsWithSubtypes.find((item: { operation: Operation; subtypes: Array<{ value: string; label: string }> }) => 
        (item.operation.operation_id || item.operation.id) === operationId
      );
      const subtypes = opWithSubtypes?.subtypes || [];
      const newOp: SelectedOperation = {
        operationId,
        quantity: 1,
        ...(subtypes.length > 0 && { subtype: subtypes[0].value }),
      };
      updateSpecs({ selectedOperations: [...currentOps, newOp] }, true);
    }
  }, [selectedOperations, selectedOperationsMap, operationsWithSubtypes, updateSpecs]);

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

  if (operations.length === 0) {
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

              {isSelected && (
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
