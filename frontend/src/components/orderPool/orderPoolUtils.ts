import { Order } from '../../types';

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

const READY_LABELS: Record<string, string> = {
  urgent: 'В течение 3 часов',
  promo: '48 часов',
  special: '4–5 дней',
  standard: '24 часа',
  online: '24 часа',
};

/** Смещение от оформления до готовности, если в позициях нет readyDate. */
const READY_OFFSET_MS: Record<string, number> = {
  urgent: 3 * 60 * 60 * 1000,
  promo: 48 * 60 * 60 * 1000,
  special: 5 * 24 * 60 * 60 * 1000,
  standard: 24 * 60 * 60 * 1000,
  online: 24 * 60 * 60 * 1000,
};

function getOrderPriceType(order: Order): string {
  const firstItem = (order.items ?? [])[0];
  const params = firstItem?.params as { priceType?: string; price_type?: string } | undefined;
  return String(params?.priceType ?? params?.price_type ?? 'standard').toLowerCase();
}

function getOrderCreatedAt(order: Order): string | undefined {
  return order.created_at ?? (order as { createdAt?: string }).createdAt;
}

/**
 * Парсит readyDate из params.
 * Строки без таймзоны (YYYY-MM-DDTHH:mm) раньше писались в UTC сервера —
 * интерпретируем их как UTC, иначе в UTC+3 готовность «уезжает» назад.
 */
function parseItemReadyDateMs(raw: string): number {
  const s = String(raw).trim();
  if (!s) return NaN;
  // datetime-local / без Z: считаем UTC (как писал Railway)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const utc = Date.parse(s.length === 16 ? `${s}:00Z` : `${s}Z`);
    if (Number.isFinite(utc)) return utc;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Макс. readyDate из позиций или расчёт от даты оформления по SLA. */
export function resolveOrderReadyAt(order: Order): Date | null {
  const created = getOrderCreatedAt(order);
  const createdMs = created ? new Date(created).getTime() : NaN;
  const priceType = getOrderPriceType(order);
  const offset = READY_OFFSET_MS[priceType] ?? READY_OFFSET_MS.standard;
  const fromSla =
    Number.isFinite(createdMs) ? new Date(createdMs + offset) : null;

  const fromItems = (order.items ?? [])
    .map((item) => {
      const raw = (item.params as { readyDate?: string } | undefined)?.readyDate;
      if (!raw) return NaN;
      return parseItemReadyDateMs(raw);
    })
    .filter((t) => Number.isFinite(t));

  if (fromItems.length > 0) {
    const maxReadyMs = Math.max(...fromItems);
    if (Number.isFinite(createdMs) && fromSla) {
      // Готовность раньше оформления (частый баг TZ без Z)
      if (maxReadyMs < createdMs) return fromSla;
      // Старый бэкенд писал +1ч без таймзоны при подписи «24 часа»
      const TWO_H = 2 * 60 * 60 * 1000;
      if (offset >= 24 * 60 * 60 * 1000 && maxReadyMs - createdMs < TWO_H) {
        return fromSla;
      }
    }
    return new Date(maxReadyMs);
  }

  return fromSla;
}

export function getOrderReadyLabel(order: Order): {
  label: string;
  hint?: string;
  readyAt: Date | null;
  readyAtLabel: string;
} {
  const priceType = getOrderPriceType(order);
  const label = READY_LABELS[priceType] ?? READY_LABELS.standard;
  const readyAt = resolveOrderReadyAt(order);
  const readyAtLabel = formatPoolDateTimeFull(readyAt?.toISOString());
  return { label, readyAt, readyAtLabel };
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
