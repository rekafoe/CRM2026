// Типы для ProductTemplatePage

export interface ProductOperation {
  id: number; // ID из product_operations_link
  operation_id: number;
  operation_name: string;
  service_name?: string;
  operation_type: string;
  price: number;
  price_per_unit?: number;
  unit: string;
  price_unit?: string;
  is_required: boolean;
  is_default?: boolean;
  price_multiplier?: number;
  sequence?: number;
  sort_order?: number;
}

export interface AvailableOperation {
  id: number;
  name: string;
  operation_type: string;
  price: number;
  unit: string;
  is_active?: boolean;
}

export interface OperationError {
  type: 'add' | 'remove' | 'load';
  message: string;
}

