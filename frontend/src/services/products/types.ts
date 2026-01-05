/**
 * Типы для работы с продуктами
 */

export interface ProductCategory {
  id: number;
  name: string;
  icon?: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  icon?: string;
  calculator_type?: 'product' | 'operation';
  product_type?: 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_icon?: string;
}

export interface ProductConfig {
  id: number;
  product_id: number;
  name: string;
  description?: string;
  config_data: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductParameter {
  id: number;
  product_id: number;
  name: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'range';
  label: string;
  options?: string[];
  min_value?: number;
  max_value?: number;
  step?: number;
  default_value?: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProductWithDetails extends Product {
  parameters: ProductParameter[];
  post_processing_services: PostProcessingOperation[];
  quantity_discounts: QuantityDiscount[];
}

export interface PostProcessingOperation {
  id: number;
  name: string;
  description?: string;
  price: number;
  unit: string;
  operation_type: string;
  price_unit: string;
  setup_cost?: number;
  min_quantity?: number;
  parameters?: Record<string, any>;
  is_active: number;
}

export interface ProductServiceLink {
  link_id?: number;
  product_id: number;
  service_id: number;
  service_name: string;
  service_type: string;
  unit: string;
  price_per_unit: number;
  is_active: boolean;
  is_required?: boolean;
  default_quantity?: number;
}

export interface ProductMaterialLink {
  material_id: number;
  qty_per_sheet?: number;
  is_required?: boolean;
}

export interface ProductParameterPreset {
  id: number;
  product_type: string;
  product_name?: string | null;
  preset_key: string;
  label: string;
  field_type: 'select' | 'checkbox' | 'number' | 'text';
  options?: string[];
  help_text?: string | null;
  default_value?: string | null;
  is_required: boolean;
  sort_order: number;
}

export interface QuantityDiscount {
  id: number;
  min_quantity: number;
  max_quantity?: number;
  discount_percent: number;
}

export interface ProductSetupPayload {
  product: {
    category_id?: number;
    name: string;
    description?: string;
    icon?: string;
    calculator_type?: 'product' | 'operation';
    product_type?: 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item';
  };
  operations?: Array<{
    operation_id: number;
    sequence?: number;
    is_required?: boolean;
    is_default?: boolean;
    price_multiplier?: number;
  }>;
  materials?: Array<{ material_id: number }>;
  parameters?: Array<{
    name: string;
    type: string;
    label: string;
    options?: string[];
    min_value?: number;
    max_value?: number;
    step?: number;
    default_value?: string;
    is_required: boolean;
    sort_order: number;
  }>;
  template?: Record<string, any>;
  autoOperationType?: string;
}

