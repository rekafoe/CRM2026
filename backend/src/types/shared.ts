// backend/src/types/shared.ts
// Импортируем shared типы
export * from '../../../shared/types';

// Дополнительные типы, специфичные для backend
export interface DatabaseConfig {
  client: string;
  connection: {
    filename: string;
  };
  migrations: {
    directory: string;
  };
  seeds: {
    directory: string;
  };
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  upload: {
    dest: string;
    limits: {
      fileSize: number;
    };
  };
}

export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'simple';
  transports: Array<{
    type: 'console' | 'file';
    filename?: string;
  }>;
}

// Алиасы для совместимости с существующим кодом
export type Item = {
  id: number;
  orderId: number;
  type: string;
  params: string;
  price: number;
  quantity: number;
  printerId: number | null;
  sides: number;
  sheets: number;
  waste: number;
  clicks: number;
};
