import { useState, useEffect } from 'react';
import { getOrderStatuses } from '../api';

export interface OrderStatus {
  id: number;
  name: string;
  color?: string;
  sort_order: number;
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
