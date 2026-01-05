import { Material, User } from '../types';

// Базовые типы для калькулятора
export type CalculationType = 'per_item' | 'per_sheet' | 'per_sqm' | 'fixed';
export type ProductType = 'flyers' | 'business_cards' | 'booklets' | 'posters' | 'brochures' | 'labels' | 'stickers';
export type PaperType = 'offset' | 'coated' | 'uncoated' | 'cardboard' | 'self_adhesive';
export type LaminationType = 'none' | 'matte' | 'glossy';
export type UrgencyType = 'standard' | 'urgent' | 'online' | 'promo';
export type CustomerType = 'regular' | 'vip' | 'wholesale';

// Интерфейс для правил расчета
export interface CalculationRule {
  id?: number;
  material_id: number;
  material_name: string;
  unit: string;
  qty_per_item: number;
  calculation_type: CalculationType;
  is_required: boolean;
  notes?: string;
  sheet_price_single?: number;
  category_name?: string;
  category_color?: string;
  created_at?: string;
  updated_at?: string;
}

// Интерфейс для конфигурации калькулятора
export interface CalculatorConfig {
  product_type: ProductType;
  product_name: string;
  rules: CalculationRule[];
  total_materials: number;
  total_cost: number;
  created_at?: string;
  updated_at?: string;
}

// Интерфейс для параметров расчета
export interface CalculationParams {
  product_type: ProductType;
  product_name: string;
  quantity: number;
  options: CalculationOptions;
  user_id?: number;
  context_date?: string;
}

// Интерфейс для опций расчета
export interface CalculationOptions {
  sheets_per_item?: number;
  paper_type?: PaperType;
  paper_density?: number;
  paper_name?: string;
  lamination?: LaminationType;
  sides?: number;
  format?: string;
  urgency?: UrgencyType;
  customer_type?: CustomerType;
  special_requirements?: string;
  production_time?: string;
  estimated_delivery?: string;
  [key: string]: any;
}

// Интерфейс для результата расчета материала
export interface MaterialCalculation {
  material_id: number;
  material_name: string;
  unit: string;
  qty_per_item: number;
  calculation_type: CalculationType;
  calculated_qty: number;
  rounded_qty: number;
  unit_price: number;
  total_cost: number;
  is_required: boolean;
  category_name?: string;
  category_color?: string;
  notes?: string;
}

// Интерфейс для результата расчета
export interface CalculationResult {
  id?: number;
  product_type: ProductType;
  product_name: string;
  quantity: number;
  options: CalculationOptions;
  calculations: MaterialCalculation[];
  summary: CalculationSummary;
  created_at?: string;
  updated_at?: string;
  user_id?: number;
  context_date?: string;
}

// Интерфейс для сводки расчета
export interface CalculationSummary {
  total_materials: number;
  total_cost: number;
  cost_per_item: number;
  required_materials: number;
  optional_materials: number;
  required_cost: number;
  optional_cost: number;
  profit_margin?: number;
  final_price?: number;
}

// Интерфейс для продукта
export interface Product {
  product_name: string;
  count: number;
  product_type: ProductType;
  description?: string;
  default_options?: Partial<CalculationOptions>;
}

// Интерфейс для типа продукта
export interface ProductTypeInfo {
  product_type: ProductType;
  count: number;
  display_name: string;
  description?: string;
  icon?: string;
  color?: string;
}

// Интерфейс для калькулятора
export interface Calculator {
  id: number;
  name: string;
  description?: string;
  product_type: ProductType;
  is_active: boolean;
  config: CalculatorConfig;
  created_at: string;
  updated_at: string;
  created_by: number;
  created_by_user?: User;
}

// Интерфейс для истории расчетов
export interface CalculationHistory {
  id: number;
  product_type: ProductType;
  product_name: string;
  quantity: number;
  total_cost: number;
  created_at: string;
  user_id: number;
  user?: User;
  context_date: string;
}

// Интерфейс для шаблонов расчетов
export interface CalculationTemplate {
  id: number;
  name: string;
  description?: string;
  product_type: ProductType;
  product_name: string;
  default_quantity: number;
  default_options: CalculationOptions;
  is_public: boolean;
  created_by: number;
  created_by_user?: User;
  created_at: string;
  updated_at: string;
}

// Интерфейс для настроек калькулятора
export interface CalculatorSettings {
  default_urgency: UrgencyType;
  default_customer_type: CustomerType;
  default_paper_type: PaperType;
  default_lamination: LaminationType;
  profit_margin_percent: number;
  rounding_precision: number;
  auto_save_calculations: boolean;
  show_detailed_breakdown: boolean;
  enable_templates: boolean;
  enable_history: boolean;
}

// Интерфейс для валидации калькулятора
export interface CalculatorValidation {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// Интерфейс для ошибки валидации
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

// Интерфейс для предупреждения валидации
export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  suggestion?: string;
}

// Интерфейс для экспорта/импорта
export interface CalculatorExport {
  version: string;
  exported_at: string;
  exported_by: number;
  calculators: Calculator[];
  templates: CalculationTemplate[];
  settings: CalculatorSettings;
}

// Интерфейс для статистики калькулятора
export interface CalculatorStats {
  total_calculations: number;
  calculations_today: number;
  calculations_this_week: number;
  calculations_this_month: number;
  most_used_product_type: ProductType;
  most_used_materials: Array<{
    material_id: number;
    material_name: string;
    usage_count: number;
  }>;
  average_calculation_value: number;
  total_calculation_value: number;
}

