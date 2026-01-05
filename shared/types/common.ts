// Общие типы и утилиты

// Базовые типы
export type ID = number | string;

export type Status = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';

export type Role = 'admin' | 'user' | 'manager';

export type Theme = 'light' | 'dark';

export type Currency = 'BYN' | 'USD' | 'EUR' | 'RUB';

// Типы для UI
export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface TableColumn<T = any> {
  key: keyof T;
  title: string;
  width?: string | number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, record: T) => any;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
  value: any;
}

// Типы для форм
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'date';
  required?: boolean;
  placeholder?: string;
  options?: SelectOption[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    message?: string;
  };
}

export interface FormState<T = any> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  isValid: boolean;
}

// Типы для модальных окон
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closable?: boolean;
}

// Типы для уведомлений
export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Типы для навигации
export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  children?: NavigationItem[];
  permissions?: string[];
}

// Типы для конфигурации
export interface AppSettings {
  theme: Theme;
  language: string;
  currency: Currency;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  notifications: {
    email: boolean;
    push: boolean;
    sound: boolean;
  };
  privacy: {
    analytics: boolean;
    cookies: boolean;
  };
}

// Типы для валидации
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

// Типы для API состояний
export interface ApiState<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

// Типы для кэширования
export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

// Типы для логирования
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  context?: any;
  userId?: number;
  sessionId?: string;
}

// Типы для метрик
export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

// Типы для событий
export interface Event {
  type: string;
  payload: any;
  timestamp: number;
  userId?: number;
  sessionId?: string;
}

// Утилитарные типы
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type NonNullable<T> = T extends null | undefined ? never : T;

// Типы для React
export interface ComponentProps {
  className?: string;
  style?: any;
  children?: any;
}

export interface LoadingProps extends ComponentProps {
  loading: boolean;
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

export interface ErrorProps extends ComponentProps {
  error: string | null;
  onRetry?: () => void;
  showRetry?: boolean;
}
