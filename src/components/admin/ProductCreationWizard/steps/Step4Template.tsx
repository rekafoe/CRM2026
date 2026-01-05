/**
 * Шаг 4: Настройки шаблона и параметры
 */

import React, { useMemo } from 'react';
import { Button, FormField, Alert } from '../../../common';
import { ProductParameterPreset } from '../../../../services/products';
import { FormState, ParameterDraft, TrimSize } from '../../hooks/useProductCreationWizardState';
import { getMissingRequiredParameters, shouldAutoAddFormatParameter, createFormatParameterFromSizes, ProductType } from '../utils/productTypeFields';
import { MultiSizeManager } from '../components/MultiSizeManager';
import { MultiPagePresetHelper, MultiPagePreset } from '../components/MultiPagePresetHelper';

interface Step4TemplateProps {
  form: FormState;
  parameterPresetsLoading: boolean;
  missingParameterPresets: ProductParameterPreset[];
  onAddPresetParameter: (preset: ProductParameterPreset) => void;
  onAddParameter: () => void;
  onUpdateParameter: (index: number, patch: Partial<ParameterDraft>) => void;
  onRemoveParameter: (index: number) => void;
  onUpdateTemplate: (template: Partial<FormState['template']>) => void;
  onAddOperation?: (operation: { operation_id: number; is_required: boolean; is_default: boolean; price_multiplier: number }) => void;
  operations?: Array<{ id: number; name: string }>;
}

const PARAM_TYPE_OPTIONS = [
  { value: 'select', label: 'Список значений' },
  { value: 'number', label: 'Число' },
  { value: 'range', label: 'Диапазон' },
  { value: 'checkbox', label: 'Флажок' },
  { value: 'text', label: 'Строка' },
];

