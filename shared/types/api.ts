// API типы и интерфейсы

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
  status?: number;
}

// Типы для запросов
export interface CreateOrderRequest {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  status: string;
  notes?: string;
  items: CreateOrderItemRequest[];
}

export interface CreateOrderItemRequest {
  product_name: string;
  quantity: number;
  price: number;
  specifications: any;
}

export interface UpdateOrderRequest {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  status?: string;
  notes?: string;
}

export interface CreateMaterialRequest {
  name: string;
  description?: string;
  category_id?: number | null;
  material_type_id?: number | null;
  material_kind?: 'sheet' | 'roll' | 'consumable' | 'area';
  quantity: number;
  unit: string;
  price?: number;
  sheet_price_single?: number;
  purchase_price?: number;
  supplier_id?: number | null;
  paper_type_id?: number | null;
  density?: number | null;
  finish?: string | null;
  sheet_width?: number | null;
  sheet_height?: number | null;
  min_quantity?: number | null;
  min_stock_level?: number;
  max_stock_level?: number;
  location?: string;
  barcode?: string;
  sku?: string;
  is_active?: boolean;
  notes?: string;
}

export type UpdateMaterialRequest = Partial<CreateMaterialRequest>;

export interface CalculatePriceRequest {
  productType: string;
  productName: string;
  quantity: number;
  specifications: any;
  priceType: string;
  customerType?: string;
}

export interface CalculatePriceResponse {
  basePricePerItem: number;
  urgencyPricePerItem: number;
  finalPricePerItem: number;
  total: number;
  volumeDiscount: number;
  loyaltyDiscount: number;
}

// Типы для фильтрации и поиска
export interface OrderFilters {
  status?: string;
  customer_name?: string;
  date_from?: string;
  date_to?: string;
  user_id?: number;
  page?: number;
  limit?: number;
}

export interface MaterialFilters {
  categoryId?: number;
  materialTypeId?: number;
  materialKind?: 'sheet' | 'roll' | 'consumable' | 'area';
  category?: string;
  low_stock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  user_id?: number;
  format?: 'json' | 'csv' | 'pdf';
}

// Типы для аутентификации
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  expires_at: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: string;
}

// Типы для файлов
export interface FileUploadRequest {
  order_id: number;
  file: File;
  description?: string;
}

export interface FileUploadResponse {
  id: number;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
}

// Типы для отчетов
export interface DailyReportRequest {
  date: string;
  user_id: number;
  total_orders: number;
  total_revenue: number;
  materials_used: any;
}

export interface MaterialUsageReport {
  material_id: number;
  material_name: string;
  quantity_used: number;
  cost: number;
  orders_count: number;
}

export interface RevenueReport {
  date: string;
  total_revenue: number;
  orders_count: number;
  average_order_value: number;
}

// Типы для уведомлений
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
  created_at: string;
}

// Типы для настроек приложения
export interface AppConfig {
  name: string;
  version: string;
  api_url: string;
  storage: {
    token: string;
    role: string;
    sessionDate: string;
  };
  features: {
    calculator: boolean;
    materials: boolean;
    reports: boolean;
    admin: boolean;
  };
}
