import { useState, useEffect } from 'react';
import { getOrderStatuses } from '../api';

export interface OrderStatus {
  id: number;
  name: string;
  color?: string;
  sort_order: number;
  code?: string | null;
}

const POOL_NAMES = new Set(['Ожидает', 'Оформлен']);

/** Пул: status 0 и строки «Ожидает» / «Оформлен». Пока справочник не загружен — ещё и id 1. */
export function isPoolOrderStatusId(statusId: number): boolean {
  const id = Number(statusId);
  if (id === 0) return true;
  if (!_cache || _cache.length === 0) return id === 1;
  const row = _cache.find((status) => status.id === id);
  if (!row) return false;
  if (row.code === 'waiting' || row.code === 'placed') return true;
  return POOL_NAMES.has(row.name);
}

type StatusRef = { id: number; name: string; code?: string | null }

/** Просчёт: status 0, code waiting или имя «Ожидает». «Оформлен» учитывается. */
export function isWaitingOrder(
  order: {
    status?: number | string | null
    status_name?: string | null
    statusName?: string | null
    status_code?: string | null
  },
  statuses?: StatusRef[] | null,
): boolean {
  const name = String(order.status_name ?? order.statusName ?? '').trim()
  if (name === 'Ожидает') return true
  const code = String(order.status_code ?? '').trim()
  if (code === 'waiting') return true
  const id = Number(order.status)
  if (id === 0) return true
  const list = statuses ?? _cache ?? []
  const row = list.find((status) => status.id === id)
  if (!row) return false
  if (row.code === 'waiting') return true
  return row.name === 'Ожидает'
}

/** Выдан: строка «Завершён» или прежний номер 7. */
export function isCompletedOrderStatusId(statusId: number): boolean {
  const id = Number(statusId);
  if (id === 7) return true;
  const row = _cache?.find((status) => status.id === id);
  if (!row) return false;
  return row.code === 'completed' || row.name === 'Завершён';
}

export function completedOrderStatusId(): number {
  const row = _cache?.find((status) => status.code === 'completed' || status.name === 'Завершён');
  return row?.id ?? 7;
}

let _cache: OrderStatus[] | null = null;
let _promise: Promise<OrderStatus[]> | null = null;

async function fetchStatuses(): Promise<OrderStatus[]> {
  if (_cache) return _cache;
  if (!_promise) {
    _promise = getOrderStatuses()
      .then(res => {
        _cache = Array.isArray(res.data) ? res.data : [];
        return _cache;
      })
      .catch(() => {
        _promise = null;
        return [];
      });
  }
  return _promise;
}

/**
 * Единый источник статусов заказов из /api/order-statuses.
 * Данные кэшируются на время сессии — повторные вызовы не делают запросы.
 */
export function useOrderStatuses() {
  const [statuses, setStatuses] = useState<OrderStatus[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) {
      setStatuses(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStatuses().then(data => {
      setStatuses(data);
      setLoading(false);
    });
  }, []);

  const getById = (id: number): OrderStatus | undefined =>
    statuses.find(s => s.id === id);

  const getName = (id: number, fallback = '—'): string =>
    getById(id)?.name ?? fallback;

  const getColor = (id: number, fallback = '#9e9e9e'): string =>
    getById(id)?.color ?? fallback;

  return { statuses, loading, getById, getName, getColor };
}
