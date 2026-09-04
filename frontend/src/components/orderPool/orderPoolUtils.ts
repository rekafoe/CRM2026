import { Order } from '../../types';
import {
  getOrderGoverningSla,
  HOUR_SLA_MS,
  isHourSlaLabel,
  resolveOrderReadyAtMs,
} from '../../utils/orderReadySla';

/** Ответственный в пуле: приоритет responsible_user_id, иначе legacy userId */
export function getEffectiveResponsibleUserId(order: Order): number | null {
  const raw = order.responsible_user_id ?? order.userId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getSourceLabel(source?: string): string {
  switch (source) {
    case 'website':
      return 'Онлайн';
    case 'telegram':
      return 'Telegram';
    case 'crm':
      return 'CRM';
    case 'mini_app':
      return 'Mini App';
    default:
      return 'Неизвестно';
  }
}

export type PoolFulfillmentChip = {
  label: string;
  title: string;
  /** pickup — клиент заберёт в павильоне; shipping — почта/курьер. */
  variant: 'pickup' | 'shipping' | 'other';
  /** Короткое имя точки или способа: Океан, Европочта, EMS. */
  pointName: string;
  kicker: string;
};

export function poolFulfillmentShowsBanner(chip: PoolFulfillmentChip | null | undefined): chip is PoolFulfillmentChip {
  return chip != null && (chip.variant === 'pickup' || chip.variant === 'shipping');
}

function sanitizeDeliveryLabel(value: string | null | undefined): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const withoutPickupCodeTail = raw
    .replace(/\s*\(\s*pickup-[^)]+\s*\)\s*$/i, '')
    .trim();
  if (withoutPickupCodeTail) return withoutPickupCodeTail;
  if (/^pickup-[a-z0-9_-]+$/i.test(raw)) return '';
  return raw;
}

function shortPavilionName(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const lower = String(raw || '').trim().toLowerCase();
    if (!lower) continue;
    if (
      lower.includes('океан') ||
      lower === 'ocean' ||
      lower.includes('pickup-dzerzhinskogo-3b')
    ) {
      return 'Океан';
    }
    if (
      lower.includes('титан') ||
      lower === 'titan' ||
      lower.includes('pickup-dzerzhinskogo-104')
    ) {
      return 'Титан';
    }
  }
  return null;
}

function chip(
  label: string,
  title: string,
  variant: PoolFulfillmentChip['variant'],
  pointName: string,
  kicker: string,
): PoolFulfillmentChip {
  return { label, title, variant, pointName, kicker };
}

/**
 * Способ выдачи для карточки пула.
 * Самовывоз павильона определяем по delivery.kind/лейблу, а не по коду точки
 * (у курьерских заказов код тоже может быть pickup-…).
 */
export function getPoolFulfillmentChip(order: Order): PoolFulfillmentChip | null {
  const delivery = order.delivery;
  const deptName = String(order.fulfillment_department_name || '').trim();
  const deptCode = String(order.fulfillment_department_code || '').trim();
  const kind = String(delivery?.kind || '').toLowerCase();
  const labelRaw = String(delivery?.label || '').trim();
  const labelDisplay = sanitizeDeliveryLabel(labelRaw);
  const providerId = String(delivery?.providerId || '').trim();
  const address = typeof delivery?.address === 'string' ? delivery.address.trim() : '';
  const deliveryHaystack = `${kind} ${labelRaw} ${providerId}`.toLowerCase();
  const haystack = `${deliveryHaystack} ${deptName} ${deptCode}`.toLowerCase();
  const pavilion = shortPavilionName(deptName, deptCode, labelDisplay, providerId, address);
  const pickupPointName = pavilion || deptName || labelDisplay || address;
  const title =
    address ||
    labelDisplay ||
    deptName ||
    (delivery?.description ? String(delivery.description) : '') ||
    'Способ получения';

  if (
    haystack.includes('европочт') ||
    haystack.includes('evropocht') ||
    providerId.toLowerCase().includes('euro')
  ) {
    return chip('Европочта', title, 'shipping', 'Европочта', 'Доставка');
  }
  if (
    haystack.includes('белпочт') ||
    haystack.includes('belpoch') ||
    providerId.toLowerCase().includes('belpost') ||
    (deliveryHaystack.includes('почт') && !deliveryHaystack.includes('евро'))
  ) {
    return chip('Белпочта', title, 'shipping', 'Белпочта', 'Доставка');
  }
  if (
    /(?:^|[^a-zа-я])(?:ems|емс)(?:$|[^a-zа-я])/i.test(`${deliveryHaystack} ${providerId}`) ||
    providerId.toLowerCase().includes('ems')
  ) {
    return chip('EMS', title, 'shipping', 'EMS', 'Доставка');
  }
  if (kind === 'courier_minsk' || (deliveryHaystack.includes('курьер') && deliveryHaystack.includes('минск'))) {
    return chip('Курьер Минск', title, 'shipping', 'Курьер по Минску', 'Доставка');
  }
  if (
    kind === 'courier_country' ||
    deliveryHaystack.includes('курьер') ||
    deliveryHaystack.includes('courier')
  ) {
    return chip('Курьер РБ', title, 'shipping', 'Курьер по РБ', 'Доставка');
  }
  if (kind === 'pickup_point' || deliveryHaystack.includes('пункт выдачи')) {
    const name = labelDisplay || 'Пункт выдачи';
    return chip(name, title, 'shipping', name, 'Доставка');
  }

  const isStorePickup =
    kind === 'pickup' ||
    deliveryHaystack.includes('самовывоз') ||
    (String(order.source) === 'website' && Boolean(deptName) && (!kind || kind === 'pickup'));

  if (isStorePickup) {
    const pointName = pickupPointName || 'точка не указана';
    const label = pavilion
      ? `Самовывоз ${pavilion}`
      : deptName
        ? `Самовывоз ${deptName}`
        : 'Самовывоз';
    return chip(label, title, 'pickup', pointName, 'Клиент заберёт');
  }

  if (labelDisplay) {
    return chip(labelDisplay, title, 'other', labelDisplay, 'Получение');
  }
  if (deptName) {
    return chip(deptName, deptName, 'other', deptName, 'Точка');
  }
  if (delivery) {
    return chip('Доставка', title, 'shipping', labelDisplay || 'Доставка', 'Доставка');
  }
  return null;
}

