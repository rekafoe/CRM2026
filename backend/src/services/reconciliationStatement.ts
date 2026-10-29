import { collectedPrepaymentAmount } from '../utils/orderAmounts'

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Календарный день как в кассе: первые 10 символов сохранённой даты, без сдвига зоны. */
export function reconciliationCalendarDate(value: string | null | undefined): string {
  if (value == null) return ''
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value).trim())
  return match ? match[1] : ''
}

export type ReconciliationSourceOrder = {
  id: number
  number: string
  orderDate: string
  total: number
  collected: number
  paymentDate: string | null
}

export type ReconciliationLine = {
  date: string
  document: string
  debit: number
  credit: number
  balance: number
  orderId: number
}

export type ReconciliationStatement = {
  periodFrom: string | null
  periodTo: string | null
  openingBalance: number
  lines: ReconciliationLine[]
  debitTurnover: number
  creditTurnover: number
  closingBalance: number
}

export function formatReconciliationDate(iso: string | null | undefined): string {
  const day = reconciliationCalendarDate(iso)
  if (!day) return ''
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

export function reconciliationPeriodLabel(from: string | null, to: string | null): string {
  if (from && to) return `с ${formatReconciliationDate(from)} по ${formatReconciliationDate(to)}`
  if (from) return `с ${formatReconciliationDate(from)}`
  if (to) return `по ${formatReconciliationDate(to)}`
  return 'за всё время'
}

export function reconciliationBalancePhrase(balance: number): string {
  const amount = Math.abs(round2(balance)).toFixed(2).replace('.', ',')
  if (balance > 0.004) return `Задолженность заказчика ${amount} бел. руб.`
  if (balance < -0.004) return `Переплата заказчика ${amount} бел. руб.`
  return 'Задолженность отсутствует.'
}

function inPeriod(date: string, from: string | null, to: string | null): boolean {
  if (!date) return false
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

/**
 * Акт сверки по заказам клиента.
 * Дебет — сумма заказа в день заказа. Кредит — уже полученная оплата в день её сохранения.
 * По одному заказу одна строка оплаты: CRM хранит текущую сумму, а не цепочку платежей.
 */
export function buildReconciliationStatement(
  orders: ReconciliationSourceOrder[],
  period: { from?: string | null; to?: string | null } = {},
): ReconciliationStatement {
  const from = reconciliationCalendarDate(period.from) || null
  const to = reconciliationCalendarDate(period.to) || null
  let openingBalance = 0
  const movements: Array<Omit<ReconciliationLine, 'balance'> & { sort: number }> = []

  for (const order of orders) {
    const total = round2(order.total)
    const collected = round2(order.collected)
    const label = order.number?.trim() || `#${order.id}`
    if (total > 0) {
      if (from && order.orderDate && order.orderDate < from) {
        openingBalance = round2(openingBalance + total)
      } else if (inPeriod(order.orderDate, from, to)) {
        movements.push({
          date: order.orderDate,
          document: `Заказ ${label}`,
          debit: total,
          credit: 0,
          orderId: order.id,
          sort: 0,
        })
      }
    }
    if (collected > 0 && order.paymentDate) {
      if (from && order.paymentDate < from) {
        openingBalance = round2(openingBalance - collected)
      } else if (inPeriod(order.paymentDate, from, to)) {
        movements.push({
          date: order.paymentDate,
          document: `Оплата по заказу ${label}`,
          debit: 0,
          credit: collected,
          orderId: order.id,
          sort: 1,
        })
      }
    }
  }

  movements.sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort || a.orderId - b.orderId)
  let balance = openingBalance
  const lines: ReconciliationLine[] = movements.map((movement) => {
    balance = round2(balance + movement.debit - movement.credit)
    return {
      date: movement.date,
      document: movement.document,
      debit: movement.debit,
      credit: movement.credit,
      balance,
      orderId: movement.orderId,
    }
  })
  const debitTurnover = round2(lines.reduce((sum, line) => sum + line.debit, 0))
  const creditTurnover = round2(lines.reduce((sum, line) => sum + line.credit, 0))

  return {
    periodFrom: from,
    periodTo: to,
    openingBalance,
    lines,
    debitTurnover,
    creditTurnover,
    closingBalance: round2(openingBalance + debitTurnover - creditTurnover),
  }
}

/** Заказ CRM → строка сверки. Ожидающая ссылка на оплату кредитом не становится. */
export function reconciliationSourceFromOrder(order: {
  id: number
  number?: string | null
  created_at?: string | null
  totalAmount?: number | null
  prepaymentAmount?: number | string | null
  prepaymentStatus?: string | null
  paymentMethod?: string | null
  prepaymentUpdatedAt?: string | null
}): ReconciliationSourceOrder {
  const collected = collectedPrepaymentAmount(order)
  const orderDate = reconciliationCalendarDate(order.created_at)
  const paymentDate = collected > 0
    ? reconciliationCalendarDate(order.prepaymentUpdatedAt) || orderDate || null
    : null
  return {
    id: order.id,
    number: order.number?.trim() || `#${order.id}`,
    orderDate,
    total: round2(Number(order.totalAmount) || 0),
    collected,
    paymentDate,
  }
}
