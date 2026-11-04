/** Коды справочника заказов. Цвет штампа берётся отсюда, не из status.color. */
export const ORDER_STATUS_CODES = [
  'waiting',
  'placed',
  'in_work',
  'done',
  'at_pickup',
  'picked_up',
  'completed',
  'cancelled',
] as const;

export type OrderStatusCode = (typeof ORDER_STATUS_CODES)[number];

/** Шкала StatusTrack: отмена в шаги не входит. */
export const ORDER_TRACK_CODES: OrderStatusCode[] = [
  'waiting',
  'placed',
  'in_work',
  'done',
  'at_pickup',
  'picked_up',
  'completed',
];

const TRACK_NAMES: Record<OrderStatusCode, string> = {
  waiting: 'Ожидает',
  placed: 'Оформлен',
  in_work: 'Принят в работу',
  done: 'Выполнен',
  at_pickup: 'Передан в ПВЗ',
  picked_up: 'Получен в ПВЗ',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

const NAME_TO_CODE: Record<string, OrderStatusCode> = {
  ожидает: 'waiting',
  оформлен: 'placed',
  'принят в работу': 'in_work',
  выполнен: 'done',
  'передан в пвз': 'at_pickup',
  'получен в пвз': 'picked_up',
  завершен: 'completed',
  отменен: 'cancelled',
};

export interface OrderStatusRef {
  id?: number;
  name?: string;
  code?: string | null;
  sort_order?: number;
  color?: string;
}

export function orderStatusCodeName(code: OrderStatusCode): string {
  return TRACK_NAMES[code];
}

export function normalizeOrderStatusCode(code: string | null | undefined): OrderStatusCode | null {
  const value = String(code ?? '').trim();
  return (ORDER_STATUS_CODES as readonly string[]).includes(value) ? (value as OrderStatusCode) : null;
}

export function orderStatusCodeFromName(name: string | null | undefined): OrderStatusCode | null {
  const key = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
  return NAME_TO_CODE[key] ?? null;
}

export function resolveOrderStatusCode(
  status: OrderStatusRef | null | undefined,
  statuses?: OrderStatusRef[] | null,
): OrderStatusCode | null {
  const direct = normalizeOrderStatusCode(status?.code);
  if (direct) return direct;
  const byName = orderStatusCodeFromName(status?.name);
  if (byName) return byName;
  if (status?.id != null && statuses) {
    const row = statuses.find((item) => item !== status && Number(item.id) === Number(status.id));
    if (row) return resolveOrderStatusCode(row);
  }
  return null;
}

export function orderStatusStampCode(
  status: OrderStatusRef | null | undefined,
  statuses: OrderStatusRef[] | null | undefined,
  onlineCancelled: boolean,
): OrderStatusCode | null {
  if (onlineCancelled) return 'cancelled';
  return resolveOrderStatusCode(status, statuses);
}

export function orderStatusStampLabel(
  status: OrderStatusRef | null | undefined,
  code: OrderStatusCode | null,
  onlineCancelled: boolean,
): string {
  if (onlineCancelled) return 'Отменён (online)';
  const name = status?.name?.trim();
  if (name) return name;
  if (code) return orderStatusCodeName(code);
  return 'Статус';
}

export function formatOrderStatusDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
