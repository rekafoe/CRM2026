import React from 'react';
import { FormField } from '../../../common';
import { PricingServiceType } from '../../../../types/pricing';
import './ServiceForm.css';

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
  /** default — полная форма; binding — переплёт: скрыты лишние поля (тип и операция фиксированы на бэкенде) */
  variant?: 'default' | 'binding';
  /** Автофокус в поле «Название» (модалка создания) */
  autoFocusName?: boolean;
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

const inputClass = 'form-input w-full';

const ServiceForm: React.FC<ServiceFormProps> = ({
  value,
  onChange,
  disabled = false,
  variant = 'default',
  autoFocusName = false,
  typeOptions = defaultTypeOptions,
  unitOptions = defaultUnitOptions,
  categories = [],
  materials = [],
}) => {
  const updateField = <K extends keyof ServiceFormState>(field: K, fieldValue: ServiceFormState[K]) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const isBinding = variant === 'binding';

  return (
    <div className="service-form-grid">
      {isBinding && (
        <div className="service-form-binding-hint service-form__full" role="status">
          <strong>Переплёт</strong>
          <span className="service-form-binding-hint__muted">
            Тип услуги postprint и операция bind задаются при сохранении. Категорию при необходимости укажите в
            редактировании услуги.
          </span>
        </div>
      )}
      {!isBinding && categories.length > 0 && (
        <div className="service-form__full">
          <FormField label="Категория" help="Группировка в выборе продукта и калькуляторе">
            <select
              className={inputClass}
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
        </div>
      )}
      <div className="service-form__full">
        <FormField label="Название" required>
          <input
            className={inputClass}
            value={value.name}
            disabled={disabled}
            autoFocus={autoFocusName}
            autoComplete="off"
            placeholder={isBinding ? 'Например: Брошюровка на скобу' : 'Название услуги'}
            onChange={(e) => updateField('name', e.target.value)}
          />
        </FormField>
      </div>
      {!isBinding && (
        <div className="service-form__row">
          <FormField label="Тип" help="print — печать, postprint — послепечатные, other — прочее">
            <select
              className={inputClass}
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
          <FormField label="Тип операции" help="laminate, cut, bind и т.д. — для расчёта и отчётов">
            <select
              className={inputClass}
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
        </div>
      )}
      <div className="service-form__full">
        <FormField label="Тип услуги" help="Простая — без вариантов, сложная — с вариантами (ламинация, плотность и т.п.)">
          <select
            className={inputClass}
            value={value.hasVariants ? 'complex' : 'simple'}
            disabled={disabled}
            onChange={(e) => updateField('hasVariants', e.target.value === 'complex')}
          >
            <option value="simple">Простая</option>
            <option value="complex">Сложная</option>
          </select>
        </FormField>
      </div>
      <div className="service-form__row">
        <FormField
          label="Единица"
          help={
            isBinding
              ? 'Часто: per_item или fixed'
              : 'per_item, per_sheet, per_cut, fixed…'
          }
        >
          <select
            className={inputClass}
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
        <FormField label="Цена (BYN) *" required>
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={value.rate}
            disabled={disabled}
            onChange={(e) => updateField('rate', e.target.value)}
            placeholder="0"
          />
        </FormField>
      </div>
      <div className="service-form__row">
        <FormField label="Мин. тираж">
          <input
            type="number"
            min="1"
            className={inputClass}
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
            className={inputClass}
            value={value.maxQuantity}
            disabled={disabled}
            onChange={(e) => updateField('maxQuantity', e.target.value)}
            placeholder="без ограничений"
          />
        </FormField>
      </div>
      <div className="service-form__full">
        <FormField label="Процент оператора (%)" help="Доля в ЗП оператора от суммы позиции">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            className={inputClass}
            value={value.operatorPercent || ''}
            disabled={disabled}
            onChange={(e) => updateField('operatorPercent', e.target.value)}
            placeholder="0"
          />
        </FormField>
      </div>
      {materials.length > 0 && (
        <div className="service-form__row">
          <FormField label="Материал для списания" help="Со склада при выполнении операции">
            <select
              className={inputClass}
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
          <FormField label="Расход на ед." help="Норма на одну единицу операции">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              value={value.qtyPerItem}
              disabled={disabled}
              onChange={(e) => updateField('qtyPerItem', e.target.value)}
              placeholder="1"
            />
          </FormField>
        </div>
      )}
      <label className="service-form__full inline-flex items-center gap-2 text-sm text-gray-600">
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


