import { isPaidPrepaymentStatus, parseNumberFlexible } from './numberInput';

export type PoolPaymentTone = 'paid' | 'pending' | 'failed' | 'debt' | 'none';

export type PoolPaymentInfo = {
  badge: string;
  tone: PoolPaymentTone;
  prepayLabel: string;
  showPrepayAmount: boolean;
  isOnline: boolean;
  isAwaitingOnlinePayment: boolean;
};

/** Статус оплаты для пула: BePaid / долг / без предоплаты. */
export function getPoolPaymentInfo(order: {
  paymentMethod?: string | null;
  prepaymentStatus?: string | null;
  prepaymentAmount?: string | number | null;
  debt?: number | null;
  totalAmount?: number | null;
}): PoolPaymentInfo {
  const method = String(order.paymentMethod ?? '').toLowerCase();
  const status = String(order.prepaymentStatus ?? '').toLowerCase();
  const prepay = parseNumberFlexible(order.prepaymentAmount ?? 0);
  const total =
    typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : 0;
  const debt =
    typeof order.debt === 'number' && Number.isFinite(order.debt)
      ? order.debt
      : Math.max(0, total - prepay);
  const isOnline = method === 'online';
  const isPaid = isPaidPrepaymentStatus(order.prepaymentStatus);

  if (isOnline && isPaid) {
    return {
      badge: 'BePaid · Оплачено',
      tone: 'paid',
      prepayLabel: 'Оплачено',
      showPrepayAmount: prepay > 0,
      isOnline: true,
      isAwaitingOnlinePayment: false,
    };
  }
  if (isOnline && status === 'failed') {
    return {
      badge: 'BePaid · Ошибка',
      tone: 'failed',
      prepayLabel: 'Ошибка оплаты',
      showPrepayAmount: false,
      isOnline: true,
      isAwaitingOnlinePayment: false,
    };
  }
  // Только явный pending — не любой unpaid online (у колонки DEFAULT 'online').
  if (isOnline && status === 'pending') {
    return {
      badge: 'BePaid · В процессе',
      tone: 'pending',
      prepayLabel: prepay > 0 ? 'Ожидает' : '0 · Ожидает',
      showPrepayAmount: true,
      isOnline: true,
      isAwaitingOnlinePayment: true,
    };
  }
  if (prepay > 0 && isPaid) {
    return {
      badge: 'Предоплата',
      tone: 'paid',
      prepayLabel: 'Оплачено',
      showPrepayAmount: true,
      isOnline: false,
      isAwaitingOnlinePayment: false,
    };
  }
  if (prepay > 0) {
    return {
      badge: method === 'offline' ? 'Оффлайн' : 'Предоплата',
      tone: 'pending',
      prepayLabel: 'Ожидает',
      showPrepayAmount: true,
      isOnline: false,
      isAwaitingOnlinePayment: false,
    };
  }
  if (debt > 0) {
    return {
      badge: 'Без предоплаты',
      tone: 'debt',
      prepayLabel: 'Нет',
      showPrepayAmount: false,
      isOnline: false,
      isAwaitingOnlinePayment: false,
    };
  }
  return {
    badge: '—',
    tone: 'none',
    prepayLabel: '—',
    showPrepayAmount: false,
    isOnline: false,
    isAwaitingOnlinePayment: false,
  };
}

export function isAwaitingOnlinePayment(order: {
  paymentMethod?: string | null;
  prepaymentStatus?: string | null;
}): boolean {
  return getPoolPaymentInfo(order).isAwaitingOnlinePayment;
}
