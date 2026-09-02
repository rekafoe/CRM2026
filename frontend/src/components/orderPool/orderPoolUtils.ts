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
};

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

/**
 * Компактная сноска способа выдачи на закрытой карточке пула.
 * Павильоны: Океан / Титан (и др. departments) — не конкуренты.
 */
export function getPoolFulfillmentChip(order: Order): PoolFulfillmentChip | null {
  const delivery = order.delivery;
  const deptName = String(order.fulfillment_department_name || '').trim();
  const deptCode = String(order.fulfillment_department_code || '').trim();
  const kind = String(delivery?.kind || '').toLowerCase();
  const labelRaw = String(delivery?.label || '').trim();
  const labelDisplay = sanitizeDeliveryLabel(labelRaw);
  const providerId = String(delivery?.providerId || '').trim();
  const haystack = `${kind} ${labelRaw} ${providerId} ${deptName} ${deptCode}`.toLowerCase();

  const title =
    labelDisplay ||
    deptName ||
    (delivery?.description ? String(delivery.description) : '') ||
    'Способ получения';

  const pavilionMatch = (): string | null => {
    const candidates = [deptName, deptCode, labelDisplay, providerId]
      .map((s) => s.trim())
      .filter(Boolean);
    for (const c of candidates) {
      const lower = c.toLowerCase();
      if (lower.includes('океан') || lower === 'ocean') return 'Самовывоз Океан';
      if (lower.includes('титан') || lower === 'titan') return 'Самовывоз Титан';
    }
    if (kind === 'pickup' || haystack.includes('самовывоз') || haystack.includes('pickup')) {
      if (deptName) return `Самовывоз ${deptName}`;
      return 'Самовывоз';
    }
    return null;
  };

  if (
    haystack.includes('европочт') ||
    haystack.includes('evropocht') ||
    providerId.toLowerCase().includes('euro')
  ) {
    return { label: 'Европочта', title };
  }
  if (
    haystack.includes('белпочт') ||
    haystack.includes('belpoch') ||
    providerId.toLowerCase().includes('belpost')
  ) {
    return { label: 'Белпочта', title };
  }
  if (kind === 'courier_minsk' || (haystack.includes('курьер') && haystack.includes('минск'))) {
    return { label: 'Курьер Минск', title };
  }
  if (
    kind === 'courier_country' ||
    haystack.includes('курьер') ||
    haystack.includes('courier')
  ) {
    return { label: 'Курьер РБ', title };
  }
  if (kind === 'pickup_point' || haystack.includes('пункт выдачи')) {
    if (haystack.includes('европочт')) return { label: 'Европочта', title };
    if (haystack.includes('белпочт')) return { label: 'Белпочта', title };
    return { label: labelDisplay || 'Пункт выдачи', title };
  }

  const pickup = pavilionMatch();
  if (pickup) return { label: pickup, title };

  if (labelDisplay) {
    return { label: labelDisplay, title };
  }
  if (deptName) {
    return { label: deptName, title: deptName };
  }
  if (delivery) {
    return { label: 'Доставка', title };
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
