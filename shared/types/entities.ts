// Основные сущности системы

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'manager';
  created_at: string;
  updated_at: string;
  last_login?: string;
  is_active: boolean;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  status: string;
  notes?: string;
  total_amount?: number;
  prepaid_amount?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  items?: OrderItem[];
  files?: OrderFile[];
  user_id?: number;
  user?: User;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_name: string;
  quantity: number;
  price: number;
  specifications: any;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: number;
  name: string;
  description?: string;
  category_id: number;
  quantity: number;
  unit: string;
  price: number; // Для совместимости с фронтендом
  sheet_price_single?: number; // Основное поле для цены в backend
  supplier_id?: number;
  min_stock_level?: number;
  max_stock_level?: number;
  location?: string;
  barcode?: string;
  sku?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category;
  supplier?: Supplier;
  // Поля для типов бумаги
  is_paper_type?: boolean;
  paper_type_id?: number;
  paper_densities?: { [density: number]: number }; // Плотности и цены
  // Поля для резервирования
  reserved_quantity?: number; // Зарезервированное количество
  available_quantity?: number; // Доступное количество (quantity - reserved_quantity)
}

export interface MaterialReservation {
  id: number;
  material_id: number;
  order_id?: number;
  quantity_reserved: number;
  reserved_at: string;
  expires_at?: string;
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  reserved_by?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  material?: Material;
  order?: any; // Order interface
  user?: any; // User interface
}

export interface MaterialReservationHistory {
  id: number;
  reservation_id: number;
  action: 'created' | 'updated' | 'fulfilled' | 'cancelled' | 'expired';
  old_quantity?: number;
  new_quantity?: number;
  changed_by?: number;
  reason?: string;
  created_at: string;
}

export interface DailyReport {
  id: number;
  date: string;
  user_id: number;
  total_orders: number;
  total_revenue: number;
  materials_used: any;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface OrderFile {
  id: number;
  order_id: number;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface Printer {
  id: number;
  name: string;
  model: string;
  location: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrinterCounter {
  id: number;
  printer_id: number;
  counter_type: 'black' | 'color' | 'total';
  value: number;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface ProductMaterial {
  id: number;
  product_type: string;
  material_id: number;
  quantity_per_unit: number;
  created_at: string;
  updated_at: string;
  material?: Material;
}

// Дополнительные типы для калькулятора
export interface ProductSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  paperType: string;
  paperDensity: number;
  lamination: 'none' | 'matte' | 'glossy';
  priceType: 'standard' | 'urgent' | 'superUrgent' | 'online' | 'promo' | 'express';
  customerType: 'regular' | 'vip';
  pages?: number;
  magnetic?: boolean;
  cutting?: boolean;
  folding?: boolean;
  roundCorners?: boolean;
  urgency?: 'standard' | 'urgent' | 'superUrgent';
  vipLevel?: 'bronze' | 'silver' | 'gold' | 'platinum';
  specialServices?: string[];
  materialType?: 'office' | 'coated' | 'designer' | 'selfAdhesive';
}

export interface CalculationResult {
  productName: string;
  specifications: ProductSpecs;
  materials: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalCost: number;
  pricePerItem: number;
  productionTime: string;
}

// Типы для конфигурации
export interface ProductConfig {
  name: string;
  description?: string;
  formats: string[];
  paperDensities: number[];
  laminations: string[];
  sides: number[];
  pages?: number[];
  magnetic?: boolean;
  cutting?: boolean;
  folding?: boolean;
  roundCorners?: boolean;
}

export interface PricingTier {
  name: string;
  multiplier: number;
  description?: string;
}

export interface VolumeDiscount {
  minQuantity: number;
  maxQuantity?: number;
  discountPercent: number;
}

export interface LoyaltyDiscount {
  customerType: string;
  discountPercent: number;
}

// Типы для складского учета
export interface Category {
  id: number;
  name: string;
  description?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialAlert {
  id: number;
  material_id: number;
  alert_type: 'low_stock' | 'out_of_stock' | 'expiring' | 'reorder';
  threshold_value?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  material?: Material;
}

export interface InventoryTransaction {
  id: number;
  material_id: number;
  transaction_type: 'in' | 'out' | 'adjustment' | 'transfer';
  quantity: number;
  reason: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  material?: Material;
  user?: User;
}
