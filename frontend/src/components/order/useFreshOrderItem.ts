import { useEffect, useState } from 'react';

type Listener = (itemId: number) => boolean;

let pendingId: number | null = null;
const listeners = new Set<Listener>();

/** После «Добавить в заказ» прокрутить список к новой строке. */
export function requestOrderItemFocus(itemId: number): void {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return;
  let consumed = false;
  listeners.forEach((listener) => {
    if (listener(id)) consumed = true;
  });
  pendingId = consumed ? null : id;
}

function takePending(ids: number[]): number | null {
  if (pendingId == null || !ids.includes(pendingId)) return null;
  const id = pendingId;
  pendingId = null;
  return id;
}

export function useFreshOrderItem(orderId: number, itemIds: number[]): number | null {
  const [freshId, setFreshId] = useState<number | null>(null);
  const idsKey = itemIds.join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',').map((value) => Number(value)) : [];
    setFreshId(takePending(ids));

    const listener: Listener = (id) => {
      if (!ids.includes(id)) return false;
      setFreshId(id);
      return true;
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [orderId, idsKey]);

  return freshId;
}
