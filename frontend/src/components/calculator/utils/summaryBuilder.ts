import { RESERVED_DYNAMIC_FIELDS, LAMINATION_LABELS, PRICE_TYPE_LABELS, CUSTOMER_TYPE_LABELS } from './constants';

export interface BuildSummaryOptions {
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  warehousePaperTypes?: Array<{ name: string; display_name: string }>;
  productTypeLabels?: Record<string, string>;
  schema?: any | null; //  Схема продукта для определения multi_page
}

type SummaryFormatter = (
  value: any,
  context: { specs: Record<string, any>; options: BuildSummaryOptions }
) => string | null;

export const BASE_SUMMARY_FIELDS: Array<{ key: string; label: string; formatter?: SummaryFormatter }> = [
  {
    key: 'productType',
    label: 'Тип продукта',
    formatter: (value, { options }) => {
      // Используем загруженные названия из API или значение по умолчанию
      const labels = options.productTypeLabels || {};
      return labels[String(value)] ?? String(value);
    },
  },
  {
    key: 'format',
    label: 'Формат печати',
    formatter: (value, { options, specs }) => {
      //  ВАЖНО: Если формат уже в формате "50×90 мм", используем его напрямую
      // Проверяем разные варианты символа умножения (×, x, X) и наличие "мм"
      if (typeof value === 'string') {
        const hasMultiplication = value.includes('×') || value.includes('x') || value.includes('X');
        const hasMm = value.includes('мм') || value.includes('mm') || value.includes('MM');
        if (hasMultiplication && hasMm) {
          return value; // Уже в правильном формате
        }
      }
      
      // Если указан кастомный формат, используем его
      if (options.isCustomFormat && options.customFormat) {
        const width = options.customFormat.width || specs.customWidth || specs.width;
        const height = options.customFormat.height || specs.customHeight || specs.height;
        if (width && height) {
          return `${width}×${height} мм`;
        }
      }
      
      // Если значение не "custom", возвращаем его как есть
      // Но если это стандартный формат (A4, A5 и т.д.), оставляем как есть
      if (value && value !== 'custom') {
        return String(value);
      }
      return null;
    },
  },
  {
    key: 'quantity',
    label: 'Тираж',
    formatter: (value) => {
      if (value == null) return null;
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return `${num.toLocaleString()} шт.`;
    },
  },
  {
    key: 'sides',
    label: 'Стороны печати',
    formatter: (value) => {
      if (value == null) return null;
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return num === 2 ? 'Двусторонняя' : 'Односторонняя';
    },
  },
  {
    key: 'paperType',
    label: 'Материал',
    formatter: (value, { options, specs }) => {
      if (!value) return null;
      
      //  Для упрощённых продуктов: если есть materialType, используем его вместо paperType
      // materialType содержит правильный тип бумаги из paper_type_id выбранного материала
      // paperType может быть не установлен или установлен неправильно для упрощённых продуктов
      if (specs.materialType && specs.material_id) {
        // Это упрощённый продукт - используем materialType
        const materialTypePaperType = options.warehousePaperTypes?.find(pt => pt.name === String(specs.materialType));
        if (materialTypePaperType) {
          return materialTypePaperType.display_name;
        }
      }
      
      // Для обычных продуктов: используем display_name из типов бумаги со склада
      const paperType = options.warehousePaperTypes?.find(pt => pt.name === String(value));
      return paperType?.display_name || String(value);
    },
  },
  {
    key: 'paperDensity',
    label: 'Плотность бумаги',
    formatter: (value) => {
      if (value == null) return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return null;
      return `${num} г/м²`;
    },
  },
  {
    key: 'lamination',
    label: 'Ламинация',
    formatter: (value) => {
      if (!value || value === 'none') return null;
      return LAMINATION_LABELS[String(value)] ?? String(value);
    },
  },
  {
    key: 'priceType',
    label: 'Срок изготовления',
    formatter: (value) => {
      if (!value) return null;
      return PRICE_TYPE_LABELS[String(value)] ?? String(value);
    },
  },
  {
    key: 'customerType',
    label: 'Тип клиента',
    formatter: (value) => {
      if (!value || value === 'regular') return null;
      return CUSTOMER_TYPE_LABELS[String(value)] ?? String(value);
    },
  },
  {
    key: 'pages',
    label: 'Количество страниц',
    formatter: (value, { specs, options }) => {
      if (value == null) return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return null;
      
      //  Показываем количество страниц только для multi_page продуктов
      // Проверяем наличие поля 'pages' в схеме продукта
      // Если поле 'pages' есть в схеме с enum - это multi_page продукт
      const schema = options.schema;
      const hasPagesField = schema?.fields?.some((f: any) => f.name === 'pages' && Array.isArray(f.enum));
      
      if (!hasPagesField) {
        // Это не multi_page продукт, не показываем количество страниц
        return null;
      }
      
      return `${num} стр.`;
    },
  },
  {
    key: 'roundCorners',
    label: 'Скругление углов',
    formatter: (value) => (value ? 'Да' : null),
  },
  {
    key: 'magnetic',
    label: 'Магнитные',
    formatter: (value) => (value ? 'Да' : null),
  },
  {
    key: 'cutting',
    label: 'Резка',
    formatter: (value) => (value ? 'Да' : null),
  },
  {
    key: 'folding',
    label: 'Фальцовка',
    formatter: (value) => (value ? 'Да' : null),
  },
  {
    key: 'materialType',
    label: 'Тип материала',
    formatter: (value, { options }) => {
      if (!value) return null;
      //  Используем display_name из типов бумаги со склада для транслирования
      // Это позволяет оператору видеть понятное название типа бумаги (например, "Глянцевая" вместо "glossy")
      // Плотности для материалов разных типов могут быть одинаковыми, поэтому нужен именно тип бумаги
      const paperType = options.warehousePaperTypes?.find(pt => pt.name === String(value));
      return paperType?.display_name || String(value);
    },
  },
  {
    key: 'specialServices',
    label: 'Доп. услуги',
    formatter: (value) => {
      if (!Array.isArray(value) || value.length === 0) return null;
      return value.join(', ');
    },
  },
];