// Константы для калькулятора
export const CALCULATOR_CONSTANTS = {
  DEFAULT_QUANTITY: 1,
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 1000000,
  DEFAULT_SHEETS_PER_ITEM: 1,
  MIN_SHEETS_PER_ITEM: 0.1,
  MAX_SHEETS_PER_ITEM: 100,
  DEFAULT_PROFIT_MARGIN: 30,
  MIN_PROFIT_MARGIN: 0,
  MAX_PROFIT_MARGIN: 100,
  ROUNDING_PRECISION: 2,
  CACHE_TTL: 300000, // 5 минут
} as const;

// Плотности бумаги загружаются динамически из складского сервиса
// Используйте: getPaperTypesFromWarehouse() из calculatorMaterialService

// Утилиты для работы с калькулятором
export const calculatorUtils = {
  // Получение плотностей бумаги по типу - теперь загружается из склада
  // Используйте: getPaperDensitiesForType(paperType) из calculatorMaterialService
  getPaperDensities: (paperType: PaperType) => {
    // Данные теперь загружаются из склада
    return [];
  },

  // Получение плотности по умолчанию для типа бумаги - теперь загружается из склада
  // Используйте: getPaperTypesFromWarehouse() и используйте default_density
  getDefaultPaperDensity: (paperType: PaperType) => {
    // Данные теперь загружаются из склада
    return 130; // Fallback значение
  },

  // Валидация параметров расчета
  validateCalculationParams: (params: CalculationParams): CalculatorValidation => {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!params.product_type) {
      errors.push({
        field: 'product_type',
        message: 'Тип продукта обязателен',
        code: 'REQUIRED',
        severity: 'error'
      });
    }

    if (!params.product_name) {
      errors.push({
        field: 'product_name',
        message: 'Название продукта обязательно',
        code: 'REQUIRED',
        severity: 'error'
      });
    }

    if (!params.quantity || params.quantity < CALCULATOR_CONSTANTS.MIN_QUANTITY) {
      errors.push({
        field: 'quantity',
        message: `Количество должно быть не менее ${CALCULATOR_CONSTANTS.MIN_QUANTITY}`,
        code: 'MIN_QUANTITY',
        severity: 'error'
      });
    }

    if (params.quantity > CALCULATOR_CONSTANTS.MAX_QUANTITY) {
      warnings.push({
        field: 'quantity',
        message: `Количество очень большое (${params.quantity})`,
        code: 'LARGE_QUANTITY',
        suggestion: 'Проверьте правильность введенного количества'
      });
    }

    if (params.options.sheets_per_item && 
        (params.options.sheets_per_item < CALCULATOR_CONSTANTS.MIN_SHEETS_PER_ITEM || 
         params.options.sheets_per_item > CALCULATOR_CONSTANTS.MAX_SHEETS_PER_ITEM)) {
      errors.push({
        field: 'sheets_per_item',
        message: `Количество листов должно быть от ${CALCULATOR_CONSTANTS.MIN_SHEETS_PER_ITEM} до ${CALCULATOR_CONSTANTS.MAX_SHEETS_PER_ITEM}`,
        code: 'INVALID_SHEETS_PER_ITEM',
        severity: 'error'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  // Форматирование стоимости
  formatCost: (cost: number, currency: string = 'BYN'): string => {
    return `${cost.toFixed(CALCULATOR_CONSTANTS.ROUNDING_PRECISION)} ${currency}`;
  },

  // Форматирование количества
  formatQuantity: (quantity: number, unit: string): string => {
    return `${quantity.toFixed(CALCULATOR_CONSTANTS.ROUNDING_PRECISION)} ${unit}`;
  },

  // Расчет округления
  roundQuantity: (quantity: number): number => {
    return Math.ceil(quantity * 100) / 100;
  },

  // Получение названия типа продукта
  getProductTypeName: (productType: ProductType): string => {
    const names: Record<ProductType, string> = {
      flyers: 'Листовки',
      business_cards: 'Визитки',
      booklets: 'Буклеты',
      posters: 'Плакаты',
      brochures: 'Брошюры',
      labels: 'Наклейки',
      stickers: 'Стикеры'
    };
    return names[productType] || productType;
  },

  // Получение названия типа бумаги
  getPaperTypeName: (paperType: PaperType): string => {
    const names: Record<PaperType, string> = {
      offset: 'Офсетная',
      coated: 'Мелованная',
      uncoated: 'Немелованная',
      cardboard: 'Картон',
      self_adhesive: 'Самоклеящаяся'
    };
    return names[paperType] || paperType;
  },

  // Получение названия ламинации
  getLaminationName: (lamination: LaminationType): string => {
    const names: Record<LaminationType, string> = {
      none: 'Без ламинации',
      matte: 'Матовая',
      glossy: 'Глянцевая'
    };
    return names[lamination] || lamination;
  },

  // Получение названия срочности
  getUrgencyName: (urgency: UrgencyType): string => {
    const names: Record<UrgencyType, string> = {
      standard: 'Стандартная',
      urgent: 'Срочная',
      online: 'Онлайн',
      promo: 'Промо'
    };
    return names[urgency] || urgency;
  },

  // Получение названия типа клиента
  getCustomerTypeName: (customerType: CustomerType): string => {
    const names: Record<CustomerType, string> = {
      regular: 'Обычный',
      vip: 'VIP',
      wholesale: 'Оптовый'
    };
    return names[customerType] || customerType;
  }
};