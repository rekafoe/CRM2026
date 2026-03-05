import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, FormField, Alert } from '../../../../components/common';
import { ProductOperation } from '../../types';

interface OperationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: ProductOperation | null;
  parameters: Array<{ name: string; label: string; type: string; options?: any }>;
  materials?: Array<{ id: number; name: string; category_name?: string; finish?: string | null; density?: number | null }>;
  onSave: (operationId: number, updates: {
    is_required?: boolean;
    is_default?: boolean;
    conditions?: Record<string, any>;
    linked_parameter_name?: string | null;
  }) => Promise<void>;
}

export const OperationEditModal: React.FC<OperationEditModalProps> = ({
  isOpen,
  onClose,
  operation,
  parameters,
  materials = [],
  onSave
}) => {
  const [isRequired, setIsRequired] = useState(true);
  const [isDefault, setIsDefault] = useState(true);
  const [conditionMode, setConditionMode] = useState<'always' | 'parameter'>('always');
  const [linkedParameter, setLinkedParameter] = useState<string>('');
  const [parameterValue, setParameterValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (operation) {
      setIsRequired(operation.is_required ?? true);
      setIsDefault(operation.is_default === true || operation.is_default === 1);
      
      // Проверяем, есть ли conditions или linked_parameter_name
      const conditionsObj = operation.conditions ?? {};
      const hasConditions = Object.keys(conditionsObj).length > 0;
      const hasLinkedParam = operation.linked_parameter_name;
      
      if (hasLinkedParam) {
        setConditionMode('parameter');
        setLinkedParameter(hasLinkedParam);
        // Пытаемся извлечь значение из conditions
        if (hasConditions) {
          const firstKey = Object.keys(conditionsObj)[0];
          setParameterValue(conditionsObj[firstKey]);
        }
      } else if (hasConditions) {
        setConditionMode('parameter');
        const firstKey = Object.keys(conditionsObj)[0];
        setLinkedParameter(firstKey);
        setParameterValue(conditionsObj[firstKey]);
      } else {
        setConditionMode('always');
      }
    }
  }, [operation]);

  // 🧩 Опции ламинации из склада: одна валидная связка (тип + толщина)
  const laminationOptions = useMemo(() => {
    const isLaminationCategory = (name?: string) => {
      if (!name) return false;
      const lower = name.toLowerCase();
      return lower.includes('ламин');
    };

    return materials
      .filter((m) => isLaminationCategory(m.category_name))
      .map((m) => {
        const finishLabel = m.finish ? m.finish : 'Ламинация';
        const thicknessLabel = m.density ? `${m.density} мк` : '';
        const label = [finishLabel, thicknessLabel].filter(Boolean).join(' · ');
        return {
          value: m.id,
          label: label || m.name || `Ламинация #${m.id}`
        };
      });
  }, [materials]);

  const handleSave = async () => {
    if (!operation) return;
    
    setSaving(true);
    try {
      const updates: any = {
        is_required: isRequired,
        ...(!isRequired && { is_default: isDefault })
      };

      if (conditionMode === 'parameter' && linkedParameter) {
        updates.linked_parameter_name = linkedParameter;
        updates.conditions = { [linkedParameter]: parameterValue };
      } else {
        updates.linked_parameter_name = null;
        updates.conditions = null;
      }

      await onSave(operation.id, updates);
      onClose();
    } catch (error) {
      console.error('Ошибка сохранения операции:', error);
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!operation) return null;

  const selectedParam = parameters.find(p => p.name === linkedParameter);
  const paramOptions = selectedParam?.type === 'select' && selectedParam.options
    ? (Array.isArray(selectedParam.options) 
        ? selectedParam.options 
        : typeof selectedParam.options === 'string'
          ? JSON.parse(selectedParam.options)
          : [])
    : [];

  const isLaminationParam = linkedParameter === 'lamination_material_id' || linkedParameter?.includes('lamination');
  const effectiveOptions = isLaminationParam && laminationOptions.length > 0 ? laminationOptions : paramOptions;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Настройка операции: ${operation.operation_name || operation.service_name}`}
      size="lg"
    >
      <div className="flex flex-col gap-6">
        {/* Информация об операции */}
        <div className="flex flex-col gap-2 p-4 bg-secondary rounded">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-primary">Операция:</span>
            <span className="text-sm text-primary">{operation.operation_name || operation.service_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-secondary">Тип:</span>
            <span className="text-sm text-secondary">{operation.operation_type}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-secondary">Цена:</span>
            <span className="text-sm text-secondary">
              {(operation.price ?? operation.price_per_unit ?? 0).toFixed(2)} BYN/{operation.unit || operation.price_unit}
            </span>
          </div>
        </div>

        {/* Режим применения */}
        <FormField label="Когда применять операцию?">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-secondary">
              <input
                type="radio"
                checked={conditionMode === 'always'}
                onChange={() => setConditionMode('always')}
              />
              <div className="flex flex-col">
                <span className="font-medium">✅ Всегда</span>
                <span className="text-sm text-secondary">Операция применяется для всех заказов</span>
              </div>
            </label>
            
            <label className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-secondary">
              <input
                type="radio"
                checked={conditionMode === 'parameter'}
                onChange={() => setConditionMode('parameter')}
              />
              <div className="flex flex-col">
                <span className="font-medium">🔀 Условно (по параметру)</span>
                <span className="text-sm text-secondary">Операция применяется только при определенном значении параметра</span>
              </div>
            </label>
          </div>
        </FormField>

        {/* Настройка условия */}
        {conditionMode === 'parameter' && (
          <div className="flex flex-col gap-4 p-4 border rounded bg-info-light">
            <Alert type="info">
              <strong>💡 Условная операция</strong>
              <p className="text-sm mt-1">
                Операция будет добавлена в расчет только когда клиент выберет указанное значение параметра.
              </p>
            </Alert>

            <FormField label="Параметр, от которого зависит операция">
              <select
                className="form-select"
                value={linkedParameter}
                onChange={(e) => {
                  setLinkedParameter(e.target.value);
                  setParameterValue('');
                }}
              >
                <option value="">-- Выберите параметр --</option>
                {parameters.map(param => (
                  <option key={param.name} value={param.name}>
                    {param.label || param.name} ({param.type})
                  </option>
                ))}
              </select>
            </FormField>

            {linkedParameter && selectedParam?.type === 'select' && effectiveOptions.length > 0 && (
              <FormField label="Значение параметра, при котором применяется операция">
                <select
                  className="form-select"
                  value={parameterValue}
                  onChange={(e) => setParameterValue(e.target.value)}
                >
                  <option value="">-- Выберите значение --</option>
                  {effectiveOptions.map((opt: any, i: number) => (
                    <option key={i} value={typeof opt === 'object' ? opt.value : opt}>
                      {typeof opt === 'object' ? opt.label || opt.value : opt}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {linkedParameter && selectedParam?.type === 'checkbox' && (
              <FormField label="Когда применять?">
                <select
                  className="form-select"
                  value={parameterValue}
                  onChange={(e) => setParameterValue(e.target.value)}
                >
                  <option value="">-- Выберите --</option>
                  <option value="true">Когда включено (✓)</option>
                  <option value="false">Когда выключено (✗)</option>
                </select>
              </FormField>
            )}

            {linkedParameter && parameterValue && (
              <div className="p-3 bg-success-light rounded">
                <div className="text-sm font-medium text-success">
                  ✅ Условие настроено
                </div>
                <div className="text-sm text-secondary mt-1">
                  Операция "{operation.operation_name || operation.service_name}" будет применена, 
                  когда "{selectedParam?.label || linkedParameter}" = "{parameterValue}"
                </div>
              </div>
            )}
          </div>
        )}

        {/* Обязательность */}
        <FormField label="Обязательность операции">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              <span>Обязательная операция</span>
            </label>
            <span className="text-sm text-secondary">
              {isRequired 
                ? '✅ Операция всегда включается в расчет (если выполняются условия)'
                : '⭕ Операция может быть опциональной для клиента'}
            </span>
          </div>
        </FormField>

        {/* Включено по умолчанию — только для опциональных операций */}
        {!isRequired && (
          <FormField label="Начальное значение в калькуляторе">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>Включено по умолчанию</span>
              </label>
              <span className="text-sm text-secondary">
                {isDefault 
                  ? 'В калькуляторе чекбокс этой операции будет отмечен при открытии'
                  : 'В калькуляторе чекбокс будет снят при открытии'}
              </span>
            </div>
          </FormField>
        )}

        {/* Кнопки */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSave} 
            disabled={saving || (conditionMode === 'parameter' && (!linkedParameter || !parameterValue))}
          >
            {saving ? 'Сохранение...' : '💾 Сохранить'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default OperationEditModal;

