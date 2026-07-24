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
};

export function getOrderReadyLabel(order: Order): {
  label: string;
  hint?: string;
} {
  const created = order.created_at ?? (order as { createdAt?: string }).createdAt;
  const firstItem = (order.items ?? [])[0];
  const params = firstItem?.params as { priceType?: string; price_type?: string } | undefined;
  const priceType = String(params?.priceType ?? params?.price_type ?? 'standard').toLowerCase();
  const label = READY_LABELS[priceType] ?? READY_LABELS.standard;
  if (created && priceType !== 'standard') {
    return {
      label,
      hint: `с момента оформления ${new Date(created).toLocaleString('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
      })}`,
    };
  }
  return { label };
}

export function formatShortDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/** Дата для оператора: сегодня/вчера + время, иначе дд.мм. */
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
  if (dayDiff > 1 && dayDiff < 7) {
    return `${d.toLocaleDateString('ru-RU', { weekday: 'short' })} ${time}`;
  }
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${time}`;
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