export const Step4Template: React.FC<Step4TemplateProps> = ({
  form,
  parameterPresetsLoading,
  missingParameterPresets,
  onAddPresetParameter,
  onAddParameter,
  onUpdateParameter,
  onRemoveParameter,
  onUpdateTemplate,
  onAddOperation,
  operations = [],
}) => {
  // Определяем обязательные параметры, которые отсутствуют
  const requiredMissing = React.useMemo(() => {
    if (parameterPresetsLoading || !missingParameterPresets.length) return []
    return getMissingRequiredParameters(
      missingParameterPresets,
      form.parameters
    )
  }, [missingParameterPresets, form.parameters, parameterPresetsLoading])

  // Определяем, является ли продукт многостраничным
  const isMultiPage = form.product_type === 'multi_page' || 
    ['booklets', 'brochures', 'catalogs', 'magazines'].includes(form.operation_preset || '')

  // Получаем текущее количество страниц из параметров
  const currentPages = useMemo(() => {
    const pagesParam = form.parameters.find(p => p.name === 'pages')
    if (pagesParam?.default_value) {
      return parseInt(pagesParam.default_value) || undefined
    }
    return undefined
  }, [form.parameters])

  // Получаем текущий тип скрепления
  const currentBinding = useMemo(() => {
    const bindingParam = form.parameters.find(p => p.name === 'binding')
    return bindingParam?.default_value || undefined
  }, [form.parameters])

  // Управление несколькими размерами
  const trimSizes = useMemo(() => {
    if (form.template.trim_sizes && form.template.trim_sizes.length > 0) {
      return form.template.trim_sizes
    }
    // Если есть старые поля, конвертируем их
    if (form.template.trim_width || form.template.trim_height) {
      return [{
        id: 'size-1',
        width: form.template.trim_width || '',
        height: form.template.trim_height || '',
        label: 'Основной размер'
      }]
    }
    return []
  }, [form.template.trim_sizes, form.template.trim_width, form.template.trim_height])

  const handleAddSize = () => {
    const newSize: TrimSize = {
      id: `size-${Date.now()}`,
      width: '',
      height: '',
    }
    const updatedSizes = [...trimSizes, newSize]
    onUpdateTemplate({
      trim_sizes: updatedSizes
    })

    // Автоматически создаем параметр format если нужно (для любого типа продукта с несколькими размерами)
    if (shouldAutoAddFormatParameter(
      form.product_type as ProductType,
      updatedSizes,
      form.parameters
    )) {
      const formatParam = createFormatParameterFromSizes(updatedSizes)
      onAddPresetParameter({
        id: 0,
        preset_key: formatParam.name,
        label: formatParam.label,
        field_type: 'select',
        options: formatParam.options,
        is_required: formatParam.is_required,
        sort_order: 0,
      } as ProductParameterPreset)
    }
  }

  const handleUpdateSize = (id: string, patch: Partial<TrimSize>) => {
    const updated = trimSizes.map(size => 
      size.id === id ? { ...size, ...patch } : size
    )
    onUpdateTemplate({ trim_sizes: updated })

    // Обновляем параметр format если он существует (для любого типа продукта)
    const formatParamIndex = form.parameters.findIndex(p => p.name === 'format')
    if (formatParamIndex >= 0 && shouldAutoAddFormatParameter(
      form.product_type as ProductType,
      updated,
      form.parameters
    )) {
      const formatParam = createFormatParameterFromSizes(updated)
      onUpdateParameter(formatParamIndex, {
        options: formatParam.options.join(', ')
      })
    }
  }

  const handleRemoveSize = (id: string) => {
    const updated = trimSizes.filter(size => size.id !== id)
    onUpdateTemplate({ trim_sizes: updated })
  }

  // Применение пресета многостраничного изделия
  const handleApplyMultiPagePreset = (preset: MultiPagePreset) => {
    // Добавляем параметр pages если его нет
    const pagesParam = form.parameters.find(p => p.name === 'pages')
    if (!pagesParam) {
      onAddPresetParameter({
        id: 0,
        preset_key: 'pages',
        label: 'Количество страниц',
        field_type: 'select',
        options: preset.pages.map(p => String(p)),
        is_required: true,
        sort_order: 0,
      } as ProductParameterPreset)
    } else {
      // Обновляем опции
      const pagesIndex = form.parameters.findIndex(p => p.name === 'pages')
      if (pagesIndex >= 0) {
        onUpdateParameter(pagesIndex, { 
          options: preset.pages.map(p => String(p)).join(', ') 
        })
      }
    }

    // Добавляем параметр binding если его нет
    const bindingParam = form.parameters.find(p => p.name === 'binding')
    const bindingOptions = preset.binding === 'staple' 
      ? ['staple', 'none']
      : preset.binding === 'perfect'
        ? ['perfect', 'staple', 'none']
        : preset.binding === 'spiral'
          ? ['spiral', 'staple', 'none']
          : ['staple', 'perfect', 'spiral', 'none']
    
    if (!bindingParam) {
      onAddPresetParameter({
        id: 0,
        preset_key: 'binding',
        label: 'Тип скрепления',
        field_type: 'select',
        options: bindingOptions,
        is_required: true,
        sort_order: 0,
      } as ProductParameterPreset)
    } else {
      // Обновляем опции
      const bindingIndex = form.parameters.findIndex(p => p.name === 'binding')
      if (bindingIndex >= 0) {
        onUpdateParameter(bindingIndex, { 
          options: bindingOptions.join(', '), 
          default_value: preset.binding 
        })
      }
    }

    // Применяем дополнительные параметры из пресета
    if (preset.autoParameters) {
      Object.entries(preset.autoParameters).forEach(([paramName, paramConfig]) => {
        const existingParam = form.parameters.find(p => p.name === paramName)
        if (!existingParam) {
          onAddPresetParameter({
            id: 0,
            preset_key: paramName,
            label: paramName,
            field_type: paramConfig.type as 'select' | 'number' | 'text' | 'checkbox',
            options: paramConfig.options,
            default_value: paramConfig.default,
            is_required: false,
            sort_order: 0,
          } as ProductParameterPreset)
        }
      })
    }

    // Автоматически добавляем операции если они указаны и есть функция добавления
    if (preset.autoOperations && onAddOperation && operations.length > 0) {
      preset.autoOperations.forEach(opName => {
        // Ищем операцию по ключевым словам
        const operation = operations.find(op => {
          const opNameLower = op.name.toLowerCase()
          const searchName = opName.toLowerCase()
          
          return opNameLower.includes(searchName) ||
            (searchName === 'folding' && (opNameLower.includes('фальц') || opNameLower.includes('сгиб'))) ||
            (searchName === 'stapling' && (opNameLower.includes('скоб') || opNameLower.includes('степ'))) ||
            (searchName === 'perfect_binding' && (opNameLower.includes('склей') || opNameLower.includes('клей'))) ||
            (searchName === 'spiral_binding' && (opNameLower.includes('спираль') || opNameLower.includes('пружин')))
        })
        
        if (operation && !form.selectedOperations.some(so => so.operation_id === operation.id)) {
          onAddOperation({
            operation_id: operation.id,
            is_required: true,
            is_default: true,
            price_multiplier: 1,
          })
        }
      })
    }

    // Применяем рекомендуемые форматы если они указаны
    if (preset.recommendedFormats && preset.recommendedFormats.length > 0) {
      // Можно автоматически добавить размеры из рекомендуемых форматов
      const formatSizes: Record<string, { width: string; height: string }> = {
        A4: { width: '210', height: '297' },
        A5: { width: '148', height: '210' },
        A6: { width: '105', height: '148' },
        A3: { width: '297', height: '420' },
      }

      const newSizes = preset.recommendedFormats
        .filter(format => formatSizes[format])
        .map(format => ({
          id: `size-${format}-${Date.now()}`,
          width: formatSizes[format].width,
          height: formatSizes[format].height,
          label: format,
        }))
        .filter(newSize => !trimSizes.some(existing => 
          existing.width === newSize.width && existing.height === newSize.height
        ))

      if (newSizes.length > 0 && form.product_type === 'multi_page') {
        onUpdateTemplate({
          trim_sizes: [...trimSizes, ...newSizes]
        })
      }
    }
  }

  return (
    <div className="wizard-step flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-primary">Настройки шаблона</h4>
      
      {/* Предупреждение о недостающих обязательных параметрах */}
      {requiredMissing.length > 0 && (
        <Alert type="warning">
          <div className="flex flex-col gap-2">
            <strong>Рекомендуется добавить обязательные параметры:</strong>
            <div className="flex flex-wrap gap-2">
              {requiredMissing.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onAddPresetParameter(preset)}
                >
                  + {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-secondary">Рекомендуемые параметры для выбранного типа продукта</span>
        {parameterPresetsLoading ? (
          <span className="text-secondary text-sm">Загрузка пресетов…</span>
        ) : missingParameterPresets.length ? (
          <div className="flex flex-wrap gap-2">
            {missingParameterPresets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onAddPresetParameter(preset)}
                className={preset.is_required ? 'border-warning' : ''}
              >
                {preset.is_required ? '⚠️ ' : ''}+ {preset.label}
              </Button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted">Все основные параметры добавлены.</span>
        )}
      </div>

      {/* Помощник для многостраничных изделий */}
      {isMultiPage && (
        <MultiPagePresetHelper
          productType={form.product_type}
          operationPreset={form.operation_preset}
          onApplyPreset={handleApplyMultiPagePreset}
          currentPages={currentPages}
          currentBinding={currentBinding}
        />
      )}

      {/* Управление размерами - унифицированный подход для всех типов */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-primary">
            {isMultiPage ? 'Доступные форматы (для многостраничных изделий)' : 'Доступные форматы (для листовых изделий)'}
          </label>
          {!isMultiPage && trimSizes.length === 0 && (
            <span className="text-xs text-muted">
              💡 Можно добавить несколько вариантов размеров
            </span>
          )}
        </div>
        <MultiSizeManager
          sizes={trimSizes}
          onAdd={handleAddSize}
          onUpdate={handleUpdateSize}
          onRemove={handleRemoveSize}
          productType={form.product_type}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <FormField label="Пресет печатного листа" className="flex-1">
          <input
            className="form-input"
            value={form.template.print_sheet_preset}
            onChange={(e) => onUpdateTemplate({ print_sheet_preset: e.target.value })}
            placeholder="SRA3"
          />
        </FormField>
        <FormField label="Печатный лист, ширина (мм)" className="flex-1">
          <input
            className="form-input"
            value={form.template.print_sheet_width}
            onChange={(e) => onUpdateTemplate({ print_sheet_width: e.target.value })}
            placeholder="320"
          />
        </FormField>
        <FormField label="Печатный лист, высота (мм)" className="flex-1">
          <input
            className="form-input"
            value={form.template.print_sheet_height}
            onChange={(e) => onUpdateTemplate({ print_sheet_height: e.target.value })}
            placeholder="450"
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.template.print_run_enabled}
            onChange={(e) => onUpdateTemplate({ print_run_enabled: e.target.checked })}
          />
          Управлять диапазоном тиражей
        </label>
        {form.template.print_run_enabled && (
          <div className="flex flex-wrap gap-4">
            <FormField label="Минимальный тираж" className="flex-1">
              <input
                className="form-input"
                value={form.template.print_run_min}
                onChange={(e) => onUpdateTemplate({ print_run_min: e.target.value })}
                placeholder="100"
              />
            </FormField>
            <FormField label="Максимальный тираж" className="flex-1">
              <input
                className="form-input"
                value={form.template.print_run_max}
                onChange={(e) => onUpdateTemplate({ print_run_max: e.target.value })}
                placeholder="10000"
              />
            </FormField>
          </div>
        )}
      </div>

      <div className="parameters-section">
        <div className="parameters-header flex items-center justify-between gap-4">
          <h5 className="text-base font-semibold text-primary">Параметры продукта</h5>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddParameter}
            className="flex items-center gap-1"
          >
            + Добавить параметр
          </Button>
        </div>
        {form.parameters.length === 0 && <p className="text-secondary">Параметры не заданы.</p>}
        {form.parameters.map((parameter, index) => (
          <div key={index} className="parameter-item">
            <div className="parameter-row">
              <input
                className="form-input"
                placeholder="Ключ (например, format)"
                value={parameter.name}
                onChange={(e) => onUpdateParameter(index, { name: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="Заголовок"
                value={parameter.label}
                onChange={(e) => onUpdateParameter(index, { label: e.target.value })}
              />
              <select
                className="form-select"
                value={parameter.type}
                onChange={(e) => onUpdateParameter(index, { type: e.target.value })}
              >
                {PARAM_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="parameter-required">
                <input
                  type="checkbox"
                  checked={parameter.is_required}
                  onChange={(e) => onUpdateParameter(index, { is_required: e.target.checked })}
                />
                Обязательный
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onRemoveParameter(index)}
              >
                ✕
              </Button>
            </div>
            {parameter.type === 'select' && (
              <input
                className="form-input"
                placeholder="Опции через запятую"
                value={parameter.options}
                onChange={(e) => onUpdateParameter(index, { options: e.target.value })}
              />
            )}
            {(parameter.type === 'number' || parameter.type === 'range') && (
              <div className="form-row">
                <input
                  className="form-input"
                  placeholder="Мин"
                  type="number"
                  value={parameter.min_value ?? ''}
                  onChange={(e) =>
                    onUpdateParameter(index, {
                      min_value: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
                <input
                  className="form-input"
                  placeholder="Макс"
                  type="number"
                  value={parameter.max_value ?? ''}
                  onChange={(e) =>
                    onUpdateParameter(index, {
                      max_value: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
                <input
                  className="form-input"
                  placeholder="Шаг"
                  type="number"
                  value={parameter.step ?? ''}
                  onChange={(e) =>
                    onUpdateParameter(index, {
                      step: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

