// Главный файл экспорта всех типов

// Экспортируем все типы из entities
export * from './entities';

// Экспортируем все типы из api
export * from './api';

// Экспортируем все типы из common
export * from './common';

// Дополнительные экспорты для удобства
export type {
  // Основные сущности
  User,
  Order,
  OrderItem,
  Material,
  DailyReport,
  OrderFile,
  Printer,
  PrinterCounter,
  ProductMaterial,
  ProductSpecs,
  CalculationResult,
  ProductConfig,
  PricingTier,
  VolumeDiscount,
  LoyaltyDiscount,
} from './entities';

export type {
  // API типы
  ApiResponse,
  PaginatedResponse,
  ApiError,
  CreateOrderRequest,
  UpdateOrderRequest,
  CreateMaterialRequest,
  UpdateMaterialRequest,
  CalculatePriceRequest,
  CalculatePriceResponse,
  OrderFilters,
  MaterialFilters,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  FileUploadRequest,
  FileUploadResponse,
  DailyReportRequest,
  MaterialUsageReport,
  RevenueReport,
  Notification,
  AppConfig,
} from './api';

export type {
  // Общие типы
  ID,
  Status,
  Role,
  Theme,
  Currency,
  SelectOption,
  TableColumn,
  Pagination,
  SortConfig,
  FilterConfig,
  FormField,
  FormState,
  ModalProps,
  ToastNotification,
  NavigationItem,
  AppSettings,
  ValidationRule,
  ValidationSchema,
  ApiState,
  CacheConfig,
  LogEntry,
  Metric,
  Event,
  Optional,
  Required,
  DeepPartial,
  NonNullable,
  ComponentProps,
  LoadingProps,
  ErrorProps,
} from './common';
