/**
 * Поля предоплаты при INSERT заказа (OrderService.createOrder).
 *
 * Website / mini_app не должны принимать client `prepaymentAmount` как уже собранные деньги:
 * оплата фиксируется только через BePaid webhook, confirm-prepayment или ручное действие в CRM.
 * CRM/telegram с amount > 0 по-прежнему помечаются paid (оператор / бот явно указали сумму).
 */
export function planCreateOrderPrepayment(input: {
  source?: string | null
  prepaymentAmount?: number | null
  paymentMethodHint?: 'online' | 'offline' | null
}): {
  prepaymentAmount: number
  /** 'paid' | 'pending' — выставить статус; null — колонку статуса не трогать */
  prepaymentStatus: 'paid' | 'pending' | null
  /**
   * 'online' | 'offline' — выставить метод;
   * null — явно NULL (offline hint);
   * undefined — колонку не трогать (CRM без hint → SQLite DEFAULT)
   */
  paymentMethod: 'online' | 'offline' | null | undefined
  stampPrepaymentUpdatedAt: boolean
} {
  const source = String(input.source ?? 'crm')
  const remote = source === 'website' || source === 'mini_app'
  const hint = input.paymentMethodHint ?? null
  const raw = Number(input.prepaymentAmount || 0)
  const trustedAmount = !remote && Number.isFinite(raw) && raw > 0 ? raw : 0

  if (trustedAmount > 0) {
    return {
      prepaymentAmount: trustedAmount,
      prepaymentStatus: 'paid',
      paymentMethod: hint === 'online' ? 'online' : 'offline',
      stampPrepaymentUpdatedAt: true,
    }
  }
  if (hint === 'online') {
    return {
      prepaymentAmount: 0,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      stampPrepaymentUpdatedAt: true,
    }
  }
  if (hint === 'offline') {
    return {
      prepaymentAmount: 0,
      prepaymentStatus: null,
      paymentMethod: null,
      stampPrepaymentUpdatedAt: false,
    }
  }
  return {
    prepaymentAmount: 0,
    prepaymentStatus: null,
    paymentMethod: undefined,
    stampPrepaymentUpdatedAt: false,
  }
}
