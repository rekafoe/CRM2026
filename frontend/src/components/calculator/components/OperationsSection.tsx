import React, { useMemo } from 'react';

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
      console.log('🔍 [OperationsSection] Нет операций в схеме', {
        hasSchema: !!backendProductSchema,
        hasOperations: !!backendProductSchema?.operations,
        operationsType: typeof backendProductSchema?.operations,
        operationsIsArray: Array.isArray(backendProductSchema?.operations),
        operationsLength: backendProductSchema?.operations?.length
      });
      return [];
    }
    
    console.log('🔍 [OperationsSection] Операции найдены', {
      total: backendProductSchema.operations.length,
      operations: backendProductSchema.operations.map((op: Operation) => ({
        id: op.id || op.operation_id,
        name: op.operation_name || op.name,
        is_required: op.is_required,
        is_optional: op.is_optional
      }))
    });
    
    // Фильтруем операции: показываем все, которые НЕ обязательные
    // (is_required !== true и !== 1)
    // ВРЕМЕННО: показываем ВСЕ операции для отладки
    const filtered = backendProductSchema.operations.filter((op: Operation) => {
      const isRequired = op.is_required === true || op.is_required === 1;
      // ВРЕМЕННО: показываем все операции (включая обязательные) для отладки
      // TODO: вернуть фильтр !isRequired после проверки
      return true; // Показываем все операции
    });
    
    console.log('🔍 [OperationsSection] Отфильтрованные операции', {
      total: filtered.length,
      operations: filtered.map((op: Operation) => ({
        id: op.id || op.operation_id,
        name: op.operation_name || op.name
      }))
    });
    
    return filtered;
  }, [backendProductSchema?.operations]);

  // Получаем выбранные операции из specs
  const selectedOperations = useMemo(() => {
    const ops = specs.selectedOperations || [];
    return Array.isArray(ops) ? ops : [];
  }, [specs.selectedOperations]);

  // Парсим параметры операции для получения подтипов
  const getOperationSubtypes = (operation: Operation): Array<{ value: string; label: string }> => {
    if (!operation.parameters) return [];
    
    try {
      const params = typeof operation.parameters === 'string' 
        ? JSON.parse(operation.parameters) 
        : operation.parameters;
      
      // Ищем поле с подтипами (например, для ламинации: matte, glossy)
      if (params.subtypes && Array.isArray(params.subtypes)) {
        return params.subtypes.map((st: string | { value: string; label: string }) => {
          if (typeof st === 'string') {
            return { value: st, label: st };
          }
          return st;
        });
      }
      
      // Альтернативный формат: options или enum
      if (params.options && Array.isArray(params.options)) {
        return params.options.map((opt: string | { value: string; label: string }) => {
          if (typeof opt === 'string') {
            return { value: opt, label: opt };
          }
          return opt;
        });
      }
      
      if (params.enum && Array.isArray(params.enum)) {
        return params.enum.map((opt: string | { value: string; label: string }) => {
          if (typeof opt === 'string') {
            return { value: opt, label: opt };
          }
          return opt;
        });
      }
    } catch (e) {
      console.warn('Ошибка парсинга параметров операции:', e);
    }
    
    return [];
  };

  // Проверяем, выбрана ли операция
  const isOperationSelected = (operationId: number): boolean => {
    return selectedOperations.some((op: SelectedOperation) => op.operationId === operationId);
  };

  // Получаем данные выбранной операции
  const getSelectedOperationData = (operationId: number): SelectedOperation | null => {
    return selectedOperations.find((op: SelectedOperation) => op.operationId === operationId) || null;
  };

  // Переключаем выбор операции
  const toggleOperation = (operation: Operation) => {
    const operationId = operation.operation_id || operation.id;
    if (!operationId) return;

    const isSelected = isOperationSelected(operationId);
    const currentOps = [...selectedOperations];

    if (isSelected) {
      // Удаляем операцию
      const filtered = currentOps.filter((op: SelectedOperation) => op.operationId !== operationId);
      updateSpecs({ selectedOperations: filtered }, true);
    } else {
      // Добавляем операцию с дефолтными значениями
      const subtypes = getOperationSubtypes(operation);
      const newOp: SelectedOperation = {
        operationId,
        quantity: 1,
        ...(subtypes.length > 0 && { subtype: subtypes[0].value }),
      };
      updateSpecs({ selectedOperations: [...currentOps, newOp] }, true);
    }
  };

  // Обновляем подтип операции
  const updateOperationSubtype = (operationId: number, subtype: string) => {
    const updated = selectedOperations.map((op: SelectedOperation) => {
      if (op.operationId === operationId) {
        return { ...op, subtype };
      }
      return op;
    });
    updateSpecs({ selectedOperations: updated }, true);
  };

  // Обновляем количество операции
  const updateOperationQuantity = (operationId: number, quantity: number) => {
    const updated = selectedOperations.map((op: SelectedOperation) => {
      if (op.operationId === operationId) {
        return { ...op, quantity: Math.max(1, quantity) };
      }
      return op;
    });
    updateSpecs({ selectedOperations: updated }, true);
  };

  if (operations.length === 0) {
    return null;
  }

  return (
    <div className="form-section compact">
      <h3>🔧 Операции</h3>
      <div className="advanced-grid compact">
        {operations.map((operation: Operation) => {
          const operationId = operation.operation_id || operation.id;
          if (!operationId) return null;

          const operationName = operation.operation_name || operation.name || 'Операция';
          const isSelected = isOperationSelected(operationId);
          const selectedData = getSelectedOperationData(operationId);
          const subtypes = getOperationSubtypes(operation);

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
                        {subtypes.map((st) => (
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
                          border: '1px solid #ddd',
                          background: '#fff',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
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
                          border: '1px solid #ddd',
                          background: '#fff',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
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
