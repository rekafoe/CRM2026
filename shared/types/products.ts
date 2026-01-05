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
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: ProductCategory;
  parameters?: ProductParameter[];
  pricing_rules?: ProductPricingRule[];
  quantity_discounts?: QuantityDiscount[];
  post_processing_services?: PostProcessingService[];
}

export interface ProductParameter {
  id: number;
  product_id: number;
  name: string;
  type: 'select' | 'range' | 'number' | 'checkbox' | 'multiselect';
  label: string;
  options?: string; // JSON для select/multiselect опций
  min_value?: number;
  max_value?: number;
  step?: number;
  default_value?: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProductPricingRule {
  id: number;
  product_id: number;
  parameter_combination: string; // JSON комбинация параметров
  base_price: number;
  min_quantity: number;
  max_quantity?: number;
  discount_percent: number;
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
}

export interface PostProcessingService {
  id: number;
  name: string;
  description?: string;
  price: number;
  unit: string;
  is_active: boolean;
  created_at: string;
}

export interface ProductConfiguration {
  product_id: number;
  parameters: Record<string, any>; // значения параметров
  quantity: number;
  post_processing: number[]; // ID выбранных услуг
  production_terms: 'urgent' | 'online' | 'promo';
}

export interface CalculatedPrice {
  base_price: number;
  quantity_discount: number;
  post_processing_cost: number;
  total_price: number;
  price_per_unit: number;
  breakdown: {
    printing: number;
    materials: number;
    post_processing: number;
    discount: number;
  };
}

export interface OrderItemProduct {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  configuration: ProductConfiguration;
  calculated_price: CalculatedPrice;
  quantity: number;
  total_price: number;
  created_at: string;
  updated_at: string;
  product?: Product;
}
