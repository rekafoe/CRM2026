import React from 'react';
import { FormField } from '../../../common';
import { PricingServiceType } from '../../../../types/pricing';

export interface ServiceFormState {
  name: string;
  type: PricingServiceType;
  unit: string;
  rate: string;
  isActive: boolean;
}

interface ServiceFormProps {
  value: ServiceFormState;
  onChange: (next: ServiceFormState) => void;
  disabled?: boolean;
  typeOptions?: Array<{ value: PricingServiceType; label: string }>;
  unitOptions?: Array<{ value: string; label: string }>;
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

const ServiceForm: React.FC<ServiceFormProps> = ({
  value,
  onChange,
  disabled = false,
  typeOptions = defaultTypeOptions,
  unitOptions = defaultUnitOptions,
}) => {
  const updateField = <K extends keyof ServiceFormState>(field: K, fieldValue: ServiceFormState[K]) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="grid gap-3">
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


