import React from 'react';
import { FormField } from '../../../common';
import { BynSymbol } from '../../../ui';
import { PricingServiceType, ServiceConsumptionMode, ServiceMeterBasis } from '../../../../types/pricing';
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
  /** Режим расхода материала: fixed или roll_feed */
  consumptionMode: ServiceConsumptionMode;
  /** База метража для per_meter: feed или knife_path */
  meterBasis: ServiceMeterBasis;
}

interface ServiceFormProps {
  value: ServiceFormState;
  onChange: (next: ServiceFormState) => void;
  disabled?: boolean;
  /** default — полная форма; binding — переплёт; wideformat — ШФП послепечатка */
  variant?: 'default' | 'binding' | 'wideformat';
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
  { value: 'item', label: 'шт (изделие)' },
  { value: 'sheet', label: 'лист' },
  { value: 'hour', label: 'час' },
  { value: 'm2', label: 'кв. метры (м²)' },
  { value: 'click', label: 'клик' },
  { value: 'per_cut', label: 'за рез (per_cut)' },
  { value: 'шт', label: 'шт' },
  { value: 'per_sheet', label: 'за лист (per_sheet)' },
  { value: 'per_item', label: 'за изделие (per_item)' },
  { value: 'per_m2', label: 'кв. метры (per_m2)' },
  { value: 'fixed', label: 'фикс. цена (fixed)' },
  { value: 'per_order', label: 'за заказ (per_order)' },
  { value: 'per_meter', label: 'пог. м (per_meter)' },
];

const operationTypeOptions = [
  { value: 'other', label: 'other (прочее)' },
  { value: 'print', label: 'print (печать)' },
  { value: 'laminate', label: 'laminate (ламинация)' },
  { value: 'cut', label: 'cut (резка)' },
  { value: 'plotter_cut', label: 'plotter_cut (плоттер)' },
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

const consumptionModeOptions: Array<{ value: ServiceConsumptionMode; label: string }> = [
  { value: 'fixed', label: 'fixed (qty_per_item × units)' },
  { value: 'roll_feed', label: 'roll_feed (подача рулона)' },
];

const meterBasisOptions: Array<{ value: ServiceMeterBasis; label: string }> = [
  { value: 'feed', label: 'feed (подача по раскладке)' },
  { value: 'knife_path', label: 'knife_path (по пробегу ножа)' },
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
  const isWideFormat = variant === 'wideformat';
  const showMaterialConsumption = materials.length > 0 && value.materialId !== '';
  const showMeterBasis = value.consumptionMode === 'roll_feed' || value.unit === 'per_meter';

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
      {isWideFormat && (
        <div className="service-form-binding-hint service-form__full" role="status">
          <strong>ШФП послепечатка</strong>
          <span className="service-form-binding-hint__muted">
            Тариф за м² рулона (ширина × подача). После создания добавьте варианты по ширинам и привяжите рулоны
            со склада — в селекте материала видна ширина в мм.
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
            placeholder={
              isBinding
                ? 'Например: Брошюровка на скобу'
                : isWideFormat
                  ? 'Например: Ламинация рулонная'
                  : 'Название услуги'
            }
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
              : isWideFormat
                ? 'Для ШФП: per_m2 — м² по ширине рулона × подаче'
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
        <FormField label={<>Цена (<BynSymbol />) *</>} required>
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
        <>
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
          {showMaterialConsumption && (
            <div className="service-form__row">
              <FormField
                label="Режим расхода"
                help="fixed — по units операции; roll_feed — по подаче рулона"
              >
                <select
                  className={inputClass}
                  value={value.consumptionMode}
                  disabled={disabled}
                  onChange={(e) => updateField('consumptionMode', e.target.value as ServiceConsumptionMode)}
                >
                  {consumptionModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="База metering"
                help="Для per_meter и roll_feed: обычно feed для рулонной ламинации"
              >
                <select
                  className={inputClass}
                  value={value.meterBasis}
                  disabled={disabled || !showMeterBasis}
                  onChange={(e) => updateField('meterBasis', e.target.value as ServiceMeterBasis)}
                >
                  {meterBasisOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          )}
        </>
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


