// frontend/src/types/shared.ts
// Импортируем shared типы
export * from '../../../shared/types';

// Дополнительные типы, специфичные для frontend
export interface APP_CONFIG {
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

// Алиасы для совместимости с существующим кодом
export type Item = OrderItem;
export type UserRef = User;
