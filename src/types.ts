// Улучшенные типы для лучшей типизации
export type LaminationType = 'none' | 'matte' | 'glossy';
export type PaymentMethod = 'online' | 'offline' | 'telegram';
export type OrderStatus = 'new' | 'in_production' | 'ready_to_ship' | 'shipped' | 'completed';

export interface ItemParams {
  description: string;
  paperDensity?: number;
  paperName?: string;
  lamination?: LaminationType;
  specifications?: {
    sides?: number;
    sheets?: number;
    waste?: number;
    clicks?: number;
    [key: string]: any;
  };
  materials?: Array<{
    material: { id: number; name: string };
    quantity: number;
  }>;
  services?: string[];
  productionTime?: string;
  productType?: string;
  urgency?: 'standard' | 'urgent' | 'online' | 'promo';
  customerType?: 'regular' | 'vip' | 'wholesale';
  estimatedDelivery?: string;
  sheetsNeeded?: number;
  piecesPerSheet?: number;
  formatInfo?: string;
  parameterSummary?: Array<{ key?: string; label: string; value: string }>;
  productId?: number;
  productName?: string;
  layout?: {
    sheetsNeeded?: number;
    itemsPerSheet?: number;
    sheetSize?: string;
    wastePercentage?: number;
  };
}

export interface Item {
  id: number;
  type: string;
  params: ItemParams;
  price: number;
  quantity: number; // Убираем optional для лучшей типизации
  printerId?: number;
  sides: number; // Убираем optional
  sheets: number; // Убираем optional
  waste: number; // Убираем optional
  clicks: number; // Убираем optional
  // Информация о листах SRA3
  sheetsNeeded?: number;
  piecesPerSheet?: number;
  formatInfo?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Order {
  id: number;
  number: string;
  status: number;
  created_at: string;
  userId?: number;
  // Источник заказа
  source?: 'crm' | 'website' | 'telegram';
  // Customer information
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  // Payment information
  prepaymentAmount?: number;
  prepaymentStatus?: string;
  paymentUrl?: string;
  paymentId?: string;
  paymentMethod?: PaymentMethod;
  // Order items
  items: Item[];
  // Additional metadata
  totalAmount?: number;
  notes?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedCompletion?: string;
  actualCompletion?: string;
  // Soft cancel marker for online orders
  is_cancelled?: number;
}

export interface PresetExtra {
  name: string;
  price: number;
  type: 'checkbox' | 'number';
  unit?: string;
}

export interface PresetItem {
  description: string;
  price: number;
}

export interface PresetCategory {
  category: string;
  color: string;
  items: PresetItem[];
  extras: PresetExtra[];
}
export interface Material {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  min_quantity?: number;
  sheet_price_single?: number | null;
}

export interface MaterialRow {
  materialId: number;
  qtyPerItem: number;
  name: string;
  unit: string;
  quantity: number;
}
// frontend/src/types.ts
export interface DailyReport {
  id: number;
  report_date: string;
  orders_count: number;
  total_revenue: number;
  created_at: string;
  updated_at?: string;
  user_id?: number;
  user_name?: string | null;
  cash_actual?: number;
  // Полная информация о заказах в отчёте
  orders?: Order[];
  // Метаданные отчёта
  report_metadata?: {
    total_orders: number;
    total_revenue: number;
    orders_by_status: Record<number, number>;
    revenue_by_status: Record<number, number>;
    created_by: number;
    last_modified: string;
  };
}

export interface UserRef { id: number; name: string }

export interface OrderFile {
  id: number;
  orderId: number;
  filename: string;
  originalName?: string;
  mime?: string;
  size?: number;
  uploadedAt: string;
  approved: number;
  approvedAt?: string;
  approvedBy?: number;
}

export interface Printer {
  id: number;
  code: string;
  name: string;
  technology_code?: string | null;
  counter_unit?: 'sheets' | 'meters';
  max_width_mm?: number | null;
  color_mode?: 'bw' | 'color' | 'both';
  printer_class?: 'office' | 'pro';
  price_single?: number | null;
  price_duplex?: number | null;
  price_per_meter?: number | null;
  price_bw_single?: number | null;
  price_bw_duplex?: number | null;
  price_color_single?: number | null;
  price_color_duplex?: number | null;
  price_bw_per_meter?: number | null;
  price_color_per_meter?: number | null;
  is_active?: number;
}

// API Response types
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error types
export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Form validation types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface FormState<T> {
  data: T;
  errors: ValidationError[];
  isSubmitting: boolean;
  isDirty: boolean;
  isValid: boolean;
}

// User roles and permissions
export type UserRole = 'admin' | 'manager' | 'viewer';
export type Permission = 'read' | 'write' | 'delete' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

// App-level configuration constants
export const APP_CONFIG = {
  storage: {
    token: 'crmToken',
    role: 'crmRole',
    sessionDate: 'crmSessionDate',
    userId: 'crmUserId'
  },
  apiBase: '/api',
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  validation: {
    minPasswordLength: 8,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['image/jpeg', 'image/png', 'application/pdf']
  }
} as const