const formatDynamicValue = (field: any, raw: any): string | null => {
  if (raw === undefined || raw === null) return null;

  if (Array.isArray(field.enum) && field.enum.length > 0) {
    return String(raw);
  }

  switch (field.type) {
    case 'boolean':
      return raw ? 'Да' : null;
    case 'number':
    case 'integer':
      if (Number.isFinite(Number(raw))) {
        return String(raw);
      }
      return null;
    default:
      if (typeof raw === 'string' && raw.trim() !== '') {
        return raw;
      }
  }

  if (Array.isArray(raw) && raw.length) {
    return raw.join(', ');
  }

  return null;
};

export const buildParameterSummary = (
  specs: Record<string, any>,
  schema: any | null,
  options: BuildSummaryOptions
): Array<{ key: string; label: string; value: string }> => {
  const summary: Array<{ key: string; label: string; value: string }> = [];
  const seenKeys = new Set<string>();

  //  Передаем schema в options для использования в formatters
  const optionsWithSchema = {
    ...options,
    schema
  };

  for (const field of BASE_SUMMARY_FIELDS) {
    const value = specs[field.key];
    if (value === undefined || value === null || value === '') continue;
    
    //  Детальное логирование для формата
    if (field.key === 'format') {
      console.log('[buildParameterSummary] Обработка формата:', {
        value,
        valueType: typeof value,
        isCustomFormat: options.isCustomFormat,
        customFormat: options.customFormat,
        hasMultiplication: typeof value === 'string' && (value.includes('×') || value.includes('x') || value.includes('X')),
        hasMm: typeof value === 'string' && (value.includes('мм') || value.includes('mm') || value.includes('MM'))
      });
    }
    
    const formatted = field.formatter
      ? field.formatter(value, { specs, options: optionsWithSchema })
      : String(value);
    
    //  Логирование результата для формата
    if (field.key === 'format') {
      console.log('[buildParameterSummary] Результат форматирования формата:', {
        originalValue: value,
        formatted,
        willBeAdded: !!formatted
      });
    }
    
    if (!formatted) continue;
    summary.push({ key: field.key, label: field.label, value: formatted });
    seenKeys.add(field.key);
  }

  if (schema && Array.isArray(schema.fields)) {
    for (const field of schema.fields) {
      if (RESERVED_DYNAMIC_FIELDS.has(field.name)) continue;
      if (seenKeys.has(field.name)) continue;
      // Убираем дублирующуюся строку "Печать: ..." из описания позиции
      // (у нас уже есть базовое поле "Стороны печати", а "Печать" часто приходит как legacy-parameter)
      const fieldLabel = String(field.label || '');
      if (fieldLabel.trim() === 'Печать') continue;
      if (['print_method', 'printMethod', 'printing', 'print_mode', 'printMode'].includes(String(field.name))) continue;
      const value = specs[field.name];
      const formatted = formatDynamicValue(field, value);
      if (!formatted) continue;
      summary.push({
        key: field.name,
        label: field.label || field.name,
        value: formatted,
      });
      seenKeys.add(field.name);
    }
  }

  return summary;
};

