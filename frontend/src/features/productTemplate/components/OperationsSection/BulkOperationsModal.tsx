import React from 'react';
import { Modal } from '../../../../components/common';
import { AvailableOperation, ProductOperation } from '../../types';

interface BulkOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableOperations: AvailableOperation[];
  productOperations: ProductOperation[];
  selected: Set<number>;
  required: Record<number, boolean>;
  adding: boolean;
  onSelectedChange: (selected: Set<number>) => void;
  onRequiredChange: (required: Record<number, boolean>) => void;
  onAdd: (payload: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>) => Promise<any>;
}

const BulkOperationsModal: React.FC<BulkOperationsModalProps> = ({
  isOpen,
  onClose,
  availableOperations,
  productOperations,
  selected,
  required,
  adding,
  onSelectedChange,
  onRequiredChange,
  onAdd
}) => {
  const handleSelectAll = () => {
    const all = new Set(availableOperations.map((op) => Number(op.id)));
    onSelectedChange(all);
    const reqMap: Record<number, boolean> = {};
    availableOperations.forEach((op) => {
      reqMap[Number(op.id)] = true;
    });
    onRequiredChange(reqMap);
  };

  const handleDeselectAll = () => {
    onSelectedChange(new Set());
    onRequiredChange({});
  };

  const toggleSelection = (operationId: number) => {
    const next = new Set(selected);
    if (next.has(operationId)) {
      next.delete(operationId);
      const { [operationId]: _, ...rest } = required;
      onRequiredChange(rest);
    } else {
      next.add(operationId);
      onRequiredChange({ ...required, [operationId]: true });
    }
    onSelectedChange(next);
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    try {
      const payload = Array.from(selected).map((operationId, index) => ({
        operation_id: operationId,
        sequence: productOperations.length + index + 1,
        is_required: required[operationId] !== false,
        is_default: true,
        price_multiplier: 1.0
      }));
      await onAdd(payload);
      onClose();
    } catch (error) {
      console.error('Bulk add operations failed', error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Массовое добавление операций (${selected.size} выбрано)`}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {availableOperations.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
            Все доступные операции уже добавлены к продукту
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-secondary" onClick={handleSelectAll}>
                Выбрать все
              </button>
              <button className="btn-secondary" onClick={handleDeselectAll}>
                Снять все
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {availableOperations.map((operation) => {
                const operationId = Number(operation.id);
                const isSelected = selected.has(operationId);
                return (
                  <div
                    key={operationId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      background: isSelected ? '#f0f9ff' : 'white'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(operationId)}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>{operation.name}</div>
                      {operation.operation_type && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>{operation.operation_type}</div>
                      )}
                    </div>
                    {isSelected && (
                      <select
                        value={required[operationId] !== false ? '1' : '0'}
                        onChange={(e) =>
                          onRequiredChange({ ...required, [operationId]: e.target.value === '1' })
                        }
                        className="form-select"
                        style={{ width: 100 }}
                      >
                        <option value="1">Обязат.</option>
                        <option value="0">Опц.</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <button className="btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button
                className="btn-primary"
                onClick={handleAdd}
                disabled={selected.size === 0 || adding}
              >
                {adding ? 'Добавление...' : `Добавить ${selected.size} операций`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default BulkOperationsModal;

