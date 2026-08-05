// Базовые типы для API ответов
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
  min_quantity?: number | null;
  min_stock_level?: number;
  max_stock_level?: number;
  location?: string;
  barcode?: string;
  sku?: string;
  is_active?: boolean;
  paper_type_id?: number | null;
  density?: number | null;
  finish?: string | null;
  sheet_width?: number | null;
  sheet_height?: number | null;
  notes?: string;
}

export type UpdateMaterialRequest = Partial<CreateMaterialRequest>;

// Типы для резервирования материалов
export interface CreateMaterialReservationRequest {
  material_id: number;
  order_id?: number;
  quantity_reserved: number;
  expires_at?: string;
  notes?: string;
}

export interface UpdateMaterialReservationRequest {
  quantity_reserved?: number;
  expires_at?: string;
  status?: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  notes?: string;
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
  material?: {
    id: number;
    name: string;
    unit: string;
  };
  user?: {
    id: number;
    name: string;
  };
}

export interface MaterialAvailabilityResponse {
  material_id: number;
  available_quantity: number;
}

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
  page?: number;
  limit?: number;
}

export interface MaterialFilters {
  categoryId?: number;
  materialTypeId?: number;
  materialKind?: 'sheet' | 'roll' | 'consumable' | 'area';
  category?: string;
  supplierId?: number;
  supplier?: string;
  low_stock?: boolean;
  search?: string;
  minQuantity?: number;
  maxQuantity?: number;
  minPrice?: number;
  maxPrice?: number;
  stockStatus?: 'all' | 'in' | 'low' | 'out';
  page?: number;
  limit?: number;
}

// Реэкспорт базовых сущностей из shared (единый источник правды для типов)
export type {
  Material,
  MaterialType,
  MaterialKind,
  Order,
  User,
  Category,
  Supplier,
  ProductSpecs,
  CalculationResult,
  OrderItem,
  OrderFile,
  MaterialReservation as SharedMaterialReservation,
} from '../../../shared/types/entities';