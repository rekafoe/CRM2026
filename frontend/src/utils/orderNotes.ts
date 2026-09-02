import type { Order } from '../types';

/** Список без колонки notes отдаёт null/undefined — не затираем уже известный текст. */
export function mergeOrderNotes<T extends { notes?: string | null }>(incoming: T, previous: T | undefined): T {
  if (!previous) return incoming;
  if (incoming.notes == null && previous.notes != null) {
    return { ...incoming, notes: previous.notes };
  }
  return incoming;
}

export function preserveOrderNotes(previous: Order[], incoming: Order[]): Order[] {
  if (previous.length === 0) return incoming;
  const prevById = new Map(previous.map((order) => [order.id, order]));
  return incoming.map((order) => mergeOrderNotes(order, prevById.get(order.id)));
}

export function mergeSelectedOrderFromList(previous: Order | null, list: Order[]): Order | null {
  if (!previous) return previous;
  const incoming = list.find((order) => order.id === previous.id);
  if (!incoming) return previous;
  return mergeOrderNotes(incoming, previous);
}
