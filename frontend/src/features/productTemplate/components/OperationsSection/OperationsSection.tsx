import React, { useState } from 'react';
import { Button, Alert } from '../../../../components/common';
import { ProductOperation, AvailableOperation, OperationError } from '../../types';
import BulkOperationsModal from './BulkOperationsModal';
import OperationEditModal from './OperationEditModal';

interface OperationsSectionProps {
  productOperations: ProductOperation[];
  availableOperations: AvailableOperation[];
  selectedOperationId: number | null;
  addingOperation: boolean;
  deletingOperationId: number | null;
  operationError: OperationError | null;
  showBulkModal: boolean;
  bulkSelected: Set<number>;
  bulkRequired: Record<number, boolean>;
  bulkAdding: boolean;
  parameters?: Array<{ name: string; label: string; type: string; options?: any }>;
  materials?: Array<{ id: number; name: string; category_name?: string; finish?: string | null; density?: number | null }>;
  productType?: string; // Тип продукта для адаптации UI
  onSelectOperation: (id: number | null) => void;
  onAddOperation: () => Promise<void>;
  onRemoveOperation: (linkId: number) => Promise<void>;
  onUpdateOperation?: (operationId: number, updates: any) => Promise<void>;
  onShowBulkModal: (show: boolean) => void;
  onBulkSelectedChange: (selected: Set<number>) => void;
  onBulkRequiredChange: (required: Record<number, boolean>) => void;
  onBulkAdd: (payload: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>) => Promise<ProductOperation[]>;
  onErrorDismiss: () => void;
}

