/**
 * Выдача заказа по счёту: когда не выдумывать offline/cash поверх безнала.
 * d7bea51b закрыл случай без order prepaid (только legal_payments).
 * Здесь — частичный /prepay bank + legal_payments, уже сводящие баланс юрлица в 0
 * (карточка показывает «оплачен» через entitySettled).
 */

import { getLegalLedger } from '../services/legalLedgerService'
import { issueCashRemainder, shouldSkipOfflineIssueSeal } from './orderAmounts'

const SETTLED_EPS = 0.004

export type InvoiceIssueOrder = {
  id?: number | string | null
  payment_channel?: string | null
  paymentChannel?: string | null
  prepaymentAmount?: number | string | null
  prepaymentStatus?: string | null
  paymentMethod?: string | null
  customer_id?: number | string | null
  customerId?: number | string | null
}

export type InvoiceIssueSettlement = {
  skipOfflineSeal: boolean
  remainder: number
}

function invoiceChannel(order: InvoiceIssueOrder): boolean {
  return String(order.payment_channel ?? order.paymentChannel ?? '')
    .trim()
    .toLowerCase() === 'invoice'
}

/**
 * Остаток в кассу и нужно ли запечатать offline при выдаче.
 * Если баланс юрлица уже ≤ 0 (bank + поступления), остаток 0 и prepaid не трогаем —
 * иначе debt_closed раздует кассу, а bump prepaid → двойной кредит в акте сверки.
 */
export async function resolveInvoiceIssueSettlement(
  order: InvoiceIssueOrder,
  totalAmount: number,
): Promise<InvoiceIssueSettlement> {
  if (shouldSkipOfflineIssueSeal(order)) {
    return { skipOfflineSeal: true, remainder: 0 }
  }

  const remainder = issueCashRemainder(totalAmount, order)
  if (!invoiceChannel(order) || remainder <= SETTLED_EPS) {
    return { skipOfflineSeal: false, remainder }
  }

  const customerId = Number(order.customer_id ?? order.customerId)
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return { skipOfflineSeal: false, remainder }
  }

  try {
    const ledger = await getLegalLedger(customerId, Number(order.id) || null)
    if (Number(ledger.balance) <= SETTLED_EPS) {
      return { skipOfflineSeal: true, remainder: 0 }
    }
  } catch {
    // Не юрлицо / нет таблицы поступлений — оставляем обычный остаток.
  }

  return { skipOfflineSeal: false, remainder }
}
