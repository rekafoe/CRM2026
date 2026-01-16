// Типы для системы продуктов

export interface ProductCategory {
  id: number;
  name: string;
  icon: string;
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
  base_price: number;
  operator_percent?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_icon?: string;
}

export interface ProductParameter {
  id: number;
  product_id: number;
  name: string;
  label: string;
  type: 'select' | 'range' | 'number' | 'checkbox' | 'multiselect';
  options?: string; // JSON string for select/multiselect options
  min_value?: number;
  max_value?: number;
  step?: number;
  default_value?: any;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductPricingRule {
  id: number;
  product_id: number;
  parameter_conditions: string; // JSON string
  price_modifier: number; // multiplier or fixed amount
  modifier_type: 'multiplier' | 'fixed';
  created_at: string;
  updated_at: string;
}

export interface QuantityDiscount {
  id: number;
  product_id: number;
  min_quantity: number;
  max_quantity?: number;
  discount_percent: number;
  created_at: string;
  updated_at: string;
}

export interface PostProcessingService {
  id: number;
  name: string;
  description?: string;
  base_price: number;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductConfiguration {
  product_id: number;
  parameters: Record<string, any>;
  quantity: number;
  post_processing: number[];
  production_terms: 'urgent' | 'online' | 'promo';
}

export interface CalculatedPrice {
  base_price: number;
  parameter_modifiers: number;
  quantity_discount: number;
  post_processing_cost: number;
  production_terms_multiplier: number;
  total_price: number;
  price_per_unit: number;
  breakdown: {
    base: number;
    parameters: number;
    quantity_discount: number;
    post_processing: number;
    production_terms: number;
  };
}