const OperationsSection: React.FC<OperationsSectionProps> = ({
  productOperations,
  availableOperations,
  selectedOperationId,
  addingOperation,
  deletingOperationId,
  operationError,
  showBulkModal,
  bulkSelected,
  bulkRequired,
  bulkAdding,
  parameters = [],
  materials = [],
  productType,
  onSelectOperation,
  onAddOperation,
  onRemoveOperation,
  onUpdateOperation,
  onShowBulkModal,
  onBulkSelectedChange,
  onBulkRequiredChange,
  onBulkAdd,
  onErrorDismiss
}) => {
  const [editingOperation, setEditingOperation] = useState<ProductOperation | null>(null);

  const availableForBulk = availableOperations.filter(
    op => !productOperations.find(po => po.operation_id === op.id)
  );

  const handleSaveOperation = async (operationId: number, updates: any) => {
    if (onUpdateOperation) {
      await onUpdateOperation(operationId, updates);
    }
    setEditingOperation(null);
  };

  // Функция для отображения условий операции
  const renderConditionBadge = (op: ProductOperation) => {
    if (op.linked_parameter_name || (op.conditions && Object.keys(op.conditions).length > 0)) {
      const paramName = op.linked_parameter_name || Object.keys(op.conditions || {})[0];
      const paramValue = op.conditions ? op.conditions[paramName] : '';
      const param = parameters.find(p => p.name === paramName);
      
      return (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs px-2 py-1 bg-warning-light text-warning rounded">
            🔀 Условная: {param?.label || paramName} = {paramValue}
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="template-tab-grid">
      <div className="template-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 className="template-card__title" style={{ margin: 0 }}>⚙️ Операции продукта</h4>
          {availableForBulk.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => onShowBulkModal(true)}
              style={{ fontSize: 13, padding: '6px 12px' }}
            >
              📦 Массовое добавление ({availableForBulk.length})
            </button>
          )}
        </div>
        
        {operationError && (
          <div style={{ marginBottom: 16 }}>
            <Alert
              type="error"
              onClose={onErrorDismiss}
            >
              <strong>Ошибка:</strong> {operationError.message}
            </Alert>
          </div>
        )}

        {/* Подсказки для разных типов продуктов */}
        {productType === 'sheet_single' && (
          <Alert type="info" className="mb-4">
            <strong>📄 Листовые изделия</strong>
            <p className="text-sm mt-1">Автоматически добавляются операции: печать и резка. При необходимости добавьте отделку (ламинация, скругление углов).</p>
          </Alert>
        )}

        {productType === 'multi_page' && (
          <Alert type="info" className="mb-4">
            <strong>📚 Многостраничные изделия</strong>
            <p className="text-sm mt-1">Автоматически добавляются операции: печать, резка/фальцовка и переплет. Формулы расчета учитывают количество страниц и сторон печати.</p>
          </Alert>
        )}

        {productType === 'universal' && (
          <Alert type="warning" className="mb-4">
            <strong>🔧 Универсальные изделия</strong>
            <p className="text-sm mt-1">Выберите и настройте все необходимые операции для вашего специального продукта. Формулы расчета настраиваются индивидуально.</p>
          </Alert>
        )}
        
        {productOperations.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>#</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Операция</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Тип</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Цена</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Условие</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {productOperations.map((op, index: number) => (
                <tr key={`operation-${op.id}-${op.operation_id}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 8 }}>{index + 1}</td>
                  <td style={{ padding: 8 }}>
                    <div className="flex flex-col gap-1">
                      <div>{op.operation_name || op.service_name}</div>
                      {renderConditionBadge(op)}
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <span style={{ 
                      padding: '2px 8px', 
                      backgroundColor: '#e3f2fd', 
                      borderRadius: 4, 
                      fontSize: 12 
                    }}>
                      {op.operation_type}
                    </span>
                  </td>
                  <td style={{ padding: 8, textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                    {(op.price !== undefined && op.price !== null) || (op.price_per_unit !== undefined && op.price_per_unit !== null) ? (
                      <>
                        {((op.price ?? op.price_per_unit ?? 0)).toFixed(2)} Br
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginLeft: 4 }}>
                          /{op.unit || op.price_unit || 'шт'}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    <div className="flex flex-col items-center gap-1">
                      <div>{op.is_required ? '✅ Обяз.' : '⭕ Опц.'}</div>
                      {!op.is_required && (
                        <span className="text-xs text-secondary">
                          {(op.is_default === true || op.is_default === 1) ? '✓ По умолч.' : '— Выкл.'}
                        </span>
                      )}
                      {(op.linked_parameter_name || (op.conditions && Object.keys(op.conditions).length > 0)) ? (
                        <span className="text-xs text-warning">🔀 Условная</span>
                      ) : (
                        <span className="text-xs text-success">✓ Всегда</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    <div className="flex gap-2 justify-center">
                      <button 
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                        onClick={() => setEditingOperation(op)}
                        title="Настроить условия"
                      >
                        ⚙️ Настроить
                      </button>
                      <button 
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                        onClick={() => onRemoveOperation(op.id)}
                        disabled={deletingOperationId === op.id}
                        title="Удалить операцию"
                      >
                        {deletingOperationId === op.id ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="alert alert-warning" style={{ marginBottom: 20, textAlign: 'center' }}>
            <p style={{ margin: 0 }}>⚠️ У продукта нет операций</p>
            <p style={{ margin: '8px 0 0 0', fontSize: 14 }}>
              Добавьте хотя бы одну операцию для расчета цены
            </p>
          </div>
        )}

        <div className="form-section">
          <h4 className="template-card__title">Добавить операцию</h4>
          {availableOperations.length === 0 ? (
            <div className="alert alert-error">
              <p style={{ margin: 0 }}>
                ❌ В системе нет доступных операций. Обратитесь к администратору.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                  Выберите операцию
                </label>
                <select 
                  className="form-select" 
                  value={selectedOperationId || ''}
                  onChange={(e) => onSelectOperation(Number(e.target.value) || null)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- Выберите операцию --</option>
                  {availableOperations
                    .filter(op => !productOperations.find(po => po.operation_id === op.id))
                    .map(op => (
                      <option key={op.id} value={op.id}>
                        {op.name} ({op.operation_type})
                      </option>
                    ))}
                </select>
              </div>
              <Button
                variant="primary"
                onClick={onAddOperation}
                disabled={!selectedOperationId || addingOperation}
              >
                {addingOperation ? '⏳ Добавление...' : '➕ Добавить'}
              </Button>
            </div>
          )}
        </div>

        <div className="alert alert-success" style={{ marginTop: 20 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            💡 <strong>Совет:</strong> Рекомендуем добавить минимум 2 операции:
          </p>
          <ul style={{ margin: '8px 0 0 20px', fontSize: 14 }}>
            <li>Цифровая цветная печать (SRA3) - для печати</li>
            <li>Резка на гильотине - для обрезки в размер</li>
          </ul>
        </div>

        <BulkOperationsModal
          isOpen={showBulkModal}
          onClose={() => {
            onShowBulkModal(false);
            onBulkSelectedChange(new Set());
            onBulkRequiredChange({});
          }}
          availableOperations={availableForBulk}
          productOperations={productOperations}
          selected={bulkSelected}
          required={bulkRequired}
          adding={bulkAdding}
          onSelectedChange={onBulkSelectedChange}
          onRequiredChange={onBulkRequiredChange}
          onAdd={onBulkAdd}
        />

        <OperationEditModal
          isOpen={!!editingOperation}
          onClose={() => setEditingOperation(null)}
          operation={editingOperation}
          parameters={parameters}
          materials={materials}
          onSave={handleSaveOperation}
        />
      </div>
    </div>
  );
};

export default OperationsSection;

