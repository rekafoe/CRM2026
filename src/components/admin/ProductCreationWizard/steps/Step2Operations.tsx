/**
 * Шаг 2: Выбор операций
 */

import React from 'react';
import { PostProcessingOperation } from '../../../../services/products';
import { FormState } from '../../hooks/useProductCreationWizardState';

interface Step2OperationsProps {
  form: FormState;
  operations: PostProcessingOperation[];
  operationsLoading: boolean;
  isOperationSelected: (operationId: number) => boolean;
  toggleOperation: (operation: PostProcessingOperation) => void;
  updateSelectedOperation: (
    operationId: number,
    patch: Partial<{ is_required: boolean; is_default: boolean; price_multiplier: number }>
  ) => void;
}

export const Step2Operations: React.FC<Step2OperationsProps> = ({
  form,
  operations,
  operationsLoading,
  isOperationSelected,
  toggleOperation,
  updateSelectedOperation,
}) => {
  return (
    <div className="wizard-step flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-primary">Операции</h4>
      {operationsLoading ? (
        <p className="text-secondary">Загрузка операций…</p>
      ) : (
        <div className="operations-list">
          {operations.map((operation) => {
            const selected = isOperationSelected(operation.id);
            const selectedConfig = form.selectedOperations.find(
              (op) => op.operation_id === operation.id
            );
            return (
              <div key={operation.id} className={`operation-item ${selected ? 'selected' : ''}`}>
                <label className="operation-header">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleOperation(operation)}
                  />
                  <span className="operation-name">{operation.name}</span>
                  <span className="operation-meta">{operation.operation_type}</span>
                </label>
                {selected && selectedConfig && (
                  <div className="operation-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedConfig.is_required}
                        onChange={(e) =>
                          updateSelectedOperation(operation.id, {
                            is_required: e.target.checked,
                          })
                        }
                      />
                      Обязательная операция
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedConfig.is_default}
                        onChange={(e) =>
                          updateSelectedOperation(operation.id, {
                            is_default: e.target.checked,
                          })
                        }
                      />
                      Выбрана по умолчанию
                    </label>
                    <div className="operation-multiplier">
                      <span>Множитель цены:</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedConfig.price_multiplier}
                        onChange={(e) =>
                          updateSelectedOperation(operation.id, {
                            price_multiplier: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!operations.length && <p className="text-secondary">Операции не найдены.</p>}
        </div>
      )}
    </div>
  );
};

