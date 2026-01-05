/**
 * Пресеты параметров для разных типов продуктов
 */

export interface ParameterPreset {
  key: string;
  label: string;
  type: 'select' | 'number' | 'checkbox' | 'text' | 'range';
  options?: string[];
  is_required: boolean;
  help_text?: string;
  default_value?: string;
  sort_order: number;
}

// Базовые параметры для всех типов продуктов
const BASE_PARAMETERS: ParameterPreset[] = [
  {
    key: 'print_technology',
    label: 'Технология печати',
    type: 'select',
    options: ['laser_prof', 'laser_office', 'digital'],
    is_required: true,
    help_text: 'Тип оборудования для печати',
    sort_order: 10,
  },
  {
    key: 'print_color_mode',
    label: 'Режим печати',
    type: 'select',
    options: ['bw', 'color'],
    is_required: false,
    help_text: 'Черно-белая или цветная печать',
    sort_order: 11,
  },
  {
    key: 'material',
    label: 'Материал',
    type: 'select',
    options: ['gloss_150', 'matte_150', 'gloss_200', 'matte_200', 'cardboard_300'],
    is_required: true,
    help_text: 'Тип бумаги или материала',
    sort_order: 20,
  },
  {
    key: 'lamination',
    label: 'Ламинация',
    type: 'select',
    options: ['none', 'gloss', 'matte'],
    is_required: false,
    help_text: 'Тип ламинации',
    default_value: 'none',
    sort_order: 30,
  },
  {
    key: 'round_corners',
    label: 'Скругление углов',
    type: 'checkbox',
    is_required: false,
    help_text: 'Нужно ли скруглять углы',
    sort_order: 40,
  },
];

// Специфические параметры для листовых изделий
const SHEET_SINGLE_PARAMETERS: ParameterPreset[] = [
  ...BASE_PARAMETERS,
  {
    key: 'design',
    label: 'Дизайн',
    type: 'checkbox',
    is_required: false,
    help_text: 'Нужен ли дизайн',
    sort_order: 50,
  },
  {
    key: 'proof',
    label: 'Пробный оттиск',
    type: 'checkbox',
    is_required: false,
    help_text: 'Нужен ли пробный оттиск',
    sort_order: 51,
  },
];

// Специфические параметры для многостраничных изделий
const MULTI_PAGE_PARAMETERS: ParameterPreset[] = [
  ...BASE_PARAMETERS,
  {
    key: 'pages',
    label: 'Количество страниц',
    type: 'number',
    is_required: true,
    help_text: 'Общее количество страниц в изделии',
    default_value: '8',
    sort_order: 5,
  },
  {
    key: 'binding',
    label: 'Тип переплета',
    type: 'select',
    options: ['staple', 'perfect', 'wire', 'glue'],
    is_required: true,
    help_text: 'Способ скрепления страниц',
    default_value: 'staple',
    sort_order: 6,
  },
  {
    key: 'design',
    label: 'Дизайн',
    type: 'checkbox',
    is_required: false,
    help_text: 'Нужен ли дизайн',
    sort_order: 50,
  },
  {
    key: 'proof',
    label: 'Пробный оттиск',
    type: 'checkbox',
    is_required: false,
    help_text: 'Нужен ли пробный оттиск',
    sort_order: 51,
  },
];

// Специфические параметры для универсальных изделий
const UNIVERSAL_PARAMETERS: ParameterPreset[] = [
  // Для универсальных продуктов добавляем минимум базовых параметров
  // Пользователь может добавлять свои параметры вручную
  {
    key: 'print_technology',
    label: 'Технология печати',
    type: 'select',
    options: ['laser_prof', 'laser_office', 'digital', 'offset', 'screen'],
    is_required: false,
    help_text: 'Тип оборудования для печати (если применимо)',
    sort_order: 10,
  },
  {
    key: 'custom_notes',
    label: 'Особые требования',
    type: 'text',
    is_required: false,
    help_text: 'Дополнительные требования к продукту',
    sort_order: 100,
  },
];

/**
 * Получить пресеты параметров для указанного типа продукта
 */
export function getParameterPresetsForProductType(productType: string): ParameterPreset[] {
  switch (productType) {
    case 'sheet_single':
      return SHEET_SINGLE_PARAMETERS;
    case 'multi_page':
      return MULTI_PAGE_PARAMETERS;
    case 'universal':
      return UNIVERSAL_PARAMETERS;
    default:
      return BASE_PARAMETERS;
  }
}

/**
 * Получить все доступные пресеты параметров
 */
export function getAllParameterPresets(): Record<string, ParameterPreset[]> {
  return {
    base: BASE_PARAMETERS,
    sheet_single: SHEET_SINGLE_PARAMETERS,
    multi_page: MULTI_PAGE_PARAMETERS,
    universal: UNIVERSAL_PARAMETERS,
  };
}

/**
 * Найти пресет по ключу
 */
export function findParameterPreset(key: string, productType?: string): ParameterPreset | undefined {
  const presets = productType ? getParameterPresetsForProductType(productType) : BASE_PARAMETERS;
  return presets.find(preset => preset.key === key);
}
