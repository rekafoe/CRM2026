import React from 'react';
import { FormField } from '../../../common';
import { PricingServiceType } from '../../../../types/pricing';

export interface ServiceFormState {
  name: string;
  type: PricingServiceType;
  unit: string;
  rate: string;
  isActive: boolean;
  hasVariants: boolean;
  operationType: string;
  minQuantity: string;
  maxQuantity: string;
  operatorPercent: string;
  categoryId: number | ''; // id категории послепечатной услуги (для группировки в выборе продукта)
  /** ID материала для списания при выполнении операции */
  materialId: number | '';
  /** Расход материала на единицу операции */
  qtyPerItem: string;
}

interface ServiceFormProps {
  value: ServiceFormState;
  onChange: (next: ServiceFormState) => void;
  disabled?: boolean;
  typeOptions?: Array<{ value: PricingServiceType; label: string }>;
  unitOptions?: Array<{ value: string; label: string }>;
  categories?: Array<{ id: number; name: string }>;
  /** Список материалов для выбора списания по операции */
  materials?: Array<{ id: number; name: string }>;
}

const defaultTypeOptions: Array<{ value: PricingServiceType; label: string }> = [
  { value: 'print', label: 'print' },
  { value: 'postprint', label: 'postprint' },
  { value: 'other', label: 'other' },
  { value: 'generic', label: 'generic' },
];

const defaultUnitOptions = [
  { value: 'item', label: 'item' },
  { value: 'sheet', label: 'sheet' },
  { value: 'hour', label: 'hour' },
  { value: 'm2', label: 'm2' },
  { value: 'click', label: 'click' },
  { value: 'per_cut', label: 'per_cut (🔪 за рез)' },
  { value: 'шт', label: 'шт (per_item)' },
  { value: 'per_sheet', label: 'per_sheet (за лист)' },
  { value: 'per_item', label: 'per_item (за изделие)' },
  { value: 'fixed', label: 'fixed (фикс. цена)' },
  { value: 'per_order', label: 'per_order (за заказ)' },
];

const operationTypeOptions = [
  { value: 'other', label: 'other (прочее)' },
  { value: 'print', label: 'print (печать)' },
  { value: 'laminate', label: 'laminate (ламинация)' },
  { value: 'cut', label: 'cut (резка)' },
  { value: 'fold', label: 'fold (фальцовка)' },
  { value: 'score', label: 'score (биговка)' },
  { value: 'bind', label: 'bind (переплет)' },
  { value: 'perforate', label: 'perforate (перфорация)' },
  { value: 'emboss', label: 'emboss (тиснение)' },
  { value: 'foil', label: 'foil (фольга)' },
  { value: 'varnish', label: 'varnish (лакировка)' },
  { value: 'package', label: 'package (упаковка)' },
  { value: 'design', label: 'design (дизайн)' },
  { value: 'delivery', label: 'delivery (доставка)' },
];

const ServiceForm: React.FC<ServiceFormProps> = ({
  value,
  onChange,
  disabled = false,
  typeOptions = defaultTypeOptions,
  unitOptions = defaultUnitOptions,
  categories = [],
  materials = [],
}) => {
  const updateField = <K extends keyof ServiceFormState>(field: K, fieldValue: ServiceFormState[K]) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="grid gap-3">
      {categories.length > 0 && (
        <FormField label="Категория" help="Группировка в выборе продукта и калькуляторе">
          <select
            className="px-2 py-1 border rounded w-full"
            value={value.categoryId === '' ? '' : value.categoryId}
            disabled={disabled}
            onChange={(e) => updateField('categoryId', e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— Без категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <FormField label="Название" required>
        <input
          className="px-2 py-1 border rounded w-full"
          value={value.name}
          disabled={disabled}
          onChange={(e) => updateField('name', e.target.value)}
        />
      </FormField>
      <FormField label="Тип" help="print — печать, postprint — послепечатные, other — прочее">
        <select
          className="px-2 py-1 border rounded w-full"
          value={value.type}
          disabled={disabled}
          onChange={(e) => updateField('type', e.target.value as PricingServiceType)}
        >
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Тип операции" help="Строгий тип операции для расчета цены (laminate — ламинация, cut — резка, и т.д.)">
        <select
          className="px-2 py-1 border rounded w-full"
          value={value.operationType || 'other'}
          disabled={disabled}
          onChange={(e) => updateField('operationType', e.target.value)}
        >
          {operationTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Тип услуги" help="Простая — без вариантов, Сложная — с вариантами (например, ламинация с разными типами и плотностью)">
        <select
          className="px-2 py-1 border rounded w-full"
          value={value.hasVariants ? 'complex' : 'simple'}
          disabled={disabled}
          onChange={(e) => updateField('hasVariants', e.target.value === 'complex')}
        >
          <option value="simple">Простая</option>
          <option value="complex">Сложная</option>
        </select>
      </FormField>
      <FormField label="Единица" help="per_cut — за рез (умный расчет), per_item — за изделие, per_sheet — за лист, fixed — фиксированная цена">
        <select
          className="px-2 py-1 border rounded w-full"
          value={value.unit}
          disabled={disabled}
          onChange={(e) => updateField('unit', e.target.value)}
        >
          {unitOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Цена за единицу (BYN)" required>
        <input
          type="number"
          step="0.01"
          className="px-2 py-1 border rounded w-full"
          value={value.rate}
          disabled={disabled}
          onChange={(e) => updateField('rate', e.target.value)}
        />
      </FormField>
      <FormField label="Мин. тираж">
        <input
          type="number"
          min="1"
          className="px-2 py-1 border rounded w-full"
          value={value.minQuantity}
          disabled={disabled}
          onChange={(e) => updateField('minQuantity', e.target.value)}
          placeholder="1"
        />
      </FormField>
      <FormField label="Макс. тираж">
        <input
          type="number"
          min="1"
          className="px-2 py-1 border rounded w-full"
          value={value.maxQuantity}
          disabled={disabled}
          onChange={(e) => updateField('maxQuantity', e.target.value)}
          placeholder="без ограничений"
        />
      </FormField>
      <FormField label="Процент оператора (%)" help="Процент от суммы позиции заказа, который идёт в ЗП оператора">
        <input
          type="number"
          step="0.1"
          min="0"
          max="100"
          className="px-2 py-1 border rounded w-full"
          value={value.operatorPercent || ''}
          disabled={disabled}
          onChange={(e) => updateField('operatorPercent', e.target.value)}
          placeholder="0"
        />
      </FormField>
      {materials.length > 0 && (
        <>
          <FormField label="Материал для списания" help="При выполнении операции этот материал будет списываться со склада">
            <select
              className="px-2 py-1 border rounded w-full"
              value={value.materialId === '' ? '' : value.materialId}
              disabled={disabled}
              onChange={(e) => updateField('materialId', e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Без списания</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Норма расхода на ед. операции" help="Сколько единиц материала списывать на одну единицу операции (по умолчанию 1)">
            <input
              type="number"
              step="0.01"
              min="0"
              className="px-2 py-1 border rounded w-full"
              value={value.qtyPerItem}
              disabled={disabled}
              onChange={(e) => updateField('qtyPerItem', e.target.value)}
              placeholder="1"
            />
          </FormField>
        </>
      )}
      <label className="inline-flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={value.isActive}
          disabled={disabled}
          onChange={(e) => updateField('isActive', e.target.checked)}
        />
        Активна
      </label>
    </div>
  );
};

export default ServiceForm;


