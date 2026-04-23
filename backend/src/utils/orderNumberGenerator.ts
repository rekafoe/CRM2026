/**
 * Генератор номеров заказов
 */

/** Префикс публичного номера по `orders.source` (OrderService.createOrder). Заказы из CRM — `ORD`. */
const SOURCE_ORDER_NUMBER_PREFIX: Record<string, string> = {
  website: 'WEB',
  mini_app: 'MAP',
  telegram: 'TG',
  crm: 'ORD',
}

/**
 * Номер заказа после INSERT: `{ПРЕФИКС}-{id}` (id с ведущими нулями, мин. 4 знака).
 * Неизвестный source → `ORD`.
 */
export function buildOrderNumberFromSourceAndId(
  source: string | null | undefined,
  id: number
): string {
  const key = String(source || 'crm').toLowerCase().trim()
  const prefix = SOURCE_ORDER_NUMBER_PREFIX[key] ?? 'ORD'
  return `${prefix}-${String(id).padStart(4, '0')}`
}

interface OrderNumberOptions {
  source: 'website' | 'telegram' | 'manual';
  year?: number;
}

/**
 * Генерирует красивый номер заказа
 */
export function generateOrderNumber(options: OrderNumberOptions): string {
  const { source, year = new Date().getFullYear() } = options;
  
  switch (source) {
    case 'website':
      return `SW-${year}-${generateSequenceNumber()}`;
    case 'telegram':
      return `TG-${year}-${generateSequenceNumber()}`;
    case 'manual':
      return `MN-${year}-${generateSequenceNumber()}`;
    default:
      return `ORD-${year}-${generateSequenceNumber()}`;
  }
}

/**
 * Генерирует последовательный номер (001, 002, 003...)
 */
function generateSequenceNumber(): string {
  // В реальном приложении здесь бы был запрос к БД для получения следующего номера
  // Пока используем timestamp для уникальности
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const sequence = (timestamp % 1000) + random;
  return sequence.toString().padStart(3, '0');
}

/**
 * Парсит номер заказа и возвращает информацию о нем
 */
export function parseOrderNumber(orderNumber: string): {
  source: string;
  year: number;
  sequence: string;
  isValid: boolean;
} {
  const match = orderNumber.match(/^([A-Z]{2})-(\d{4})-(\d{3})$/);
  
  if (!match) {
    return {
      source: 'unknown',
      year: 0,
      sequence: '000',
      isValid: false
    };
  }
  
  const [, source, year, sequence] = match;
  
  return {
    source: source === 'SW' ? 'website' : source === 'TG' ? 'telegram' : 'manual',
    year: parseInt(year, 10),
    sequence,
    isValid: true
  };
}
