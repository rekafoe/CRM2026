import React from 'react';
import { Button, FormField, EmptyState } from '../../../common';
import { Service } from '../../hooks/useCalculatorProductManagerState';

interface Operation {
  operation: string;
  service_id?: number;
  service: string;
  type?: string;
  unit?: string;
  rate?: number;
  formula: string;
}

interface OperationsListProps {
  operations: Operation[];
  services: Service[];
  onUpdateOperation: (index: number, field: string, value: any) => void;
  onRemoveOperation: (index: number) => void;
  onAddOperation: () => void;
}

export const OperationsList: React.FC<OperationsListProps> = React.memo(({
  operations,
  services,
  onUpdateOperation,
  onRemoveOperation,
  onAddOperation,
}) => {
  return (
    <div className="schema-section">
      <div className="schema-section-title">
        <span>⚙️</span>
        <span>Операции производства</span>
      </div>
      
      {operations.length === 0 ? (
        <EmptyState
          icon="⚙️"
          title="Нет операций"
          description="Добавьте первую операцию для этого типа продукта"
          action={{
            label: "Добавить операцию",
            onClick: onAddOperation
          }}
        />
      ) : (
        <>
          <div className="operations-list">
            {operations.map((operation, index) => (
              <div key={index} className="operation-card">
                <div className="operation-header">
                  <span className="operation-number">Операция #{index + 1}</span>
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => onRemoveOperation(index)}
                  >
                    Удалить
                  </Button>
                </div>
                
                <div className="operation-fields">
                  <FormField
                    label="Название операции"
                    required
                    help="Например: Цифровая печать, Ламинация, Резка"
                  >
                    <input
                      type="text"
                      placeholder="Цифровая печать"
                      value={operation.operation}
                      onChange={(e) => onUpdateOperation(index, 'operation', e.target.value)}
                      className="form-control"
                    />
                  </FormField>

                  <FormField
                    label="Услуга"
                    required
                    help="Выберите услугу из справочника"
                  >
                    <select
                      value={operation.service}
                      onChange={(e) => onUpdateOperation(index, 'service', e.target.value)}
                      className="form-control"
                    >
                      <option value="">Выберите услугу</option>
                      {services.filter(s => s.is_active).map(service => (
                        <option key={service.id} value={service.name}>
                          {service.name} ({service.rate} BYN/{service.unit})
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField
                    label="Формула расчета"
                    required
                    help="Как вычисляется количество единиц для этой операции"
                    className="operation-field-full"
                  >
                    <input
                      type="text"
                      placeholder="quantity или sheets * sides"
                      value={operation.formula}
                      onChange={(e) => onUpdateOperation(index, 'formula', e.target.value)}
                      className="form-control"
                    />
                    <div className="formula-examples">
                      <div className="formula-examples-title">Примеры формул:</div>
                      <ul className="formula-examples-list">
                        <li><code>quantity</code> - количество изделий</li>
                        <li><code>sheets * sides</code> - количество листов × количество сторон</li>
                        <li><code>ceil(quantity / 2)</code> - округление вверх</li>
                      </ul>
                    </div>
                  </FormField>

                  {operation.service && (
                    <div className="operation-field-full">
                      <div className="help-text">
                        💡 Тариф и единица измерения автоматически подставляются из выбранной услуги
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="operation-actions">
            <Button
              variant="secondary"
              onClick={onAddOperation}
              icon={<span>+</span>}
            >
              Добавить операцию
            </Button>
          </div>
        </>
      )}
    </div>
  );
});


