/**
 * Шаг 1: Основная информация о продукте
 */

import React from 'react';
import { FormField, Alert } from '../../../common';
import { ProductCategory } from '../../../../services/products';
import { FormState } from '../../hooks/useProductCreationWizardState';

interface Step1BasicInfoProps {
  form: FormState;
  categories: ProductCategory[];
  updateFormField: (field: keyof FormState, value: any) => void;
}

const PRODUCT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'sheet_single', label: 'Листовое изделие' },
  { value: 'multi_page', label: 'Многостраничное' },
  { value: 'universal', label: 'Универсальное' },
];

const OPERATION_CALCULATOR_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sheet_item', label: 'Листовое изделие (операции)' },
  { value: 'multi_page_item', label: 'Многостраничное изделие (операции)' },
];

const OPERATION_PRESET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'business_cards', label: 'Визитки' },
  { value: 'flyers', label: 'Листовки' },
  { value: 'booklets', label: 'Буклеты' },
  { value: 'posters', label: 'Плакаты' },
];

type CalculatorType = 'product' | 'operation';

export const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({
  form,
  categories,
  updateFormField,
}) => {
  return (
    <div className="wizard-step flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-primary">Основная информация</h4>
      
      <FormField label="Категория">
        <select
          className="form-select"
          value={form.category_id ?? ''}
          onChange={(e) =>
            updateFormField('category_id', e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">Без категории</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Название" required>
        <input
          className="form-input"
          value={form.name}
          onChange={(e) => updateFormField('name', e.target.value)}
          placeholder="Например: Визитки премиум"
        />
      </FormField>

      <FormField label="Описание">
        <textarea
          className="form-textarea"
          value={form.description}
          onChange={(e) => updateFormField('description', e.target.value)}
          placeholder="Краткое описание продукта"
          rows={3}
        />
      </FormField>

      <div className="flex flex-wrap gap-4">
        <FormField label="Тип калькулятора" className="flex-1">
          <select
            className="form-select"
            value={form.calculator_type}
            onChange={(e) =>
              updateFormField('calculator_type', e.target.value as CalculatorType)
            }
          >
            <option value="product">Продуктовый</option>
            <option value="operation">Операционный</option>
          </select>
        </FormField>
      </div>

      <div className="flex flex-wrap gap-4">
        <FormField label="Тип продукта" className="flex-1">
          <select
            className="form-select"
            value={form.product_type}
            onChange={(e) => updateFormField('product_type', e.target.value)}
          >
            {(form.calculator_type === 'product'
              ? PRODUCT_TYPE_OPTIONS
              : OPERATION_CALCULATOR_TYPES
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Тип для автоподбора операций" className="flex-1">
          <select
            className="form-select"
            value={form.operation_preset}
            onChange={(e) => updateFormField('operation_preset', e.target.value)}
          >
            {OPERATION_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Подсказки по типам продуктов */}
      {form.product_type === 'sheet_single' && (
        <Alert type="info">
          <div className="flex flex-col gap-1">
            <strong>Листовое изделие</strong>
            <span className="text-sm">Один лист бумаги с печатью. Может иметь несколько форматов. Примеры: визитки, листовки, флаеры, наклейки.</span>
          </div>
        </Alert>
      )}

      {form.product_type === 'multi_page' && (
        <Alert type="info">
          <div className="flex flex-col gap-1">
            <strong>Многостраничное изделие</strong>
            <span className="text-sm">Изделие из нескольких страниц с переплетом. Обязательны параметры: количество страниц и тип скрепления. Примеры: буклеты, брошюры, каталоги, журналы.</span>
          </div>
        </Alert>
      )}

      {form.product_type === 'universal' && (
        <Alert type="info">
          <div className="flex flex-col gap-1">
            <strong>Универсальное изделие</strong>
            <span className="text-sm">Гибкая настройка для нестандартных продуктов. Все параметры задаются вручную.</span>
          </div>
        </Alert>
      )}

      {form.product_type === 'sheet_item' && (
        <Alert type="info">
          <div className="flex flex-col gap-1">
            <strong>Листовое изделие (операционный калькулятор)</strong>
            <span className="text-sm">Расчет стоимости на основе операций для листовой продукции.</span>
          </div>
        </Alert>
      )}

      {form.product_type === 'multi_page_item' && (
        <Alert type="info">
          <div className="flex flex-col gap-1">
            <strong>Многостраничное изделие (операционный калькулятор)</strong>
            <span className="text-sm">Расчет стоимости на основе операций для многостраничной продукции.</span>
          </div>
        </Alert>
      )}
    </div>
  );
};

