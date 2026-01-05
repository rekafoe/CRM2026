/**
 * Утилиты для применения особенных полей продуктов в зависимости от их типа
 */

import { ProductParameterPreset } from '../../../../services/products';

export type ProductType = 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item';
export type CalculatorType = 'product' | 'operation';

/**
 * Конфигурация полей по умолчанию для разных типов продуктов
 */
export interface ProductTypeDefaults {
  trim_size?: {
    width: string;
    height: string;
  };
  print_sheet?: {
    preset?: string;
    width?: string;
    height?: string;
  };
  print_run?: {
    enabled: boolean;
    min?: string;
    max?: string;
  };
}

/**
 * Получить значения по умолчанию для типа продукта
 */
export function getProductTypeDefaults(
  productType: ProductType,
  calculatorType: CalculatorType
): ProductTypeDefaults {
  const defaults: Record<string, ProductTypeDefaults> = {
    // Листовые изделия
    sheet_single: {
      trim_size: {
        width: '210',
        height: '297', // A4
      },
      print_sheet: {
        preset: 'SRA3',
      },
      print_run: {
        enabled: true,
        min: '100',
        max: '10000',
      },
    },
    // Многостраничные
    multi_page: {
      trim_size: {
        width: '210',
        height: '297', // A4
      },
      print_sheet: {
        preset: 'SRA3',
      },
      print_run: {
        enabled: true,
        min: '50',
        max: '5000',
      },
    },
    // Универсальные
    universal: {
      trim_size: {
        width: '',
        height: '',
      },
      print_sheet: {
        preset: '',
      },
      print_run: {
        enabled: false,
      },
    },
    // Операционные калькуляторы
    sheet_item: {
      trim_size: {
        width: '210',
        height: '297',
      },
      print_sheet: {
        preset: 'SRA3',
      },
      print_run: {
        enabled: false,
      },
    },
    multi_page_item: {
      trim_size: {
        width: '210',
        height: '297',
      },
      print_sheet: {
        preset: 'SRA3',
      },
      print_run: {
        enabled: false,
      },
    },
  };

  return defaults[productType] || defaults.universal;
}

/**
 * Применить значения по умолчанию для шаблона
 */
export function applyTemplateDefaults(
  currentTemplate: Record<string, unknown>,
  productType: ProductType,
  calculatorType: CalculatorType
): Record<string, unknown> {
  const defaults = getProductTypeDefaults(productType, calculatorType);
  const updated = { ...currentTemplate };

  // Применяем только если поля пустые
  if (defaults.trim_size) {
    if (!updated.trim_width && defaults.trim_size.width) {
      updated.trim_width = defaults.trim_size.width;
    }
    if (!updated.trim_height && defaults.trim_size.height) {
      updated.trim_height = defaults.trim_size.height;
    }
  }

  if (defaults.print_sheet) {
    if (!updated.print_sheet_preset && defaults.print_sheet.preset) {
      updated.print_sheet_preset = defaults.print_sheet.preset;
    }
    if (!updated.print_sheet_width && defaults.print_sheet.width) {
      updated.print_sheet_width = defaults.print_sheet.width;
    }
    if (!updated.print_sheet_height && defaults.print_sheet.height) {
      updated.print_sheet_height = defaults.print_sheet.height;
    }
  }

  if (defaults.print_run) {
    if (updated.print_run_enabled === undefined) {
      updated.print_run_enabled = defaults.print_run.enabled;
    }
    if (!updated.print_run_min && defaults.print_run.min) {
      updated.print_run_min = defaults.print_run.min;
    }
    if (!updated.print_run_max && defaults.print_run.max) {
      updated.print_run_max = defaults.print_run.max;
    }
  }

  return updated;
}

/**
 * Автоматически применить рекомендуемые параметры из пресетов
 */
export function autoApplyPresetParameters(
  presets: ProductParameterPreset[],
  existingParameters: Array<{ name: string }>,
  options: {
    onlyRequired?: boolean;
    skipExisting?: boolean;
  } = {}
): ProductParameterPreset[] {
  const { onlyRequired = false, skipExisting = true } = options;

  const existingNames = new Set(existingParameters.map((p) => p.name));

  return presets.filter((preset) => {
    // Пропускаем если уже существует
    if (skipExisting && existingNames.has(preset.preset_key)) {
      return false;
    }

    // Фильтруем по обязательности если нужно
    if (onlyRequired && !preset.is_required) {
      return false;
    }

    return true;
  });
}

/**
 * Проверить, какие обязательные параметры отсутствуют
 */
export function getMissingRequiredParameters(
  presets: ProductParameterPreset[],
  existingParameters: Array<{ name: string }>
): ProductParameterPreset[] {
  const existingNames = new Set(existingParameters.map((p) => p.name));

  return presets.filter(
    (preset) => preset.is_required && !existingNames.has(preset.preset_key)
  );
}

/**
 * Получить рекомендуемые параметры для типа продукта
 */
export function getRecommendedParameters(
  productType: ProductType,
  operationPreset?: string
): string[] {
  const presetKey = operationPreset || productType;

  const recommendations: Record<string, string[]> = {
    business_cards: ['format', 'material', 'density', 'lamination', 'round_corners'],
    flyers: ['format', 'material', 'density', 'lamination', 'duplex'],
    booklets: ['format', 'material', 'density', 'lamination', 'duplex', 'pages'],
    posters: ['format', 'material', 'density', 'lamination'],
    multi_page: ['format', 'material', 'density', 'pages', 'binding'],
    sheet_single: ['format', 'material', 'density', 'lamination'],
  };

  return recommendations[presetKey] || [];
}

/**
 * Проверить валидность полей шаблона для типа продукта
 */
export function validateTemplateFields(
  template: Record<string, unknown>,
  productType: ProductType
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Для листовых и многостраничных обязательны размеры
  if (productType === 'sheet_single' || productType === 'multi_page') {
    if (!template.trim_width || !template.trim_height) {
      errors.push('Укажите обрезной формат (ширина и высота)');
    }
  }

  // Для операционных калькуляторов размеры не обязательны
  if (productType === 'sheet_item' || productType === 'multi_page_item') {
    // Размеры опциональны
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Создать параметр format из нескольких размеров
 */
export function createFormatParameterFromSizes(
  sizes: Array<{ width: string; height: string; label?: string }>
): { name: string; label: string; type: string; options: string[]; is_required: boolean } {
  const formatOptions = sizes
    .filter(size => size.width && size.height)
    .map(size => {
      const width = Number(size.width) || size.width;
      const height = Number(size.height) || size.height;
      return size.label || `${width}×${height}`;
    });

  return {
    name: 'format',
    label: 'Формат',
    type: 'select',
    options: formatOptions,
    is_required: true,
  };
}

/**
 * Автоматически добавить параметр format для продуктов с несколькими размерами
 * Теперь работает для всех типов продуктов (листовых и многостраничных)
 */
export function shouldAutoAddFormatParameter(
  productType: ProductType,
  sizes: Array<{ width: string; height: string }>,
  existingParameters: Array<{ name: string }>
): boolean {
  // Универсальные продукты могут не требовать формат
  if (productType === 'universal') return false;
  // Для всех остальных типов: если есть несколько размеров, создаем параметр format
  if (sizes.length < 2) return false;
  if (existingParameters.some(p => p.name === 'format')) return false;
  return sizes.every(size => size.width && size.height);
}

