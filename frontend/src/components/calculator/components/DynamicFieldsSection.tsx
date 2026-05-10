import React from 'react';
import { AppIcon } from '../../ui/AppIcon';

interface DynamicFieldsSectionProps {
  schema: any | null;
  specs: Record<string, any>;
  updateSpecs: (updates: Record<string, any>, instant?: boolean) => void; // 🆕 Добавили instant
  /** Не показывать эти поля (например, выборка/накатка вне рулонного плоттера). */
  hiddenFieldNames?: Set<string>;
}

// Поля, которые уже отрисовываются специализированными секциями
const RESERVED_FIELDS = new Set([
  'format',
  'quantity',
  'sides',
  'pages',
  'paperType',
  'paperDensity',
  'lamination',
  'material_id', // 🆕 Обрабатывается в MaterialsSection
  // Поля печати обрабатываются в PrintingSettingsSection
  'print_technology',
  'printTechnology',
  'print_color_mode',
  'printColorMode',
  'print_method', // Старое поле с захардкоженными значениями (Односторонняя цветная и т.д.)
  'printMethod',
  'printer',
  'printer_id',
  // Чекбоксы резка/фальцовка/скругление/магнит — в AdvancedSettingsSection
  'cutting',
  'folding',
  'roundCorners',
  'magnetic',
]);

export const DynamicFieldsSection: React.FC<DynamicFieldsSectionProps> = ({
  schema,
  specs,
  updateSpecs,
  hiddenFieldNames,
}) => {
  if (!schema || !Array.isArray(schema.fields)) return null;

  const fields = schema.fields.filter(
    (f: any) => !RESERVED_FIELDS.has(f.name) && !hiddenFieldNames?.has(f.name)
  );
  if (fields.length === 0) return null;

  const renderField = (field: any) => {
    const value = (specs as any)[field.name];

    // enum → select (поддержка объектов и строк)
    if (Array.isArray(field.enum) && field.enum.length > 0) {
      const isObjectEnum = typeof field.enum[0] === 'object' && field.enum[0] !== null;
      const shouldCastToNumber = field.type === 'number' || field.type === 'integer';
      
      return (
        <div className="param-group" key={field.name}>
          <label>{field.label || field.name}{field.required && '*'}</label>
          <select
            value={value ?? (field.enum.length > 0 ? (isObjectEnum ? field.enum[0].value : field.enum[0]) : '')}
            onChange={(e) => {
              const newValue = isObjectEnum
                  ? (shouldCastToNumber ? Number(e.target.value) : e.target.value)
                  : e.target.value;
              updateSpecs({ [field.name]: newValue }, true); // 🆕 instant для select
            }}
            className="form-control"
          >
            {field.enum.map((opt: any) => {
                const optValue = isObjectEnum ? opt.value : opt;
                const optLabel = isObjectEnum ? opt.label : opt;
                const optKey = typeof optValue === 'object' ? JSON.stringify(optValue) : String(optValue);
                
                return (
                  <option key={optKey} value={String(optValue)}>
                    {optLabel}
                  </option>
                );
            })}
          </select>
        </div>
      );
    }

    // boolean → checkbox
    if (field.type === 'boolean') {
      return (
        <div className="param-group checkbox-group" key={field.name}>
          <label>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => updateSpecs({ [field.name]: e.target.checked }, true)} // 🆕 instant
            />
            {field.label || field.name}
            {field.required ? ' *' : ''}
          </label>
        </div>
      );
    }

    // number → input number
    if (field.type === 'number' || field.type === 'integer') {
      return (
        <div className="param-group" key={field.name}>
          <label>{field.label || field.name}{field.required && '*'}</label>
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => updateSpecs({ [field.name]: e.target.value === '' ? undefined : Number(e.target.value) })}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            className="form-control"
          />
        </div>
      );
    }

    // string → input text
    return (
      <div className="param-group" key={field.name}>
        <label>{field.label || field.name}{field.required && '*'}</label>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => updateSpecs({ [field.name]: e.target.value })}
          placeholder={field.placeholder}
          className="form-control"
        />
      </div>
    );
  };

  return (
    <div className="form-section compact">
      <h3><AppIcon name="puzzle" size="xs" /> Доп. параметры</h3>
      <div className="advanced-grid compact">
        {fields.map(renderField)}
      </div>
    </div>
  );
};


