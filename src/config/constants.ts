/**
 * Константы приложения
 */

// API настройки
export const API_CONFIG = {
  BASE_URL: process.env.VITE_API_URL || 'http://localhost:3001/api',
  TIMEOUT: 30000, // 30 секунд
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 секунда
} as const;

// Пагинация
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZES: [10, 20, 50, 100],
  MAX_PAGE_SIZE: 100,
} as const;

// Валидация
export const VALIDATION = {
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 100000,
  MIN_PRICE: 0.01,
  MAX_PRICE: 1000000,
  MIN_MATERIAL_QUANTITY: 0,
  MAX_MATERIAL_NAME_LENGTH: 255,
  MIN_PASSWORD_LENGTH: 6,
  MAX_PASSWORD_LENGTH: 100,
} as const;

// Форматы бумаги загружаются динамически из складского сервиса
// Стандартные форматы ISO (A4, A5, A6 и т.д.) определяются в formatUtils.ts

// Плотности бумаги загружаются динамически из складского сервиса
// Используйте: getPaperTypesFromWarehouse() из calculatorMaterialService

// Статусы заказов
export const ORDER_STATUSES = {
  NEW: { id: 1, name: 'Новый', color: '#9e9e9e' },
  IN_PRODUCTION: { id: 2, name: 'В производстве', color: '#1976d2' },
  READY_TO_SHIP: { id: 3, name: 'Готов к отправке', color: '#ffa000' },
  SHIPPED: { id: 4, name: 'Отправлен', color: '#7b1fa2' },
  COMPLETED: { id: 5, name: 'Завершён', color: '#2e7d32' },
} as const;

// Роли пользователей
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  VIEWER: 'viewer',
} as const;

// Права доступа
export const PERMISSIONS = {
  VIEW_ORDERS: ['admin', 'manager', 'viewer'],
  CREATE_ORDERS: ['admin', 'manager'],
  EDIT_ORDERS: ['admin', 'manager'],
  DELETE_ORDERS: ['admin'],
  VIEW_MATERIALS: ['admin', 'manager', 'viewer'],
  MANAGE_MATERIALS: ['admin', 'manager'],
  VIEW_REPORTS: ['admin', 'manager'],
  MANAGE_USERS: ['admin'],
  MANAGE_SETTINGS: ['admin'],
} as const;

// Время
export const TIME = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

// Cache TTL (Time To Live)
export const CACHE_TTL = {
  MATERIALS: 10 * TIME.MINUTE,
  ORDERS: 5 * TIME.MINUTE,
  USERS: 30 * TIME.MINUTE,
  PAPER_TYPES: 30 * TIME.MINUTE,
  SETTINGS: 60 * TIME.MINUTE,
} as const;

// Размеры файлов
export const FILE_SIZE = {
  MAX_UPLOAD_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200 MB
} as const;

// Форматы файлов
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

// UI настройки
export const UI = {
  TOAST_DURATION: 5000, // 5 секунд
  DEBOUNCE_DELAY: 300, // 300 мс
  ANIMATION_DURATION: 200, // 200 мс
  MOBILE_BREAKPOINT: 768, // px
  TABLET_BREAKPOINT: 1024, // px
} as const;

// Локальное хранилище ключи
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'crm_auth_token',
  USER_ROLE: 'crm_user_role',
  SESSION_DATE: 'crm_session_date',
  THEME: 'crm_theme',
  LANGUAGE: 'crm_language',
  PREFERENCES: 'crm_preferences',
} as const;