/** Макс. readyDate из позиций или расчёт от даты оформления по SLA сайта/CRM. */
export function resolveOrderReadyAt(order: Order): Date | null {
  const ms = resolveOrderReadyAtMs(order);
  return ms != null ? new Date(ms) : null;
}

export function getOrderReadyLabel(order: Order): {
  label: string;
  hint?: string;
  readyAt: Date | null;
  readyAtLabel: string;
  isHourSla: boolean;
} {
  const sla = getOrderGoverningSla(order.items, order.source);
  const readyAt = resolveOrderReadyAt(order);
  const readyAtLabel = formatPoolDateTimeFull(readyAt?.toISOString());
  return {
    label: sla.label,
    readyAt,
    readyAtLabel,
    isHourSla: sla.offsetMs <= HOUR_SLA_MS || isHourSlaLabel(sla.label),
  };
}

export function formatShortDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/** Полная дата с часами: дд.мм.гггг, чч:мм */
export function formatPoolDateTimeFull(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Компактно для списка: сегодня/вчера + время, иначе дд.мм.гггг, чч:мм */
export function formatPoolDateTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startToday - startThat) / 86400000);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return `сегодня ${time}`;
  if (dayDiff === 1) return `вчера ${time}`;
  return formatPoolDateTimeFull(value);
}

export const ORDER_POOL_SEARCH_LIMIT = 500;

export type OrderPoolFilterCounts = {
  notAssigned: number;
  assigned: number;
  cancelled: number;
  debt: number;
  prepay: number;
  awaitingPayment: number;
};

export type FilterState = {
  source: 'all' | 'crm' | 'website' | 'telegram' | 'mini_app';
  cancelled: 'all' | 'cancelled' | 'not_cancelled';
  assigned: 'all' | 'assigned' | 'not_assigned';
  searchInput: string;
  searchTerm: string;
  quickFilter: 'debt' | 'prepay' | 'awaiting_payment' | null;
  sortBy: 'created_at' | 'number' | 'totalAmount';
  sortDirection: 'asc' | 'desc';
  visibleCount: number;
};

export type FilterAction =
  | { type: 'setSource'; value: FilterState['source'] }
  | { type: 'setCancelled'; value: FilterState['cancelled'] }
  | { type: 'setAssigned'; value: FilterState['assigned'] }
  | { type: 'setSearchInput'; value: string }
  | { type: 'setSearchTerm'; value: string }
  | { type: 'setQuickFilter'; value: FilterState['quickFilter'] }
  | { type: 'setSortBy'; value: FilterState['sortBy'] }
  | { type: 'toggleSortDirection' }
  | { type: 'resetFilters' }
  | { type: 'resetVisible' }
  | { type: 'increaseVisible'; step?: number };

export const initialOrderPoolFilters: FilterState = {
  source: 'website',
  cancelled: 'not_cancelled',
  assigned: 'not_assigned',
  searchInput: '',
  searchTerm: '',
  quickFilter: null,
  sortBy: 'created_at',
  sortDirection: 'desc',
  visibleCount: 100,
};

export function orderPoolFiltersReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'setSource':
      return { ...state, source: action.value };
    case 'setCancelled':
      return { ...state, cancelled: action.value };
    case 'setAssigned':
      return { ...state, assigned: action.value };
    case 'setSearchInput':
      return { ...state, searchInput: action.value };
    case 'setSearchTerm':
      return { ...state, searchTerm: action.value };
    case 'setQuickFilter':
      return { ...state, quickFilter: action.value };
    case 'setSortBy':
      return { ...state, sortBy: action.value };
    case 'toggleSortDirection':
      return { ...state, sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' };
    case 'resetFilters':
      return {
        ...state,
        source: initialOrderPoolFilters.source,
        cancelled: initialOrderPoolFilters.cancelled,
        assigned: initialOrderPoolFilters.assigned,
        searchInput: '',
        searchTerm: '',
        quickFilter: null,
      };
    case 'resetVisible':
      return { ...state, visibleCount: 100 };
    case 'increaseVisible':
      return { ...state, visibleCount: state.visibleCount + (action.step ?? 100) };
    default:
      return state;
  }
}
